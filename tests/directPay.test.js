'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computePayslip } = require('../src/services/payslip');

test('direct-pay staff receive bank-set gross without grade allowances and retain deductions', () => {
  const employee = { directPay: true, currentBasicPay: 14000, gsliOptIn: false, doj: '2025-01-01' };
  const settings = { daPercent: 20, hraPercent: 10, pfEmployeePercent: 12, pfEmployerPercent: 0, medicalAllowanceMonth: 4, medicalAllowanceAmount: 4000, bonusMonth: 5, ptSchedule: 'MONTHLY' };
  const slip = computePayslip(employee, settings, 4);
  assert.equal(slip.earnings.grossEarnings, 14000);
  assert.equal(slip.earnings.da, 0);
  assert.equal(slip.earnings.hra, 0);
  assert.equal(slip.deductions.pfEmployee, 1680);
  assert.equal(slip.netPay, 12320);
});
