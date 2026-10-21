'use strict';

/**
 * Computes an estimated monthly payslip (earnings, deductions, net pay) for
 * one employee from their salary fields + the organisation's
 * OrgPayrollSetting rates, plus whatever Festival Advance / Overdraft /
 * Recurring Deposit / LIC / Housing Loan / Vehicle Loan records are
 * currently active for them (see services/loans.js).
 *
 * All monetary calculations are done in integer paise to avoid floating-point
 * precision issues. Final values are returned as rupees (number with 2 decimals)
 * for API compatibility.
 */

const { estimateAnnualTax } = require('./incomeTax');
const { scheduleStatus, licStatus, housingLoanStatus, vehicleLoanStatus } = require('./loans');
const { toPaise, toRupees, add, subtract, multiply, divide, percentOf, min, max, round, clamp, sum } = require('../utils/money');

const SCALE = 100;

/** Pro-rate a paise amount by attendance factor (numerator/denominator). */
function proRatePaise(paise, numerator, denominator) {
  if (numerator >= denominator) return paise;
  return Math.round(paise * numerator / denominator);
}

/** Convert attendance factor to numerator/denominator for exact integer math. */
function attendanceFraction(lopDays, payableDays) {
  if (lopDays <= 0) return { num: payableDays, den: payableDays };
  const paidDays = payableDays - lopDays;
  return { num: paidDays, den: payableDays };
}

function computePayslip(employee, settings, forMonth, loans, attendance, customAllowances) {
  const month = forMonth || (new Date().getMonth() + 1);
  loans = loans || {};
  const asOf = new Date(); asOf.setUTCFullYear(asOf.getUTCFullYear(), month - 1, 1);
  const basicFullPaise = toPaise(employee.currentBasicPay);

  // ---- Attendance / Loss of Pay ----
  const payScale = employee.CurrentPayScale || null;
  const payableDays = payScale && Number(payScale.payableDays) > 0 ? Number(payScale.payableDays) : 30;
  const lopDays = Math.max(0, Math.min(payableDays, Number(attendance && attendance.lopDays) || 0));
  const { num: attNum, den: attDen } = attendanceFraction(lopDays, payableDays);
  function proRate(paise) { return proRatePaise(paise, attNum, attDen); }

  // ---- Earnings ----
  // DA: VARIABLE = org's daPercent x Basic; FIXED = employee's fixedDaAmount; BOTH = VARIABLE + FIXED
  const daVariableFullPaise = percentOf(basicFullPaise, settings.daPercent);
  const daFixedFullPaise = toPaise(employee.fixedDaAmount);
  const daFullPaise = employee.daType === 'FIXED' ? daFixedFullPaise
    : employee.daType === 'BOTH' ? add(daVariableFullPaise, daFixedFullPaise)
    : daVariableFullPaise;

  // HRA: employee fixedHraAmount, or org hraFixedAmount, or % of basic; subject to hraMaxAmount
  let hraCalculatedFullPaise;
  if (employee.hraType === 'FIXED' && employee.fixedHraAmount != null && Number(employee.fixedHraAmount) >= 0) {
    hraCalculatedFullPaise = toPaise(employee.fixedHraAmount);
  } else if (settings.hraType === 'FIXED') {
    hraCalculatedFullPaise = toPaise(settings.hraFixedAmount);
  } else {
    hraCalculatedFullPaise = percentOf(basicFullPaise, settings.hraPercent);
  }
  if (settings.hraMaxAmount != null && Number(settings.hraMaxAmount) > 0) {
    hraCalculatedFullPaise = min(hraCalculatedFullPaise, toPaise(settings.hraMaxAmount));
  }
  const hraFullPaise = hraCalculatedFullPaise;
  const riskFullPaise = toPaise(employee.riskAllowance);
  const otherFullPaise = toPaise(employee.otherAllowance);

  // CCA / Conveyance
  const ccaEligible = employee.ccaOptIn !== false;
  const ccaFullPaise = ccaEligible ? toPaise(employee.ccaAmount != null ? employee.ccaAmount : settings.ccaAmount) : 0;
  const conveyanceEligible = employee.conveyanceOptIn !== false;
  const conveyanceFullPaise = conveyanceEligible ? toPaise(employee.conveyanceAmount != null ? employee.conveyanceAmount : settings.conveyanceAmount) : 0;

  // "Actual Basic" — full sanctioned Basic before LOP
  const actualBasicPaise = basicFullPaise;
  const basicPaise = proRate(basicFullPaise);
  const daVariablePaise = proRate(daVariableFullPaise);
  const daFixedPaise = proRate(daFixedFullPaise);
  const daPaise = proRate(daFullPaise);
  const hraPaise = proRate(hraFullPaise);
  const riskPaise = proRate(riskFullPaise);
  const otherPaise = proRate(otherFullPaise);
  const ccaPaise = proRate(ccaFullPaise);
  const conveyancePaise = proRate(conveyanceFullPaise);

  // Medical Allowance — flat amount in configured month
  const medicalAllowancePaise = month === Number(settings.medicalAllowanceMonth) ? toPaise(settings.medicalAllowanceAmount) : 0;

  // Bonus — paid entirely in configured month
  let bonusPaise = 0; let bonusNote = null;
  if (month === Number(settings.bonusMonth)) {
    if (settings.bonusResult === 'PROFIT') {
      const bonusCalcPaise = add(basicFullPaise, percentOf(basicFullPaise, settings.bonusProfitPercent));
      bonusPaise = min(toPaise(settings.bonusProfitMaxAmount), bonusCalcPaise);
    } else if (settings.bonusResult === 'LOSS') {
      const bonusCalcPaise = add(basicFullPaise, percentOf(basicFullPaise, settings.bonusLossPercent));
      bonusPaise = min(toPaise(settings.bonusLossMaxAmount), bonusCalcPaise);
    } else {
      bonusNote = 'Bonus month, but the organisation has not yet declared this year\'s Profit/Loss result in Payroll Settings — no bonus included.';
    }
  }

  // Admin-defined allowances
  const customAllowanceRows = (customAllowances || []).map((a) => ({ id: a.id, name: a.name, amount: toRupees(toPaise(a.amount)) }));
  const customAllowancesTotalPaise = sum((customAllowances || []).map(a => toPaise(a.amount)));

  const grossEarningsPaise = add(
    basicPaise, daPaise, hraPaise, riskPaise, otherPaise,
    ccaPaise, conveyancePaise, medicalAllowancePaise, bonusPaise, customAllowancesTotalPaise
  );

  // ---- Provident Fund ----
  const pfBasePaise = settings.pfCalculationBase === 'BASIC_PLUS_DA' ? add(basicPaise, daPaise) : basicPaise;
  const pfEmployeePaise = percentOf(pfBasePaise, settings.pfEmployeePercent);
  const pfEmployerPaise = percentOf(pfBasePaise, settings.pfEmployerPercent); // informational
  const vpfPaise = employee.vpfPercent ? percentOf(pfBasePaise, employee.vpfPercent) : 0;

  // ---- Welfare Fund ----
  const welfarePaise = employee.welfareFundOptIn ? toPaise(employee.welfareFundAmount) : 0;

  // ---- GSLI ----
  const gsliEligible = employee.gsliOptIn === true
    || (employee.gsliOptIn !== false && employee.doj && String(employee.doj) < String(settings.gsliCutoffDate));
  const gsliPaise = gsliEligible ? toPaise(employee.gsliAmount != null ? employee.gsliAmount : settings.gsliAmount) : 0;

  // ---- Professional Tax ----
  let ptPaise = 0;
  if (employee.ptAmount) {
    if (settings.ptSchedule === 'MONTHLY') ptPaise = toPaise(employee.ptAmount);
    else if (month === Number(settings.ptMonth1) || month === Number(settings.ptMonth2)) ptPaise = toPaise(employee.ptAmount);
  }

  // ---- Festival Advance / Overdraft / Recurring Deposit ----
  const faStatus = loans.festivalAdvance ? scheduleStatus(loans.festivalAdvance, asOf) : null;
  const festivalAdvancePaise = faStatus ? toPaise(faStatus.dueThisMonth) : 0;
  const odStatus = loans.overdraft ? scheduleStatus(loans.overdraft, asOf) : null;
  const overdraftPaise = odStatus ? toPaise(odStatus.dueThisMonth) : 0;
  const recurringDepositPaise = loans.recurringDeposit && loans.recurringDeposit.status !== 'CLOSED' ? toPaise(loans.recurringDeposit.monthlyAmount) : 0;

  // ---- LIC / Housing Loan / Vehicle Loan ----
  const licRows = (loans.lics || []).map((r) => ({ id: r.id, ...licStatus(r, asOf, true) }));
  const licPaise = sum(licRows.map(r => toPaise(r.deductionAmount)));
  const housingLoanRows = (loans.housingLoans || []).map((r) => ({
    id: r.id, amount: toRupees(toPaise(r.totalLoanAmount)), periodMonths: r.periodMonths, ...housingLoanStatus(r, asOf, true),
  }));
  const housingLoanPaise = sum(housingLoanRows.map(r => toPaise(r.dueThisMonth)));
  const vehicleLoanRows = (loans.vehicleLoans || []).map((r) => ({
    id: r.id, amount: toRupees(toPaise(r.totalAmount)), periodMonths: r.periodMonths, ...vehicleLoanStatus(r, asOf, true),
  }));
  const vehicleLoanPaise = sum(vehicleLoanRows.map(r => toPaise(r.dueThisMonth)));

  // ---- Income Tax ----
  const grossAnnualSalaryPaise = grossEarningsPaise * 12;
  const annual80CPaise = employee.taxRegime === 'OLD' ? (pfEmployeePaise + vpfPaise) * 12 : 0;
  const tax = estimateAnnualTax({
    grossAnnualSalary: toRupees(grossAnnualSalaryPaise),
    regime: employee.taxRegime || 'NEW',
    annual80C: toRupees(annual80CPaise),
    otherDeclaredDeductions: employee.taxOtherDeductions || 0,
  });
  const monthlyTaxPaise = toPaise(tax.monthlyTax);

  // Overdraft is NOT deducted from pay directly — recovered through RD
  const totalDeductionsPaise = add(
    pfEmployeePaise, vpfPaise, welfarePaise, gsliPaise, ptPaise, monthlyTaxPaise,
    festivalAdvancePaise, recurringDepositPaise, licPaise, housingLoanPaise, vehicleLoanPaise
  );
  // ---- Line item rupee conversions (integer-rounded) ----
  const basicRupees = toRupees(basicPaise);
  const daRupees = toRupees(daPaise);
  const hraRupees = toRupees(hraPaise);
  const riskRupees = toRupees(riskPaise);
  const otherRupees = toRupees(otherPaise);
  const ccaRupees = toRupees(ccaPaise);
  const conveyanceRupees = toRupees(conveyancePaise);
  const medicalAllowanceRupees = toRupees(medicalAllowancePaise);
  const bonusRupees = toRupees(bonusPaise);
  const customAllowancesTotalRupees = toRupees(customAllowancesTotalPaise);

  const grossEarningsRupees = basicRupees + daRupees + hraRupees + riskRupees + otherRupees
    + ccaRupees + conveyanceRupees + medicalAllowanceRupees + bonusRupees + customAllowancesTotalRupees;

  const pfEmployeeRupees = toRupees(pfEmployeePaise);
  const pfEmployerRupees = toRupees(pfEmployerPaise);
  const vpfRupees = toRupees(vpfPaise);
  const welfareRupees = toRupees(welfarePaise);
  const gsliRupees = toRupees(gsliPaise);
  const ptRupees = toRupees(ptPaise);
  const monthlyTaxRupees = toRupees(monthlyTaxPaise);
  const festivalAdvanceRupees = toRupees(festivalAdvancePaise);
  const overdraftRupees = toRupees(overdraftPaise);
  const recurringDepositRupees = toRupees(recurringDepositPaise);
  const licRupees = toRupees(licPaise);
  const housingLoanRupees = toRupees(housingLoanPaise);
  const vehicleLoanRupees = toRupees(vehicleLoanPaise);

  const totalDeductionsRupees = pfEmployeeRupees + vpfRupees + welfareRupees + gsliRupees + ptRupees
    + monthlyTaxRupees + festivalAdvanceRupees + recurringDepositRupees + licRupees + housingLoanRupees + vehicleLoanRupees;

  const netPayRupees = grossEarningsRupees - totalDeductionsRupees;

  // ---- Grade Details ----
  const grade = payScale ? {
    name: payScale.name, code: payScale.code, scaleExpression: payScale.scaleExpression,
    payableDays: payScale.payableDays, monthDays: payScale.monthDays,
  } : null;

  // Convert all values to clean whole rupees for API response
  return {
    forMonth: month,
    grade,
    attendance: { payableDays, lopDays, paidDays: payableDays - lopDays },
    earnings: {
      actualBasic: toRupees(actualBasicPaise),
      basic: basicRupees,
      da: daRupees,
      daType: employee.daType || 'VARIABLE',
      daVariable: toRupees(daVariablePaise),
      daFixed: toRupees(daFixedPaise),
      hra: hraRupees,
      riskAllowance: riskRupees,
      otherAllowance: otherRupees,
      cca: ccaRupees,
      conveyance: conveyanceRupees,
      medicalAllowance: medicalAllowanceRupees,
      bonus: bonusRupees,
      customAllowances: customAllowanceRows,
      customAllowancesTotal: customAllowancesTotalRupees,
      grossEarnings: grossEarningsRupees,
    },
    deductions: {
      pfEmployee: pfEmployeeRupees,
      pfEmployer: pfEmployerRupees,
      pfCalculationBase: settings.pfCalculationBase || 'BASIC',
      vpf: vpfRupees,
      welfareFund: welfareRupees,
      gsli: gsliRupees,
      professionalTax: ptRupees,
      incomeTax: monthlyTaxRupees,
      festivalAdvance: festivalAdvanceRupees,
      overdraft: overdraftRupees,
      recurringDeposit: recurringDepositRupees,
      lic: licRupees,
      housingLoan: housingLoanRupees,
      vehicleLoan: vehicleLoanRupees,
      totalDeductions: totalDeductionsRupees,
    },
    loanStatus: {
      festivalAdvance: faStatus ? { ...faStatus, amount: toRupees(toPaise(loans.festivalAdvance.amount)) } : null,
      overdraft: odStatus ? { ...odStatus, amount: toRupees(toPaise(loans.overdraft.amount)) } : null,
      lics: licRows,
      housingLoans: housingLoanRows,
      vehicleLoans: vehicleLoanRows,
    },
    incomeTaxDetail: tax,
    netPay: netPayRupees,
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