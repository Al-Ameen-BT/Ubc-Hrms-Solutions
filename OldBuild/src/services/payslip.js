'use strict';

/**
 * Computes an estimated monthly payslip (earnings, deductions, net pay) for
 * one employee from their salary fields + the organisation's
 * OrgPayrollSetting rates, plus whatever Festival Advance / Overdraft /
 * Recurring Deposit / LIC / Housing Loan / Vehicle Loan records are
 * currently active for them (see services/loans.js).
 */

const { estimateAnnualTax } = require('./incomeTax');
const { scheduleStatus, licStatus, housingLoanStatus, vehicleLoanStatus } = require('./loans');

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/**
 * @param {object} employee — a loaded Employee row (needs currentBasicPay, doj, riskAllowance, otherAllowance, vpfPercent, welfareFundOptIn, welfareFundAmount, gsliOptIn, gsliAmount, ptAmount, taxRegime, taxOtherDeductions)
 * @param {object} settings — an OrgPayrollSetting row
 * @param {number} [forMonth] — 1-12, which calendar month this payslip is for (affects Professional Tax / Medical Allowance / Bonus timing). Defaults to the current month.
 * @param {object} [loans] — { festivalAdvance, overdraft, recurringDeposit, lics, housingLoans, vehicleLoans } — the employee's currently-active record of each singular one (or null), and ALL rows for the multi-instance ones (lics/housingLoans/vehicleLoans — only those active this month actually contribute), as loaded by the route.
 * @param {object} [attendance] — { lopDays } for this employee/forMonth (see services/attendance.js), or null if none was recorded (treated as zero LOP days — full pay).
 * @param {Array<{id:number,name:string,amount:number}>} [customAllowances] — this employee's applicable admin-defined allowances for forMonth (see services/allowances.js applicableAllowancesFor()), already resolved by the caller. Flat rupee amounts, not pro-rated for LOP (same convention as Risk/Other Allowance).
 */
function computePayslip(employee, settings, forMonth, loans, attendance, customAllowances) {
  const month = forMonth || (new Date().getMonth() + 1);
  loans = loans || {};
  const asOf = new Date(); asOf.setUTCFullYear(asOf.getUTCFullYear(), month - 1, 1);
  const basicFull = Number(employee.currentBasicPay) || 0;

  // ---- Attendance / Loss of Pay ----
  // Basic, DA and the recurring allowances below are pro-rated by
  // (payableDays - lopDays) / payableDays, using the employee's Grade's
  // payableDays (falls back to 30 if the employee has no Grade on record).
  // Medical Allowance and Bonus are lump-sum annual payments and are
  // deliberately NOT pro-rated. See services/attendance.js for how LOP days
  // are recorded.
  const payScale = employee.CurrentPayScale || null;
  const payableDays = payScale && Number(payScale.payableDays) > 0 ? Number(payScale.payableDays) : 30;
  const lopDays = Math.max(0, Math.min(payableDays, Number(attendance && attendance.lopDays) || 0));
  const attendanceFactor = lopDays > 0 ? (payableDays - lopDays) / payableDays : 1;
  function proRate(n) { return round2((Number(n) || 0) * attendanceFactor); }

  // ---- Earnings ----
  // DA: VARIABLE (default) = org's daPercent x Basic, recomputed automatically
  // whenever the org rate changes. FIXED = the employee's own fixedDaAmount
  // instead of the variable figure, unaffected by later org DA% revisions.
  // BOTH = the variable figure PLUS the fixed amount on top of it, for a
  // bank that pays a standard DA and an additional fixed component.
  // Rates (DA%, HRA%) are applied against the full sanctioned Basic; the
  // resulting rupee amounts are then pro-rated for LOP together with Basic.
  const daVariableFull = round2(basicFull * (Number(settings.daPercent) || 0) / 100);
  const daFixedFull = round2(employee.fixedDaAmount || 0);
  const daFull = employee.daType === 'FIXED' ? daFixedFull
    : employee.daType === 'BOTH' ? round2(daVariableFull + daFixedFull)
    : daVariableFull;
  const hraFull = round2(basicFull * (Number(settings.hraPercent) || 0) / 100);
  const riskFull = round2(employee.riskAllowance || 0);
  const otherFull = round2(employee.otherAllowance || 0);

  // City Compensatory Allowance / Conveyance Allowance — optional; an
  // employee is paid the org default unless they have their own opt-in/
  // amount override. NULL optIn = automatic (paid whenever the applicable
  // amount is > 0); explicit false = never paid regardless of amount.
  const ccaEligible = employee.ccaOptIn !== false;
  const ccaFull = ccaEligible ? round2(employee.ccaAmount != null ? employee.ccaAmount : settings.ccaAmount) : 0;
  const conveyanceEligible = employee.conveyanceOptIn !== false;
  const conveyanceFull = conveyanceEligible ? round2(employee.conveyanceAmount != null ? employee.conveyanceAmount : settings.conveyanceAmount) : 0;

  // "Actual Basic" — the full sanctioned Basic Pay before any Loss-of-Pay
  // deduction, shown alongside the (possibly pro-rated) Basic below so the
  // payslip always shows what was actually earned vs what was sanctioned.
  const actualBasic = round2(basicFull);
  const basic = proRate(basicFull);
  const daVariable = proRate(daVariableFull);
  const daFixed = proRate(daFixedFull);
  const da = proRate(daFull);
  const hra = proRate(hraFull);
  const risk = proRate(riskFull);
  const other = proRate(otherFull);
  const cca = proRate(ccaFull);
  const conveyance = proRate(conveyanceFull);

  // Medical Allowance — a flat amount paid entirely in one configured month (default December).
  const medicalAllowance = month === Number(settings.medicalAllowanceMonth) ? round2(settings.medicalAllowanceAmount) : 0;

  // Bonus — paid entirely in one configured month (default April), formula
  // depends on the org's declared financial result for the year. No result
  // declared yet (bonusResult null) => no bonus, flagged in the note.
  let bonus = 0; let bonusNote = null;
  if (month === Number(settings.bonusMonth)) {
    if (settings.bonusResult === 'PROFIT') {
      bonus = round2(Math.min(Number(settings.bonusProfitMaxAmount), basicFull + basicFull * (Number(settings.bonusProfitPercent) || 0) / 100));
    } else if (settings.bonusResult === 'LOSS') {
      bonus = round2(Math.min(Number(settings.bonusLossMaxAmount), basicFull + basicFull * (Number(settings.bonusLossPercent) || 0) / 100));
    } else {
      bonusNote = 'Bonus month, but the organisation has not yet declared this year\'s Profit/Loss result in Payroll Settings — no bonus included.';
    }
  }

  // Admin-defined allowances (services/allowances.js) — a data-driven list
  // on top of the fixed set above, e.g. "Hill Tract Allowance". Flat, not
  // pro-rated for LOP, same as Risk/Other Allowance.
  const customAllowanceRows = (customAllowances || []).map((a) => ({ id: a.id, name: a.name, amount: round2(a.amount) }));
  const customAllowancesTotal = round2(customAllowanceRows.reduce((sum, a) => sum + a.amount, 0));

  const grossEarnings = round2(basic + da + hra + risk + other + cca + conveyance + medicalAllowance + bonus + customAllowancesTotal);

  // ---- Provident Fund ----
  // Contribution base is configurable per organisation (Payroll Settings):
  // Basic alone, or Basic+DA. VPF (an extra employee-only contribution on
  // top of the standard PF) uses the same base.
  const pfBase = settings.pfCalculationBase === 'BASIC_PLUS_DA' ? round2(basic + da) : basic;
  const pfEmployee = round2(pfBase * (Number(settings.pfEmployeePercent) || 0) / 100);
  const pfEmployer = round2(pfBase * (Number(settings.pfEmployerPercent) || 0) / 100); // informational — not deducted from pay
  const vpf = employee.vpfPercent ? round2(pfBase * Number(employee.vpfPercent) / 100) : 0;

  // ---- Welfare Fund ----
  const welfare = employee.welfareFundOptIn
    ? round2(employee.welfareFundAmount != null ? employee.welfareFundAmount : 0)
    : 0;

  // ---- GSLI: eligible only if joined before the org's cutoff date, unless
  // explicitly overridden per employee (gsliOptIn true/false) ----
  const gsliEligible = employee.gsliOptIn === true
    || (employee.gsliOptIn !== false && employee.doj && String(employee.doj) < String(settings.gsliCutoffDate));
  const gsli = gsliEligible ? round2(employee.gsliAmount != null ? employee.gsliAmount : settings.gsliAmount) : 0;

  // ---- Professional Tax: admin-entered amount, deducted on the org's schedule ----
  let pt = 0;
  if (employee.ptAmount) {
    if (settings.ptSchedule === 'MONTHLY') pt = round2(employee.ptAmount);
    else if (month === Number(settings.ptMonth1) || month === Number(settings.ptMonth2)) pt = round2(employee.ptAmount);
  }

  // ---- Festival Advance / Overdraft / Recurring Deposit instalments ----
  // (see services/loans.js — each record's due-this-month instalment is
  // computed live from its start date and repayment period.)
  const faStatus = loans.festivalAdvance ? scheduleStatus(loans.festivalAdvance, asOf) : null;
  const festivalAdvance = faStatus ? faStatus.dueThisMonth : 0;
  const odStatus = loans.overdraft ? scheduleStatus(loans.overdraft, asOf) : null;
  const overdraft = odStatus ? odStatus.dueThisMonth : 0;
  const recurringDeposit = loans.recurringDeposit && loans.recurringDeposit.status !== 'CLOSED' ? round2(loans.recurringDeposit.monthlyAmount) : 0;

  // ---- LIC / Housing Loan / Vehicle Loan — an employee may hold several of
  // each; only the ones active this month contribute, and each is also kept
  // as its own per-row breakdown for display (see loanStatus below). ----
  // monthGranular=true: `asOf` here is always the 1st of the target month
  // (see below), so a LIC/loan started on any OTHER day of that same month
  // would otherwise look like it hadn't started yet — see isActiveRange's
  // own doc comment in services/loans.js for why this flag exists.
  const licRows = (loans.lics || []).map((r) => ({ id: r.id, ...licStatus(r, asOf, true) }));
  const lic = round2(licRows.reduce((sum, r) => sum + r.deductionAmount, 0));
  const housingLoanRows = (loans.housingLoans || []).map((r) => ({
    id: r.id, amount: Number(r.totalLoanAmount) || 0, periodMonths: r.periodMonths, ...housingLoanStatus(r, asOf, true),
  }));
  const housingLoan = round2(housingLoanRows.reduce((sum, r) => sum + r.dueThisMonth, 0));
  const vehicleLoanRows = (loans.vehicleLoans || []).map((r) => ({
    id: r.id, amount: Number(r.totalAmount) || 0, periodMonths: r.periodMonths, ...vehicleLoanStatus(r, asOf, true),
  }));
  const vehicleLoan = round2(vehicleLoanRows.reduce((sum, r) => sum + r.dueThisMonth, 0));

  // ---- Income Tax ----
  const grossAnnualSalary = grossEarnings * 12;
  const annual80C = employee.taxRegime === 'OLD' ? round2((pfEmployee + vpf) * 12) : 0;
  const tax = estimateAnnualTax({
    grossAnnualSalary,
    regime: employee.taxRegime || 'NEW',
    annual80C,
    otherDeclaredDeductions: employee.taxOtherDeductions || 0,
  });

  // Overdraft is NOT deducted from pay directly — it's recovered only
  // through the linked Recurring Deposit instalment (already counted
  // below), so `overdraft` is kept on the payslip object purely as
  // reference/informational data (also shown in the Loan & Interest
  // Details card) and deliberately left out of totalDeductions/netPay.
  const totalDeductions = round2(
    pfEmployee + vpf + welfare + gsli + pt + tax.monthlyTax
    + festivalAdvance + recurringDeposit + lic + housingLoan + vehicleLoan,
  );
  const netPay = round2(grossEarnings - totalDeductions);

  // ---- Grade Details — the pay scale's own reference figures, shown as a
  // small fixed block on the payslip (Grade Name / Basic Scale / Payable
  // Days / Month Days). Null if the employee has no pay scale on record.
  // (payScale itself was already resolved above, for the LOP pro-ration.)
  const grade = payScale ? {
    name: payScale.name, code: payScale.code, scaleExpression: payScale.scaleExpression,
    payableDays: payScale.payableDays, monthDays: payScale.monthDays,
  } : null;

  return {
    forMonth: month,
    grade,
    attendance: { payableDays, lopDays, paidDays: round2(payableDays - lopDays) },
    earnings: { actualBasic, basic, da, daType: employee.daType || 'VARIABLE', daVariable, daFixed, hra, riskAllowance: risk, otherAllowance: other, cca, conveyance, medicalAllowance, bonus, customAllowances: customAllowanceRows, customAllowancesTotal, grossEarnings },
    deductions: {
      pfEmployee, pfEmployer, pfCalculationBase: settings.pfCalculationBase || 'BASIC', vpf, welfareFund: welfare, gsli, professionalTax: pt,
      incomeTax: tax.monthlyTax, festivalAdvance, overdraft, recurringDeposit,
      lic, housingLoan, vehicleLoan, totalDeductions,
    },
    loanStatus: {
      festivalAdvance: faStatus ? { ...faStatus, amount: Number(loans.festivalAdvance.amount) } : null,
      overdraft: odStatus ? { ...odStatus, amount: Number(loans.overdraft.amount) } : null,
      lics: licRows,
      housingLoans: housingLoanRows,
      vehicleLoans: vehicleLoanRows,
    },
    incomeTaxDetail: tax,
    netPay,
    note: [
      'Estimate for payroll purposes.',
      'Overdraft interest is flat/simple over the full repayment period at the rate in force on the day it was availed (later rate changes only affect new Overdrafts) — Rule verification required against the bank\'s actual OD product, since reducing-balance was not specified. Festival Advance and Recurring Deposit carry no interest.',
      'Housing Loan and Vehicle Loan EMIs use the standard reducing-balance amortisation formula from the recorded interest rate (a Vehicle Loan with no rate on record falls back to a directly-entered EMI instead).',
      lopDays > 0 ? `Basic, DA and allowances are pro-rated for ${lopDays} Loss of Pay day(s) this month out of ${payableDays} payable days.` : null,
      bonusNote,
    ].filter(Boolean).join(' '),
  };
}

module.exports = { computePayslip };
