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

const { sequelize, Employee, PostCadre, PayScale, PayrollRun, PayrollRunLine, EmployeeBankAccount } = require('../models');
const { getSettings } = require('./payrollSettings');
const loans = require('./loans');
const attendance = require('./attendance');
const { computePayslip } = require('./payslip');
const { applicableAllowancesFor } = require('./allowances');
const { round2 } = require('./loans');
// Note: DA Arrears (services/arrears.js) is deliberately NOT wired into this
// engine. Arrears are paid out separately from salary — see arrears.js's
// header comment — so a payroll run never adds an arrears line to anyone's
// payslip, and approving a run has no effect on any ArrearsInstallment.

class PayrollEngineError extends Error {
  constructor(message, status) { super(message); this.status = status || 400; }
}

function monthKey(year, month) { return `${year}-${String(month).padStart(2, '0')}`; }

const LOCKED_STATUSES = ['APPROVED', 'PAID'];

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

  const employees = await Employee.findAll({
    where: { organizationId, status: 'ACTIVE', employmentStatus: 'ACTIVE' },
    include: [
      { model: PayScale, as: 'CurrentPayScale' },
      { model: PostCadre, required: false },
      { model: EmployeeBankAccount, as: 'SalaryCreditAccount', required: false },
    ],
    order: [['empCode', 'ASC']],
  });

  const settings = await getSettings(organizationId);
  const asOf = loans.asOfForMonth(month);

  const lines = [];
  let totalGross = 0; let totalDeductions = 0; let totalNet = 0;

  for (const employee of employees) {
    // eslint-disable-next-line no-await-in-loop
    const [activeLoans, attendanceRow, customAllowances] = await Promise.all([
      loans.loadActiveLoans(employee.id, asOf),
      attendance.getForMonth(employee.id, month),
      applicableAllowancesFor(organizationId, employee.postCadreId, year, month),
    ]);
    const payslip = computePayslip(employee, settings, month, activeLoans, attendanceRow ? attendanceRow.toJSON() : null, customAllowances);
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
      postName: employee.PostCadre ? employee.PostCadre.name : null,
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
