'use strict';

/**
 * Estimated income-tax (TDS) for payroll deduction purposes.
 *
 * IMPORTANT: this is an ESTIMATE for spreading an employee's likely annual
 * tax liability evenly across 12 months of payroll — it is not a
 * replacement for the employee's own return. Not modelled: marginal relief
 * at the edge of the Section 87A rebate, surcharge (only applies well above
 * these pay scales' salary levels), HRA exemption (old regime), and other
 * declarations (80D, 80G, ...) beyond the "other deductions" figure the
 * employee/admin can enter. Flagged "Rule verification required" wherever
 * these matter more precisely.
 *
 * Slabs are FY 2025-26 (AY 2026-27), confirmed via web search when this was
 * built (Sept 2026) — not from training data alone, since tax slabs change
 * with each Union Budget. Revisit when a new Budget changes them.
 */

const CESS_RATE = 0.04;

// New regime (default from FY 2025-26): slabs, standard deduction, 87A rebate.
const NEW_REGIME = {
  standardDeduction: 75000,
  rebateThreshold: 1200000, // taxable income at/below this => rebate zeroes the tax
  rebateMax: 60000,
  slabs: [
    { upTo: 400000, rate: 0 },
    { upTo: 800000, rate: 0.05 },
    { upTo: 1200000, rate: 0.10 },
    { upTo: 1600000, rate: 0.15 },
    { upTo: 2000000, rate: 0.20 },
    { upTo: 2400000, rate: 0.25 },
    { upTo: Infinity, rate: 0.30 },
  ],
};

// Old regime, individuals below 60.
const OLD_REGIME = {
  standardDeduction: 50000,
  rebateThreshold: 500000,
  rebateMax: 12500,
  section80CCap: 150000,
  slabs: [
    { upTo: 250000, rate: 0 },
    { upTo: 500000, rate: 0.05 },
    { upTo: 1000000, rate: 0.20 },
    { upTo: Infinity, rate: 0.30 },
  ],
};

function taxFromSlabs(taxableIncome, slabs) {
  let tax = 0;
  let lower = 0;
  for (const slab of slabs) {
    if (taxableIncome <= lower) break;
    const upper = Math.min(taxableIncome, slab.upTo);
    tax += Math.max(0, upper - lower) * slab.rate;
    lower = slab.upTo;
  }
  return tax;
}

/**
 * @param {number} grossAnnualSalary — Basic+DA+HRA+allowances, annualised (x12).
 * @param {'NEW'|'OLD'} regime
 * @param {number} annual80C — old regime only: PF + VPF + LIC premiums etc, capped by this function at 1,50,000.
 * @param {number} otherDeclaredDeductions — old regime only: any further declared deductions (80D etc), taken as given, not capped here.
 * @returns {{ taxableIncome:number, annualTax:number, monthlyTax:number, regime:string, note:string }}
 */
function estimateAnnualTax({ grossAnnualSalary, regime = 'NEW', annual80C = 0, otherDeclaredDeductions = 0 }) {
  const gross = Math.max(0, Number(grossAnnualSalary) || 0);
  if (regime === 'OLD') {
    const capped80C = Math.min(Math.max(0, Number(annual80C) || 0), OLD_REGIME.section80CCap);
    const taxableIncome = Math.max(0, gross - OLD_REGIME.standardDeduction - capped80C - (Number(otherDeclaredDeductions) || 0));
    let tax = taxFromSlabs(taxableIncome, OLD_REGIME.slabs);
    if (taxableIncome <= OLD_REGIME.rebateThreshold) tax = Math.max(0, tax - OLD_REGIME.rebateMax);
    const annualTax = Math.round(tax * (1 + CESS_RATE));
    return {
      taxableIncome, annualTax, monthlyTax: Math.round(annualTax / 12), regime: 'OLD',
      note: 'Old regime — Rule verification required: HRA exemption and declarations beyond 80C/other are not modelled here.',
    };
  }
  const taxableIncome = Math.max(0, gross - NEW_REGIME.standardDeduction);
  let tax = taxFromSlabs(taxableIncome, NEW_REGIME.slabs);
  if (taxableIncome <= NEW_REGIME.rebateThreshold) tax = Math.max(0, tax - NEW_REGIME.rebateMax);
  const annualTax = Math.round(tax * (1 + CESS_RATE));
  return {
    taxableIncome, annualTax, monthlyTax: Math.round(annualTax / 12), regime: 'NEW',
    note: 'New regime (FY 2025-26 slabs) — marginal relief at the rebate edge is not modelled.',
  };
}

module.exports = { estimateAnnualTax, NEW_REGIME, OLD_REGIME };
