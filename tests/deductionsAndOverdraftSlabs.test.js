'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computePayslip } = require('../src/services/payslip');
const loans = require('../src/services/loans');

test('Welfare Fund: calculates statutory slab deductions based on Basic + DA', () => {
  const settings = {
    daPercent: 0,
    hraPercent: 0,
    pfEmployeePercent: 0,
    pfEmployerPercent: 0,
    medicalAllowanceMonth: 12,
    bonusMonth: 12,
    welfareFundRule: 'SLAB',
    welfareFundThreshold: 10000,
    welfareFundAboveEmployee: 300,
    welfareFundAboveEmployer: 250,
    welfareFundBelowEmployee: 250,
    welfareFundBelowEmployer: 200,
    welfareFundBaseEmployee: 45,
    welfareFundBaseEmployer: 45,
  };

  // Case 1: Basic + DA > 10,000 => Employee gets 300, Employer gets 250 deduction
  const empAbove = {
    currentBasicPay: 12000,
    daType: 'VARIABLE',
    welfareFundOptIn: true,
  };
  const slipAbove = computePayslip(empAbove, settings, 1);
  assert.equal(slipAbove.deductions.welfareFund, 300, 'Employee deduction should be ₹300 for Basic+DA > 10000');
  assert.equal(slipAbove.deductions.welfareFundEmployer, 250, 'Employer contribution should be ₹250 for Basic+DA > 10000');
  assert.equal(slipAbove.deductions.totalDeductions, 300);
  assert.equal(slipAbove.netPay, 11700);

  // Case 2: Basic + DA <= 10,000 => Employee gets 250, Employer gets 200 deduction
  const empBelow = {
    currentBasicPay: 8000,
    daType: 'VARIABLE',
    welfareFundOptIn: true,
  };
  const slipBelow = computePayslip(empBelow, settings, 1);
  assert.equal(slipBelow.deductions.welfareFund, 250, 'Employee deduction should be ₹250 for Basic+DA <= 10000');
  assert.equal(slipBelow.deductions.welfareFundEmployer, 200, 'Employer contribution should be ₹200 for Basic+DA <= 10000');
  assert.equal(slipBelow.deductions.totalDeductions, 250);
  assert.equal(slipBelow.netPay, 7750);

  // Case 3: Flat rule => 45 rupees for employee and employer
  const flatSettings = { ...settings, welfareFundRule: 'FLAT' };
  const slipFlat = computePayslip(empAbove, flatSettings, 1);
  assert.equal(slipFlat.deductions.welfareFund, 45, 'Employee deduction should be ₹45 in FLAT mode');
  assert.equal(slipFlat.deductions.welfareFundEmployer, 45, 'Employer contribution should be ₹45 in FLAT mode');

  // Case 4: Opt-out => 0 deduction
  const empOptOut = {
    currentBasicPay: 12000,
    daType: 'VARIABLE',
    welfareFundOptIn: false,
  };
  const slipOptOut = computePayslip(empOptOut, settings, 1);
  assert.equal(slipOptOut.deductions.welfareFund, 0);
  assert.equal(slipOptOut.deductions.welfareFundEmployer, 0);

  // Case 5: Custom employee override takes precedence
  const empOverride = {
    currentBasicPay: 12000,
    daType: 'VARIABLE',
    welfareFundOptIn: true,
    welfareFundAmount: 180,
  };
  const slipOverride = computePayslip(empOverride, settings, 1);
  assert.equal(slipOverride.deductions.welfareFund, 180);
});

test('Custom Deductions: category-based deductions reduce net pay and report properly', () => {
  const employee = { currentBasicPay: 15000, daType: 'VARIABLE', gsliOptIn: false };
  const settings = { daPercent: 0, hraPercent: 0, pfEmployeePercent: 0, pfEmployerPercent: 0, medicalAllowanceMonth: 12, bonusMonth: 12 };

  const customDeductions = [
    { id: 1, name: 'Staff Welfare Club', category: 'WELFARE', amount: 150, employerAmount: 100 },
    { id: 2, name: 'Co-op Credit Society', category: 'SOCIETY', amount: 500, employerAmount: 0 },
  ];

  const payslip = computePayslip(employee, settings, 1, {}, null, [], null, null, customDeductions);
  assert.equal(payslip.deductions.customDeductions.length, 2);
  assert.equal(payslip.deductions.customDeductionsTotal, 650);
  assert.equal(payslip.deductions.totalDeductions, 650);
  assert.equal(payslip.netPay, 14350);
  assert.equal(payslip.deductions.customDeductions[0].category, 'WELFARE');
  assert.equal(payslip.deductions.customDeductions[0].employerAmount, 100);
});

test('Overdraft Slabs: correctly evaluates tiered slabs, multipliers, and max limits', () => {
  const slabs = [
    { id: 1, slabName: 'Tier 1 (Up to ₹25,000)', fromSalary: 0, toSalary: 25000, multiplier: 10, maxLimit: 200000, maxTenureMonths: 60, status: 'ACTIVE' },
    { id: 2, slabName: 'Tier 2 (₹25,001 - ₹50,000)', fromSalary: 25000.01, toSalary: 50000, multiplier: 15, maxLimit: 600000, maxTenureMonths: 84, status: 'ACTIVE' },
    { id: 3, slabName: 'Tier 3 (Above ₹50,000)', fromSalary: 50000.01, toSalary: null, multiplier: 20, maxLimit: 1500000, maxTenureMonths: 120, status: 'ACTIVE' },
    { id: 4, slabName: 'Inactive Slab', fromSalary: 0, toSalary: 100000, multiplier: 25, status: 'INACTIVE' },
  ];

  const settings = { daPercent: 10, odMultiplier: 15, odMaxRepayMonths: 84 };

  // Employee 1: Basic 18,000 + DA 1,800 = 19,800 => Matches Tier 1
  // Multiplier 10x => 19,800 * 10 = 198,000 (within 200,000 cap)
  const emp1 = { currentBasicPay: 18000 };
  const elig1 = loans.overdraftEligibility(emp1, settings, slabs);
  assert.equal(elig1.slab.id, 1);
  assert.equal(elig1.slab.name, 'Tier 1 (Up to ₹25,000)');
  assert.equal(elig1.multiplier, 10);
  assert.equal(elig1.eligibleLimit, 198000);
  assert.equal(elig1.maxTenureMonths, 60);

  // Employee 2: Basic 35,000 + DA 3,500 = 38,500 => Matches Tier 2
  // Multiplier 15x => 38,500 * 15 = 577,500 (within 600,000 cap)
  const emp2 = { currentBasicPay: 35000 };
  const elig2 = loans.overdraftEligibility(emp2, settings, slabs);
  assert.equal(elig2.slab.id, 2);
  assert.equal(elig2.multiplier, 15);
  assert.equal(elig2.eligibleLimit, 577500);
  assert.equal(elig2.maxTenureMonths, 84);

  // Employee 3: Basic 80,000 + DA 8,000 = 88,000 => Matches Tier 3
  // Multiplier 20x => 88,000 * 20 = 1,760,000 => Capped at maxLimit 1,500,000
  const emp3 = { currentBasicPay: 80000 };
  const elig3 = loans.overdraftEligibility(emp3, settings, slabs);
  assert.equal(elig3.slab.id, 3);
  assert.equal(elig3.multiplier, 20);
  assert.equal(elig3.eligibleLimit, 1500000, 'Should be capped at Tier 3 maxLimit');
  assert.equal(elig3.maxTenureMonths, 120);

  // Fallback: If no slabs passed, defaults to org multiplier (15x) without error
  const eligFallback = loans.overdraftEligibility(emp1, settings, []);
  assert.equal(eligFallback.slab, null);
  assert.equal(eligFallback.multiplier, 15);
  assert.equal(eligFallback.eligibleLimit, 297000); // 19,800 * 15
});
