'use strict';

/**
 * DA Arrears Management — the calculation + payment-plan engine behind the
 * DA Revision Master (services/daRevisions.js).
 *
 * Two phases, deliberately kept apart (spec: "Do NOT simply add the
 * arrears to the next month's salary automatically" — management must
 * choose how it's paid):
 *
 *   1. CALCULATE — calculateForRevision() walks every eligible employee,
 *      month by month from the revision's Effective From to Effective To
 *      (or the current month if still open), pricing each month's
 *      difference against that employee's ACTUAL applicable Basic Pay for
 *      that specific month (basicPayAsOfMonth — never a flat
 *      Total Months x Current Basic x %). Produces one ArrearsCase per
 *      employee with an ArrearsMonthDetail ledger row per month. No money
 *      moves yet.
 *
 *   2. PAY — management explicitly sets a payment plan on a calculated
 *      case: Single Shot, Installment, Custom Installment, or first records
 *      a Manual Adjustment (mandatory reason) and then a plan against the
 *      adjusted total. This produces ArrearsInstallment rows, each pinned
 *      to one target year/month, status PENDING.
 *
 * Arrears are paid SEPARATELY from salary — never bundled into a payroll
 * run's payslip. Each PENDING installment is settled outside this system
 * (bank transfer, cash, whatever the bank's own process is) and then marked
 * paid here with payInstallment(), one installment at a time. That single
 * action does three things together: marks the installment PAID, posts an
 * entry to the employee's Service Book (a DA_ARREARS_PAYMENT event, so the
 * arrear shows up in their permanent record the same as an increment or
 * promotion would), and makes a receipt PDF available for that payment
 * (services/arrearsReceiptPdf.js).
 */

const { sequelize, Employee, PayScale, PayrollRun, PayrollRunLine, EmployeePayHistory, EmployeeServiceHistory, DaRevision, ArrearsCase, ArrearsMonthDetail, ArrearsInstallment } = require('../models');
const { Op } = require('sequelize');

class ArrearsError extends Error {
  constructor(message, status) { super(message); this.status = status || 400; }
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function monthKey(year, month) { return `${year}-${String(month).padStart(2, '0')}`; }
function endOfMonth(year, month) { return new Date(Date.UTC(year, month, 0)); } // month is 1-12; day 0 of next month = last day of this one
function toDateOnly(d) { return d.toISOString().slice(0, 10); }

/**
 * The list of {year, month} covered by a revision, inclusive, from
 * effectiveFrom's month to effectiveTo's month (or the current month if the
 * revision is still open-ended). Never runs past the current month — you
 * cannot owe arrears for a month that hasn't happened yet.
 */
function monthsInRange(effectiveFrom, effectiveTo) {
  const start = new Date(effectiveFrom + 'T00:00:00Z');
  const now = new Date();
  const cap = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  let end = effectiveTo ? new Date(effectiveTo + 'T00:00:00Z') : cap;
  if (end > cap) end = cap;
  const months = [];
  let y = start.getUTCFullYear(); let m = start.getUTCMonth() + 1;
  const endY = end.getUTCFullYear(); const endM = end.getUTCMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    months.push({ year: y, month: m });
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return months;
}

/**
 * The "historical basic pay" problem: this codebase has no effective-dated
 * range table for Basic Pay — EmployeePayHistory is an event log (one
 * eventDate, not a from/to range) and PayrollRunLine.payslipJson is a
 * frozen snapshot only for months actually processed through the payroll
 * engine. 3-tier fallback, most authoritative first:
 *   1. A payroll run already exists for this org/employee/year/month ->
 *      use its frozen actualBasic (the full sanctioned figure, not
 *      LOP-pro-rated — arrears are owed on what was sanctioned).
 *   2. Otherwise, walk EmployeePayHistory for the latest event on or
 *      before the end of that month, and use its newBasicPay.
 *   3. Otherwise (no run, no history before that month — e.g. arrears
 *      predate the employee's earliest recorded pay event), fall back to
 *      the employee's current Basic Pay, flagged as an estimate.
 */
async function basicPayAsOfMonth(organizationId, employeeId, year, month) {
  const run = await PayrollRun.findOne({
    where: { organizationId, year, month, status: { [Op.in]: ['PROCESSED', 'APPROVED', 'PAID'] } },
    order: [['id', 'DESC']],
  });
  if (run) {
    const line = await PayrollRunLine.findOne({ where: { payrollRunId: run.id, employeeId } });
    if (line) {
      const p = JSON.parse(line.payslipJson);
      const amt = p.earnings && (p.earnings.actualBasic != null ? p.earnings.actualBasic : p.earnings.basic);
      if (amt != null) return { amount: round2(amt), source: 'PAYROLL_RUN' };
    }
  }

  const cutoff = toDateOnly(endOfMonth(year, month));
  const event = await EmployeePayHistory.findOne({
    where: { employeeId, eventDate: { [Op.lte]: cutoff } },
    order: [['eventDate', 'DESC'], ['id', 'DESC']],
  });
  if (event) return { amount: round2(event.newBasicPay), source: 'PAY_HISTORY' };

  const employee = await Employee.findByPk(employeeId);
  return { amount: round2(employee ? employee.currentBasicPay : 0), source: 'CURRENT_ESTIMATE' };
}

/**
 * Employees a DA Revision applies to. daType FIXED employees are excluded —
 * they have zero variable-DA exposure, so a % revision can't create an
 * arrear for them. BOTH is treated like VARIABLE (their variable component
 * is still subject to the difference). A soft-deleted/deactivated employee
 * (Employee.status = 'INACTIVE' — see crudFactory's soft delete) is never
 * eligible: they should never surface as an anonymous-looking case in the
 * Arrears screens, even though they may still show up elsewhere in
 * historical records.
 */
async function eligibleEmployees(organizationId, daRevision) {
  const where = {
    organizationId,
    status: 'ACTIVE',
    daType: { [Op.in]: ['VARIABLE', 'BOTH'] },
  };
  if (daRevision.applicableServiceCategory && daRevision.applicableServiceCategory !== 'ALL') {
    where.employmentType = daRevision.applicableServiceCategory;
  }
  if (daRevision.applicableEmployeeCategory && daRevision.applicableEmployeeCategory !== 'ALL') {
    where.category = daRevision.applicableEmployeeCategory;
  }
  const include = [{ model: PayScale, as: 'CurrentPayScale', required: false }];
  const employees = await Employee.findAll({ where, include, order: [['empCode', 'ASC']] });
  if (!daRevision.applicablePayRevisionId) return employees;
  return employees.filter((e) => e.CurrentPayScale && String(e.CurrentPayScale.payRevisionId) === String(daRevision.applicablePayRevisionId));
}

/** Sums an ArrearsCase's month-detail rows into its total; does not persist. */
function sumMonths(monthRows) { return round2(monthRows.reduce((s, r) => s + Number(r.arrearsAmount), 0)); }

/**
 * (Re)calculates one employee's arrears case for one revision. If a case
 * already exists, it is replaced wholesale (all month-detail rows dropped
 * and rebuilt) — UNLESS it already has a PAID installment, in which case
 * recalculating would retroactively change money that has already gone out
 * the door, so it's refused.
 */
async function calculateCase(daRevision, employee, userId, transaction) {
  const existing = await ArrearsCase.findOne({ where: { daRevisionId: daRevision.id, employeeId: employee.id }, transaction });
  if (existing) {
    const paidCount = await ArrearsInstallment.count({ where: { arrearsCaseId: existing.id, status: 'PAID' }, transaction });
    if (paidCount > 0) throw new ArrearsError(`${employee.empCode} (${employee.name}) already has a paid installment under this revision — cannot recalculate.`, 409);
  }

  const months = monthsInRange(toDateOnly(new Date(daRevision.effectiveFrom)), daRevision.effectiveTo ? toDateOnly(new Date(daRevision.effectiveTo)) : null);
  const rows = [];
  for (const { year, month } of months) {
    // eslint-disable-next-line no-await-in-loop
    const { amount: basicPayApplicable, source } = await basicPayAsOfMonth(daRevision.organizationId, employee.id, year, month);
    const arrearsAmount = round2(basicPayApplicable * Number(daRevision.increasePercent) / 100);
    rows.push({
      year, month, basicPayApplicable, basicPaySource: source,
      previousDaPercent: daRevision.previousDaPercent, revisedDaPercent: daRevision.revisedDaPercent,
      daDifferencePercent: daRevision.increasePercent, arrearsAmount,
    });
  }
  const totalCalculatedAmount = sumMonths(rows);

  let arrearsCase;
  if (existing) {
    await ArrearsMonthDetail.destroy({ where: { arrearsCaseId: existing.id }, transaction });
    await existing.update({
      empCode: employee.empCode, employeeName: employee.name,
      monthsCount: rows.length, totalCalculatedAmount,
      totalAdjustedAmount: null, adjustmentReason: null, adjustedBy: null, adjustedAt: null,
      effectiveTotalAmount: totalCalculatedAmount,
      paymentMode: 'NONE', status: 'CALCULATED',
      calculatedAt: new Date(), calculatedBy: userId || null,
    }, { transaction });
    arrearsCase = existing;
    // Clearing to NONE above already implied the pending installments (if
    // any survived the paid-check above, they're by definition all
    // PENDING) should go — a stale plan against an old total is worse than
    // no plan.
    await ArrearsInstallment.destroy({ where: { arrearsCaseId: existing.id, status: 'PENDING' }, transaction });
  } else {
    arrearsCase = await ArrearsCase.create({
      organizationId: daRevision.organizationId, daRevisionId: daRevision.id, employeeId: employee.id,
      empCode: employee.empCode, employeeName: employee.name,
      monthsCount: rows.length, totalCalculatedAmount, effectiveTotalAmount: totalCalculatedAmount,
      calculatedAt: new Date(), calculatedBy: userId || null,
    }, { transaction });
  }
  if (rows.length) {
    await ArrearsMonthDetail.bulkCreate(rows.map((r) => ({ ...r, arrearsCaseId: arrearsCase.id })), { transaction });
  }
  return arrearsCase;
}

/**
 * Runs calculateCase() for every eligible employee under one revision, in a
 * single transaction. Also removes any ArrearsCase left over from a
 * previous calculation for an employee who is no longer eligible (most
 * commonly: the employee was deactivated/removed since the last
 * calculation) — otherwise a stale case for someone who should no longer
 * be on the list keeps showing up. A stale case with a PAID installment is
 * left alone (money already went out the door) rather than silently
 * deleted; it just won't be recalculated.
 */
async function calculateForRevision(daRevision, userId) {
  if (!['APPROVED', 'ACTIVE'].includes(daRevision.status)) {
    throw new ArrearsError(`Arrears can only be calculated for an Approved or Active revision (this one is ${daRevision.status}).`, 409);
  }
  const employees = await eligibleEmployees(daRevision.organizationId, daRevision);
  const eligibleIds = employees.map((e) => e.id);

  return sequelize.transaction(async (t) => {
    const staleCases = await ArrearsCase.findAll({
      where: { daRevisionId: daRevision.id, employeeId: { [Op.notIn]: eligibleIds.length ? eligibleIds : [0] } },
      transaction: t,
    });
    for (const staleCase of staleCases) {
      // eslint-disable-next-line no-await-in-loop
      const paidCount = await ArrearsInstallment.count({ where: { arrearsCaseId: staleCase.id, status: 'PAID' }, transaction: t });
      if (paidCount > 0) continue; // already paid something — keep the record, just don't touch it further
      // eslint-disable-next-line no-await-in-loop
      await ArrearsInstallment.destroy({ where: { arrearsCaseId: staleCase.id }, transaction: t });
      // eslint-disable-next-line no-await-in-loop
      await ArrearsMonthDetail.destroy({ where: { arrearsCaseId: staleCase.id }, transaction: t });
      // eslint-disable-next-line no-await-in-loop
      await staleCase.destroy({ transaction: t });
    }

    const cases = [];
    for (const employee of employees) {
      // eslint-disable-next-line no-await-in-loop
      cases.push(await calculateCase(daRevision, employee, userId, t));
    }
    return cases;
  });
}

async function refreshCaseStatus(arrearsCaseId, transaction) {
  const [pending, paid] = await Promise.all([
    ArrearsInstallment.count({ where: { arrearsCaseId, status: 'PENDING' }, transaction }),
    ArrearsInstallment.count({ where: { arrearsCaseId, status: 'PAID' }, transaction }),
  ]);
  let status;
  if (!pending && !paid) status = 'CALCULATED';
  else if (paid && !pending) status = 'FULLY_PAID';
  else if (paid && pending) status = 'PARTIALLY_PAID';
  else status = 'PLAN_SET';
  await ArrearsCase.update({ status }, { where: { id: arrearsCaseId }, transaction });
  return status;
}

function assertNoPaidInstallments(arrearsCase, paidCount) {
  if (paidCount > 0) throw new ArrearsError('One or more installments have already been paid — the payment plan cannot be replaced. Only the still-pending installments could be adjusted, and this module does not support a partial plan edit; contact support if a correction is needed.', 409);
}

async function loadCaseOr404(id, organizationId) {
  const row = await ArrearsCase.findByPk(id);
  if (!row || String(row.organizationId) !== String(organizationId)) throw new ArrearsError('Arrears case not found', 404);
  return row;
}

/** Manual Adjustment (spec #4) — mandatory reason, replaces the effective total and clears any pending (unpaid) plan, since it no longer sums to the right amount. */
async function adjustAmount(arrearsCase, { approvedAmount, reason, userId }) {
  const amt = Number(approvedAmount);
  if (!Number.isFinite(amt) || amt < 0) throw new ArrearsError('Approved amount must be a non-negative number.');
  if (!reason || !String(reason).trim()) throw new ArrearsError('An adjustment reason is required.');
  const paidCount = await ArrearsInstallment.count({ where: { arrearsCaseId: arrearsCase.id, status: 'PAID' } });
  assertNoPaidInstallments(arrearsCase, paidCount);
  return sequelize.transaction(async (t) => {
    await ArrearsInstallment.destroy({ where: { arrearsCaseId: arrearsCase.id, status: 'PENDING' }, transaction: t });
    await arrearsCase.update({
      totalAdjustedAmount: round2(amt), adjustmentReason: String(reason).trim().slice(0, 2000),
      adjustedBy: userId || null, adjustedAt: new Date(),
      effectiveTotalAmount: round2(amt), paymentMode: 'NONE',
    }, { transaction: t });
    await refreshCaseStatus(arrearsCase.id, t);
    return arrearsCase;
  });
}

/** Removes the pending payment plan (installments not yet paid), reverting to CALCULATED (or PARTIALLY_PAID if some installments were already paid). */
async function clearPaymentPlan(arrearsCase) {
  return sequelize.transaction(async (t) => {
    await ArrearsInstallment.destroy({ where: { arrearsCaseId: arrearsCase.id, status: 'PENDING' }, transaction: t });
    await arrearsCase.update({ paymentMode: 'NONE' }, { transaction: t });
    await refreshCaseStatus(arrearsCase.id, t);
    return arrearsCase;
  });
}

async function replacePendingInstallments(arrearsCase, rows, paymentMode, userId, transaction) {
  const paidCount = await ArrearsInstallment.count({ where: { arrearsCaseId: arrearsCase.id, status: 'PAID' }, transaction });
  assertNoPaidInstallments(arrearsCase, paidCount);
  await ArrearsInstallment.destroy({ where: { arrearsCaseId: arrearsCase.id, status: 'PENDING' }, transaction });
  await ArrearsInstallment.bulkCreate(rows.map((r) => ({ ...r, arrearsCaseId: arrearsCase.id, status: 'PENDING', createdBy: userId || null })), { transaction });
  await arrearsCase.update({ paymentMode }, { transaction });
  await refreshCaseStatus(arrearsCase.id, transaction);
}

/** Payment mode 1: Single Shot — the entire effective total in one target month. */
async function setSingleShot(arrearsCase, { year, month, userId }) {
  year = Number(year); month = Number(month);
  if (!(year >= 2000 && year <= 2100) || !(month >= 1 && month <= 12)) throw new ArrearsError('A valid target year and month are required.');
  const amount = Number(arrearsCase.effectiveTotalAmount);
  if (!(amount > 0)) throw new ArrearsError('This case has no arrears amount to pay.');
  return sequelize.transaction((t) => replacePendingInstallments(arrearsCase, [{ year, month, amount: round2(amount) }], 'SINGLE_SHOT', userId, t));
}

/** Payment mode 2: Installment — equal split across N consecutive months starting at startYear/startMonth; the last installment absorbs the rounding remainder so the rows always sum exactly to the total. */
async function setInstallments(arrearsCase, { numberOfInstallments, startYear, startMonth, userId }) {
  const n = Number(numberOfInstallments);
  startYear = Number(startYear); startMonth = Number(startMonth);
  if (!(n >= 1 && n <= 60)) throw new ArrearsError('Number of installments must be between 1 and 60.');
  if (!(startYear >= 2000 && startYear <= 2100) || !(startMonth >= 1 && startMonth <= 12)) throw new ArrearsError('A valid starting year and month are required.');
  const total = Number(arrearsCase.effectiveTotalAmount);
  if (!(total > 0)) throw new ArrearsError('This case has no arrears amount to pay.');
  const per = Math.floor((total / n) * 100) / 100;
  const rows = [];
  let y = startYear; let m = startMonth; let running = 0;
  for (let i = 0; i < n; i += 1) {
    const amount = i === n - 1 ? round2(total - running) : per;
    running = round2(running + amount);
    rows.push({ year: y, month: m, amount });
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return sequelize.transaction((t) => replacePendingInstallments(arrearsCase, rows, 'INSTALLMENT', userId, t));
}

/** Payment mode 3: Custom Installment — management-supplied amounts per month, must sum exactly to the effective total (2-decimal-rupee tolerance for rounding). */
async function setCustomInstallments(arrearsCase, { installments, userId }) {
  if (!Array.isArray(installments) || !installments.length) throw new ArrearsError('At least one installment is required.');
  const rows = installments.map((r) => {
    const year = Number(r.year); const month = Number(r.month); const amount = Number(r.amount);
    if (!(year >= 2000 && year <= 2100) || !(month >= 1 && month <= 12)) throw new ArrearsError('Each installment needs a valid year and month.');
    if (!(amount > 0)) throw new ArrearsError('Each installment amount must be greater than zero.');
    return { year, month, amount: round2(amount) };
  });
  const seen = new Set();
  rows.forEach((r) => {
    const k = monthKey(r.year, r.month);
    if (seen.has(k)) throw new ArrearsError(`Two installments were given for ${k} — combine them into one.`);
    seen.add(k);
  });
  const sum = round2(rows.reduce((s, r) => s + r.amount, 0));
  const total = round2(Number(arrearsCase.effectiveTotalAmount));
  if (Math.abs(sum - total) > 0.01) throw new ArrearsError(`Installments total ${sum} but must total the calculated arrears of ${total}.`);
  return sequelize.transaction((t) => replacePendingInstallments(arrearsCase, rows, 'CUSTOM_INSTALLMENT', userId, t));
}

var MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function loadInstallmentOr404(installmentId, arrearsCase) {
  const row = await ArrearsInstallment.findOne({ where: { id: installmentId, arrearsCaseId: arrearsCase.id } });
  if (!row) throw new ArrearsError('Installment not found', 404);
  return row;
}

/**
 * Marks one PENDING installment as paid — the standalone action that
 * actually moves an arrear off the books, entirely separate from any
 * payroll run. In one transaction it:
 *   1. flips the installment to PAID (paidAt, paidBy);
 *   2. posts a DA_ARREARS_PAYMENT entry to the employee's Service Book,
 *      recording the amount, the month it covers and the DA Revision's
 *      order number, so the payment is part of their permanent record;
 *   3. links the installment to that Service Book entry (serviceHistoryId)
 *      so a receipt can be regenerated later from either side.
 * Returns the updated installment; services/arrearsReceiptPdf.js turns it
 * into a downloadable PDF on request rather than storing one.
 */
async function payInstallment(arrearsCase, installmentId, userId) {
  const installment = await loadInstallmentOr404(installmentId, arrearsCase);
  if (installment.status === 'PAID') throw new ArrearsError('This installment has already been paid.', 409);

  const daRevision = await DaRevision.findByPk(arrearsCase.daRevisionId);
  const monthLabel = `${MONTH_NAMES[installment.month]} ${installment.year}`;

  return sequelize.transaction(async (t) => {
    const historyRow = await EmployeeServiceHistory.create({
      employeeId: arrearsCase.employeeId,
      eventType: 'DA_ARREARS_PAYMENT',
      eventDate: toDateOnly(new Date()),
      orderRef: daRevision ? daRevision.orderNumber : null,
      remarks: `DA Arrears of ${installment.amount} paid for ${monthLabel}`
        + (daRevision ? ` (Revision ${daRevision.orderNumber}, ${daRevision.previousDaPercent}% → ${daRevision.revisedDaPercent}%, effective ${toDateOnly(new Date(daRevision.effectiveFrom))}).` : '.'),
    }, { transaction: t });

    await installment.update({ status: 'PAID', paidAt: new Date(), paidBy: userId || null, serviceHistoryId: historyRow.id }, { transaction: t });
    await refreshCaseStatus(arrearsCase.id, t);
    return installment;
  });
}

/** Data assembled for the receipt PDF (services/arrearsReceiptPdf.js) — kept here so the shape lives next to the payment logic it describes. */
async function receiptData(arrearsCase, installmentId) {
  const installment = await loadInstallmentOr404(installmentId, arrearsCase);
  if (installment.status !== 'PAID') throw new ArrearsError('No receipt yet — this installment has not been paid.', 400);
  const daRevision = await DaRevision.findByPk(arrearsCase.daRevisionId);
  return {
    installment, daRevision,
    monthLabel: `${MONTH_NAMES[installment.month]} ${installment.year}`,
    receiptNumber: `ARR-${String(arrearsCase.id).padStart(5, '0')}-${String(installment.id).padStart(5, '0')}`,
  };
}

module.exports = {
  ArrearsError,
  round2,
  monthKey,
  monthsInRange,
  basicPayAsOfMonth,
  eligibleEmployees,
  calculateCase,
  calculateForRevision,
  loadCaseOr404,
  adjustAmount,
  clearPaymentPlan,
  setSingleShot,
  setInstallments,
  setCustomInstallments,
  payInstallment,
  receiptData,
};
