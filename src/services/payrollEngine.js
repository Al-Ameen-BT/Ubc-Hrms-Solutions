'use strict';

/**
 * The monthly payroll RUN — turns the per-employee live "estimated payslip"
 * preview (services/payslip.js, still used as-is for on-screen previews)
 * into a persisted, org-wide, immutable payroll register for one
 * organisation/year/month, that can then go through an approval workflow
 * and be exported as a bank disbursement file.
 *
 * A run's lines are a frozen snapshot: re-processing a PROCESSED run
 * recomputes every line from current master data (so fixing an employee's
 * record and re-running picks up the fix) and replaces the old lines
 * wholesale, but once a run is APPROVED it is locked — no further
 * processing, and no edits to its lines — matching the project's "never
 * rewrite pay history" rule already used for pay stages/fixation.
 */

const { sequelize, Organization, BankRuleCatalogue, Employee, PostCadre, PayScale, PayrollRun, PayrollRunLine, EmployeeBankAccount, EmployeeCompensationAssignment, OrganizationCatalogueAdoption } = require('../models');
const { Op } = require('sequelize');
const { getSettings } = require('./payrollSettings');
const loans = require('./loans');
const attendance = require('./attendance');
const { computePayslip } = require('./payslip');
const { applicableAllowancesFor } = require('./allowances');
const { round2 } = require('./loans');
const { createHash } = require('node:crypto');
const { segmentsForMonth } = require('./compensationResolver');
// Note: DA Arrears (services/arrears.js) is deliberately NOT wired into this
// engine. Arrears are paid out separately from salary — see arrears.js's
// header comment — so a payroll run never adds an arrears line to anyone's
// payslip, and approving a run has no effect on any ArrearsInstallment.

class PayrollEngineError extends Error {
  constructor(message, status) { super(message); this.status = status || 400; }
}

function monthKey(year, month) { return `${year}-${String(month).padStart(2, '0')}`; }

const LOCKED_STATUSES = ['APPROVED', 'PAID'];

async function payrollInputFingerprint(organizationId, year, month) {
  const models = require('../models');
  const employees = await models.Employee.findAll({ where: { organizationId }, order: [['id', 'ASC']], raw: true });
  const employeeIds = employees.map(row => row.id);
  const allowanceTypes = await models.AllowanceType.findAll({ where: { organizationId }, order: [['id', 'ASC']], raw: true });
  const scales = await models.PayScale.findAll({ where: { organizationId }, order: [['id', 'ASC']], raw: true });
  const rows = [await models.Organization.findByPk(organizationId, { raw: true }), employees, allowanceTypes, scales];
  const collect = async (Model, where) => rows.push(await Model.findAll({ where, order: [['id', 'ASC']], raw: true }));
  await collect(models.OrgPayrollSetting, { organizationId });
  await collect(models.PostCadre, { organizationId });
  await collect(models.PayStage, { payScaleId: { [Op.in]: scales.map(row => row.id) } });
  await collect(models.AllowanceTypePost, { allowanceTypeId: { [Op.in]: allowanceTypes.map(row => row.id) } });
  await collect(models.EmployeeAttendance, { employeeId: { [Op.in]: employeeIds }, year, month });
  await collect(models.EmployeeBankAccount, { employeeId: { [Op.in]: employeeIds } });
  for (const Model of [models.EmployeeFestivalAdvance, models.EmployeeOverdraft, models.EmployeeRecurringDeposit, models.EmployeeLic, models.EmployeeHousingLoan, models.EmployeeVehicleLoan]) {
    await collect(Model, { employeeId: { [Op.in]: employeeIds } });
  }
  await collect(models.EmployeeCompensationAssignment, { organizationId, status: 'APPROVED' });
  await collect(models.OrganizationCatalogueAdoption, { organizationId, status: 'APPROVED' });
  await collect(models.FinancialChangeProposal, { organizationId, status: 'APPROVED' });
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

/** Finds the current "live" run for an org/month (excludes REJECTED ones, which a fresh run supersedes), or null. */
async function findCurrentRun(organizationId, year, month) {
  return PayrollRun.findOne({
    where: { organizationId, year, month, status: ['PROCESSED', 'APPROVED', 'PAID'] },
    order: [['id', 'DESC']],
  });
}

/**
 * Processes (or re-processes) payroll for every ACTIVE employee of one
 * organisation for one calendar year/month. Creates a new PayrollRun if
 * none exists yet for that org/month; re-runs (replacing all lines) if one
 * exists and is still PROCESSED; refuses if the existing run has already
 * been APPROVED or PAID (or explicitly REJECTED, when a fresh run is what
 * should be started instead — call again after that and it opens a new
 * run, since a REJECTED run is excluded from findCurrentRun above).
 */
async function processRun({ organizationId, year, month, userId }) {
  year = Number(year); month = Number(month);
  if (!(year >= 2000 && year <= 2100)) throw new PayrollEngineError('A valid year is required.');
  if (!(month >= 1 && month <= 12)) throw new PayrollEngineError('Month must be 1-12.');
  const org = await Organization.findByPk(organizationId);
  if (!org) throw new PayrollEngineError('Organisation not found.', 404);
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const currentAdoption = await require('./catalogueAdoption').adoptionForDate(organizationId, monthEnd);
  if (currentAdoption) {
    const adoptedRule = await BankRuleCatalogue.findByPk(currentAdoption.catalogueId);
    if (adoptedRule?.bankClass !== org.bankClass) throw new PayrollEngineError('Bank class changed; approve an adoption for the current class before payroll.', 409);
  }
  if (org.requiresCatalogueAdoption && !await require('./catalogueAdoption').adoptionForDate(organizationId, `${year}-${String(month).padStart(2, '0')}-01`)) {
    throw new PayrollEngineError('Approve a bank-class catalogue adoption before processing payroll.', 409);
  }

  const existing = await findCurrentRun(organizationId, year, month);
  if (existing && LOCKED_STATUSES.includes(existing.status)) {
    throw new PayrollEngineError(
      `Payroll for ${monthKey(year, month)} has already been ${existing.status === 'PAID' ? 'paid out' : 'approved'} and can no longer be re-processed.`,
      409,
    );
  }
  try {
    await require('./yearEnd').assertMonthOpen(organizationId, year, month);
  } catch (err) {
    throw new PayrollEngineError(err.message, err.status || 409);
  }

  const settings = await getSettings(organizationId);
  const inputFingerprint = currentAdoption ? await payrollInputFingerprint(organizationId, year, month) : null;
  const employees = await Employee.findAll({
    where: { organizationId, status: 'ACTIVE', employmentStatus: 'ACTIVE' },
    include: [
      { model: PayScale, as: 'CurrentPayScale', required: false },
      { model: PostCadre, required: false },
      { model: EmployeeBankAccount, as: 'SalaryCreditAccount', required: false },
    ],
    order: [['empCode', 'ASC']],
  });

  const asOf = loans.asOfForMonth(month, year);

  const lines = [];
  let totalGross = 0; let totalDeductions = 0; let totalNet = 0;

  for (const employee of employees) {
    const salarySegments = await segmentsForMonth(employee, year, month);
    if (salarySegments.some(segment => segment.source === 'CATALOGUE' && segment.bankClass !== org.bankClass)) throw new PayrollEngineError(`Employee ${employee.empCode} has a salary assignment for another bank class; remap and approve it before payroll.`, 409);
    if (org.requiresCatalogueAdoption && salarySegments.some(segment => segment.source === 'LEGACY' || segment.source === 'DIRECT_PAY_LEGACY')) {
      throw new PayrollEngineError(`Employee ${employee.empCode} needs an approved salary assignment before payroll.`, 409);
    }
    const last = salarySegments.at(-1);
    const post = last?.source === 'CATALOGUE' ? await PostCadre.findOne({ where: { organizationId, code: last.postCode } }) : null;
    const [activeLoans, attendanceRow, customAllowances] = await Promise.all([
      loans.loadActiveLoans(employee.id, asOf),
      attendance.getForMonth(employee.id, month),
      applicableAllowancesFor(organizationId, post?.id || employee.postCadreId, year, month),
    ]);
    const catalogueSegments = salarySegments.some(segment => segment.source === 'CATALOGUE' || segment.source === 'DIRECT_PAY') ? salarySegments : null;
    const effectiveSettings = catalogueSegments ? catalogueSegments.at(-1).settings : settings;
    const effectiveEmployee = catalogueSegments ? { ...employee.toJSON(), ...catalogueSegments.at(-1).employeeFields, CurrentPayScale: employee.CurrentPayScale } : employee;
    const payslip = computePayslip(effectiveEmployee, effectiveSettings, month, activeLoans, attendanceRow ? attendanceRow.toJSON() : null, customAllowances, catalogueSegments, year);
    totalGross = round2(totalGross + payslip.earnings.grossEarnings);
    totalDeductions = round2(totalDeductions + payslip.deductions.totalDeductions);
    totalNet = round2(totalNet + payslip.netPay);

    // Net pay is credited to the employee's chosen salary-credit account
    // (one of their own EmployeeBankAccount rows — e.g. straight into an
    // Overdraft account to auto-reduce its balance) when set, otherwise to
    // the legacy single-account fields on the employee record itself.
    const creditAccount = employee.SalaryCreditAccount || null;
    const resolvedBankName = creditAccount ? creditAccount.bankName : employee.bankName;
    const resolvedAccountNumber = creditAccount ? creditAccount.accountNumber : employee.bankAccountNumber;
    const resolvedIfsc = creditAccount ? creditAccount.ifsc : employee.bankIfsc;
    const hasBankDetails = !!(resolvedAccountNumber && resolvedIfsc);
    lines.push({
      employeeId: employee.id,
      empCode: employee.empCode,
      employeeName: employee.name,
      postName: last?.source === 'CATALOGUE' ? last.postName : employee.PostCadre ? employee.PostCadre.name : null,
      bankName: resolvedBankName || null,
      bankAccountNumber: resolvedAccountNumber || null,
      bankIfsc: resolvedIfsc || null,
      grossEarnings: payslip.earnings.grossEarnings,
      totalDeductions: payslip.deductions.totalDeductions,
      netPay: payslip.netPay,
      lopDays: payslip.attendance.lopDays,
      payslipJson: JSON.stringify(payslip),
      hasBankDetails,
      exceptionNote: hasBankDetails ? null : 'No bank account number/IFSC on record — cannot be included in a bank transfer file.',
    });
  }

  if (inputFingerprint && inputFingerprint !== await payrollInputFingerprint(organizationId, year, month)) throw new PayrollEngineError('Payroll inputs changed during processing. Reprocess this payroll.', 409);

  return sequelize.transaction(async (t) => {
    let run;
    if (existing) {
      run = existing;
      await PayrollRunLine.destroy({ where: { payrollRunId: run.id }, transaction: t });
    } else {
      run = await PayrollRun.create({ organizationId, year, month }, { transaction: t });
    }
    if (lines.length) {
      await PayrollRunLine.bulkCreate(
        lines.map((l) => ({ ...l, payrollRunId: run.id })),
        { transaction: t },
      );
    }
    run.status = 'PROCESSED';
    run.employeeCount = lines.length;
    run.totalGrossEarnings = totalGross;
    run.totalDeductions = totalDeductions;
    run.totalNetPay = totalNet;
    run.processedAt = new Date();
    run.processedByUserId = userId || null;
    run.inputFingerprint = inputFingerprint;
    run.approvedAt = null; run.approvedByUserId = null;
    run.paidAt = null; run.paidByUserId = null;
    run.rejectionReason = null;
    await run.save({ transaction: t });
    return run;
  });
}

async function loadRun(runId) {
  return PayrollRun.findByPk(runId);
}

/** Ownership + existence check, mirroring the pattern used across the other org-scoped routes. */
function assertOwnRun(run, user) {
  if (!run) throw new PayrollEngineError('Payroll run not found', 404);
  if (user.role !== 'SUPER_ADMIN' && String(run.organizationId) !== String(user.organizationId)) {
    throw new PayrollEngineError('Payroll run not found', 404);
  }
}

async function approveRun(run, userId) {
  if (run.status !== 'PROCESSED') throw new PayrollEngineError(`Only a processed run can be approved (this one is ${run.status}).`, 409);
  const monthEnd = new Date(Date.UTC(run.year, run.month, 0)).toISOString().slice(0, 10);
  const adopted = await require('./catalogueAdoption').adoptionForDate(run.organizationId, monthEnd);
  if (adopted && run.processedByUserId && Number(run.processedByUserId) === Number(userId)) throw new PayrollEngineError('A different approving authority must approve this payroll run.', 403);
  if (run.inputFingerprint && run.inputFingerprint !== await payrollInputFingerprint(run.organizationId, run.year, run.month)) throw new PayrollEngineError('Salary inputs changed after processing. Reprocess this payroll before approval.', 409);
const changedSinceProcessing = { status: 'APPROVED', decidedAt: { [Op.gt]: run.processedAt }, effectiveDate: { [Op.lte]: monthEnd } };
  const [salaryChanges, adoptions, financialChanges] = await Promise.all([
    EmployeeCompensationAssignment.count({ where: { ...changedSinceProcessing, organizationId: run.organizationId } }),
    OrganizationCatalogueAdoption.count({ where: { ...changedSinceProcessing, organizationId: run.organizationId } }),
    require('../models').FinancialChangeProposal.count({ where: { ...changedSinceProcessing, organizationId: run.organizationId } }),
  ]);
  if (salaryChanges || adoptions || financialChanges) throw new PayrollEngineError('Salary inputs changed after processing. Reprocess this payroll before approval.', 409);
  run.status = 'APPROVED';
  run.approvedAt = new Date();
  run.approvedByUserId = userId;
  run.rejectionReason = null;
  await run.save();
  return run;
}

async function rejectRun(run, userId, reason) {
  if (run.status !== 'PROCESSED') throw new PayrollEngineError(`Only a processed run can be rejected (this one is ${run.status}).`, 409);
  run.status = 'REJECTED';
  run.rejectionReason = reason ? String(reason).slice(0, 2000) : null;
  await run.save();
  return run;
}

async function markPaid(run, userId) {
  if (run.status !== 'APPROVED') throw new PayrollEngineError(`Only an approved run can be marked as paid (this one is ${run.status}).`, 409);
  run.status = 'PAID';
  run.paidAt = new Date();
  run.paidByUserId = userId;
  await run.save();
  return run;
}

async function deleteRun(run) {
  if (LOCKED_STATUSES.includes(run.status)) {
    throw new PayrollEngineError(`An ${run.status === 'PAID' ? 'already-paid' : 'approved'} run cannot be deleted.`, 409);
  }
  await PayrollRunLine.destroy({ where: { payrollRunId: run.id } });
  await run.destroy();
}

module.exports = {
  PayrollEngineError,
  processRun,
  findCurrentRun,
  loadRun,
  assertOwnRun,
  approveRun,
  rejectRun,
  markPaid,
  deleteRun,
  monthKey,
};
