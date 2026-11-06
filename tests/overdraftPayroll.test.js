'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computePayslip } = require('../src/services/payslip');

test('the monthly overdraft repayment reduces net pay', () => {
  const employee = { currentBasicPay: 1000, daType: 'VARIABLE', gsliOptIn: false };
  const settings = { daPercent: 0, hraPercent: 0, pfEmployeePercent: 0, pfEmployerPercent: 0, medicalAllowanceMonth: 12, bonusMonth: 12 };
  const loans = { overdraft: { id: 1, amount: 840, repayMonths: 84, availedDate: `${new Date().getUTCFullYear()}-01-01`, interestRatePercent: 0 } };
  const payslip = computePayslip(employee, settings, 1, loans);
  assert.equal(payslip.deductions.overdraft, 10);
  assert.equal(payslip.deductions.totalDeductions, 10);
  assert.equal(payslip.netPay, 990);
  const linked = computePayslip(employee, settings, 1, { ...loans, recurringDeposit: { overdraftId: 1, monthlyAmount: 10, status: 'ACTIVE' } });
  assert.equal(linked.deductions.totalDeductions, 10);
});
