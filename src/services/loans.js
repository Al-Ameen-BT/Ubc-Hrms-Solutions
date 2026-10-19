'use strict';

/**
 * Festival Advance, Employee Overdraft, and Recurring Deposit — the
 * loan-style payroll components (see models/employeeFestivalAdvance.js,
 * employeeOverdraft.js, employeeRecurringDeposit.js). Each is a single
 * record (amount + start date + repayment period); how much is still owed
 * "as of" any given date is computed here rather than posted month by
 * month, matching how services/payslip.js computes everything else live.
 */

const DEFAULT_RETIREMENT_AGE_YEARS = 58; // fallback only, when no org settings row is available; see OrgPayrollSetting.retirementAge

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/**
 * Employee's retirement date. Uses employee.dateOfRetirement if an admin has
 * set one explicitly (e.g. a negotiated/extended retirement date); otherwise
 * date of birth + the organisation's configured retirement age (see
 * OrgPayrollSetting.retirementAge — org-specific, not a fixed constant).
 * `settings` is optional; omit it only where an org's settings row genuinely
 * isn't available, in which case the fallback default above is used.
 */
function retirementDate(employee, settings) {
  if (!employee) return null;
  if (employee.dateOfRetirement) {
    const explicit = new Date(String(employee.dateOfRetirement) + 'T00:00:00Z');
    if (!Number.isNaN(explicit.getTime())) return explicit;
  }
  if (!employee.dob) return null;
  const d = new Date(employee.dob + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  const age = (settings && Number(settings.retirementAge) > 0) ? Number(settings.retirementAge) : DEFAULT_RETIREMENT_AGE_YEARS;
  d.setUTCFullYear(d.getUTCFullYear() + age);
  return d;
}

/** Whole months between two dates (b - a), floor, never negative. */
function monthsBetween(a, b) {
  if (!a || !b) return null;
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/** Months remaining from `asOf` until the employee's retirement date. Null if DOB unknown. */
function monthsUntilRetirement(employee, asOf, settings) {
  const rd = retirementDate(employee, settings);
  if (!rd) return null;
  return monthsBetween(asOf, rd);
}

/**
 * A loan-style record's status as of a given date: how much should have
 * been repaid by now and what's left. When the record carries an
 * `interestRatePercent` (Overdraft only, for now), flat/simple interest for
 * the full tenor is added to the principal once, up front, and the total is
 * what's actually split across the instalments — this is NOT a
 * reducing-balance calculation. Festival Advance has no interest field, so
 * for it this is unchanged (principal only).
 */
function scheduleStatus(record, asOf) {
  const amount = Number(record.amount) || 0;
  const repayMonths = Math.max(1, Number(record.repayMonths) || 1);
  const ratePercent = Number(record.interestRatePercent) || 0;
  const interest = ratePercent ? round2(amount * (ratePercent / 100) * (repayMonths / 12)) : 0;
  const totalRepayable = round2(amount + interest);
  const monthlyInstallment = round2(totalRepayable / repayMonths);
  const availed = new Date(String(record.availedDate) + 'T00:00:00Z');
  const monthsElapsed = Math.min(repayMonths, monthsBetween(availed, asOf));
  // The instalment due THIS month (0 once fully elapsed/repaid).
  const dueThisMonth = monthsElapsed >= repayMonths ? 0 : monthlyInstallment;
  const repaidSoFar = round2(Math.min(totalRepayable, monthlyInstallment * monthsElapsed));
  const balanceRemaining = round2(Math.max(0, totalRepayable - repaidSoFar));
  return {
    monthlyInstallment, monthsElapsed, dueThisMonth, repaidSoFar, balanceRemaining,
    fullyRepaid: balanceRemaining <= 0, interestRatePercent: ratePercent, interest, totalRepayable,
  };
}

/** Employee Overdraft eligibility ceiling = min(org max, (Basic+DA) x multiplier). */
function overdraftEligibility(employee, settings) {
  const basic = Number(employee.currentBasicPay) || 0;
  const da = round2(basic * (Number(settings.daPercent) || 0) / 100);
  const ceiling = round2(Math.min(Number(settings.odMaxAmount) || 0, (basic + da) * (Number(settings.odMultiplier) || 0)));
  return { basic, da, ceiling };
}

/**
 * Maximum allowed Overdraft repayment period: the org's standard (default
 * 84 months), shortened to whatever's left until retirement if that's sooner.
 */
function overdraftMaxRepayMonths(employee, settings, asOf) {
  const orgMax = Number(settings.odMaxRepayMonths) || 84;
  const untilRetirement = monthsUntilRetirement(employee, asOf || new Date(), settings);
  if (untilRetirement === null) return orgMax; // DOB unknown — can't shorten for retirement, fall back to the org standard
  return Math.max(1, Math.min(orgMax, untilRetirement));
}

/** The 1st of `month` (1-12) in the current calendar year — the reference
 * date a payslip preview for that month is computed "as of". Keeping this
 * in one place means the payslip's own DA/PT timing and the loan-schedule
 * "is this still active" check always agree on what date they mean by
 * "this month", including when previewing a month other than the real
 * current one (?month= on the payslip route). */
function asOfForMonth(month) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear(), (month || d.getUTCMonth() + 1) - 1, 1);
  return d;
}

/**
 * Is a date-range record (LIC policy, Housing Loan, Vehicle Loan) "active"
 * as of `asOf`? True once `asOf` reaches `fromDate`, and — unless a
 * `closureDate` was recorded (the policy/loan was closed early) or `asOf`
 * has passed `toDate` (only checked when `toDate` is given) — stays true
 * indefinitely. `toDate` is optional because LIC has no fixed end date of
 * its own (maturityDate is informational only; closureDate is what actually
 * stops the deduction).
 *
 * `monthGranular` (used only by the payslip's own month-level `asOf`, which
 * is always the 1st of the target month — see payslip.js): when true,
 * `fromDate` is compared by calendar month rather than the exact day, so a
 * LIC/loan started on ANY day of the payslip's month (not just the 1st)
 * still counts as active for that month. Without this, something started
 * on, say, the 26th would be invisible from that same month's payslip even
 * though the "list" endpoints (which check against the real `today`, not a
 * 1st-of-month reference) already show it as Active. Only `fromDate` needs
 * this — `toDate`/`closureDate` already work correctly against a 1st-of-
 * month `asOf` (an end/closure anywhere in the target month still leaves
 * the record active for that whole month).
 */
function isActiveRange(fromDate, toDate, closureDate, asOf, monthGranular) {
  if (!fromDate) return false;
  let from = new Date(String(fromDate) + 'T00:00:00Z');
  if (monthGranular) from = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  if (asOf < from) return false;
  if (toDate) {
    const to = new Date(String(toDate) + 'T00:00:00Z');
    if (asOf > to) return false;
  }
  if (closureDate) {
    const closed = new Date(String(closureDate) + 'T00:00:00Z');
    if (asOf >= closed) return false;
  }
  return true;
}

/** An LIC policy's status as of `asOf` — active flag + its flat deductionAmount. */
function licStatus(record, asOf, monthGranular) {
  const active = isActiveRange(record.startedDate, null, record.closureDate, asOf, monthGranular);
  return { active, deductionAmount: active ? (Number(record.deductionAmount) || 0) : 0 };
}

/**
 * Standard reducing-balance ("diminishing rate") EMI amortisation formula:
 *   EMI = P x r x (1+r)^n / ((1+r)^n - 1),  r = monthly rate, n = tenure months.
 * Shared by Housing Loan and (when it has an interest rate) Vehicle Loan.
 * Standard math — needs no "rule verification" flag, unlike the flat-interest
 * approximation used for Overdraft elsewhere in this file.
 */
function reducingBalanceEmi(principal, annualRatePercent, periodMonths) {
  const p = Number(principal) || 0;
  const n = Math.max(1, Number(periodMonths) || 1);
  const annualRate = Number(annualRatePercent) || 0;
  if (!annualRate) return round2(p / n);
  const r = annualRate / 12 / 100;
  const factor = Math.pow(1 + r, n);
  return round2((p * r * factor) / (factor - 1));
}

/** Housing Loan EMI — always rate-driven (see reducingBalanceEmi above). */
function housingLoanEmi(record) {
  return reducingBalanceEmi(record.totalLoanAmount, record.interestRatePercent, record.periodMonths);
}

/**
 * A Housing Loan's status as of `asOf` — active flag, its computed EMI, and
 * the total interest/repayable over the full tenure (EMI x periodMonths,
 * minus the principal) — the "amount / interest / total amount" breakdown
 * shown on the payslip.
 */
function housingLoanStatus(record, asOf, monthGranular) {
  const active = isActiveRange(record.emiStartDate, record.emiEndDate, record.closureDate, asOf, monthGranular);
  const emiAmount = housingLoanEmi(record);
  const periodMonths = Math.max(1, Number(record.periodMonths) || 1);
  const totalRepayable = round2(emiAmount * periodMonths);
  const interest = round2(totalRepayable - (Number(record.totalLoanAmount) || 0));
  return { active, emiAmount, dueThisMonth: active ? emiAmount : 0, interest, totalRepayable };
}

/**
 * A Vehicle Loan's status as of `asOf` — active flag + its EMI. When the
 * loan has an interestRatePercent on record, the EMI is computed via the
 * same reducing-balance formula Housing Loan uses; otherwise it falls back
 * to whatever emiAmount was entered directly. Either way, the total
 * interest/repayable over the tenure (EMI x periodMonths, minus principal)
 * is derivable from the EMI itself — the payslip's amount/interest/total
 * breakdown works the same whether the EMI was rate-computed or manual.
 */
function vehicleLoanStatus(record, asOf, monthGranular) {
  const active = isActiveRange(record.startDate, record.endDate, record.closureDate, asOf, monthGranular);
  const emiAmount = record.interestRatePercent != null
    ? reducingBalanceEmi(record.totalAmount, record.interestRatePercent, record.periodMonths)
    : round2(record.emiAmount);
  const periodMonths = Math.max(1, Number(record.periodMonths) || 1);
  const totalRepayable = round2(emiAmount * periodMonths);
  const interest = round2(totalRepayable - (Number(record.totalAmount) || 0));
  return { active, emiAmount, dueThisMonth: active ? emiAmount : 0, interest, totalRepayable };
}

/**
 * Loads the employee's Festival Advance, Overdraft and Recurring Deposit
 * that are active as of `asOf` (defaults to today) — the ones
 * services/payslip.js should apply for that month. "Active" for FA/OD =
 * not yet fully repaid as of that date; for RD = status ACTIVE. Creation is
 * guarded (see routes/serviceBook.js) so there should be at most one active
 * FA and one active OD per employee at a time — if more than one somehow
 * exists, the most recently availed one is used. LIC/Housing/Vehicle allow
 * MULTIPLE simultaneous rows by design, so ALL rows are returned here (not
 * just one) — services/payslip.js sums whichever are active for the month.
 */
async function loadActiveLoans(employeeId, asOf) {
  const {
    EmployeeFestivalAdvance, EmployeeOverdraft, EmployeeRecurringDeposit,
    EmployeeLic, EmployeeHousingLoan, EmployeeVehicleLoan,
  } = require('../models');
  const ref = asOf || new Date();
  const [fas, ods, rds, lics, housingLoans, vehicleLoans] = await Promise.all([
    EmployeeFestivalAdvance.findAll({ where: { employeeId }, order: [['availedDate', 'DESC'], ['id', 'DESC']] }),
    EmployeeOverdraft.findAll({ where: { employeeId }, order: [['availedDate', 'DESC'], ['id', 'DESC']] }),
    EmployeeRecurringDeposit.findAll({ where: { employeeId, status: 'ACTIVE' }, order: [['id', 'DESC']] }),
    EmployeeLic.findAll({ where: { employeeId }, order: [['openingDate', 'DESC'], ['id', 'DESC']] }),
    EmployeeHousingLoan.findAll({ where: { employeeId }, order: [['emiStartDate', 'DESC'], ['id', 'DESC']] }),
    EmployeeVehicleLoan.findAll({ where: { employeeId }, order: [['startDate', 'DESC'], ['id', 'DESC']] }),
  ]);
  const festivalAdvance = fas.find((r) => !scheduleStatus(r, ref).fullyRepaid) || null;
  const overdraft = ods.find((r) => !scheduleStatus(r, ref).fullyRepaid) || null;
  const recurringDeposit = rds[0] || null;
  return { festivalAdvance, overdraft, recurringDeposit, lics, housingLoans, vehicleLoans };
}

module.exports = {
  DEFAULT_RETIREMENT_AGE_YEARS,
  retirementDate,
  monthsBetween,
  monthsUntilRetirement,
  scheduleStatus,
  overdraftEligibility,
  overdraftMaxRepayMonths,
  loadActiveLoans,
  asOfForMonth,
  isActiveRange,
  licStatus,
  reducingBalanceEmi,
  housingLoanEmi,
  housingLoanStatus,
  vehicleLoanStatus,
  round2,
};
