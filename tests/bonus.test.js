'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computePayslip } = require('../src/services/payslip');

const employee = { currentBasicPay: 10000, daType: 'VARIABLE', gsliOptIn: false };
const settings = {
  daPercent: 0, hraPercent: 0, pfEmployeePercent: 0, pfEmployerPercent: 0,
  medicalAllowanceMonth: 12, bonusMonth: 4,
  bonusProfitPercent: 99, bonusProfitMaxAmount: 1000,
  bonusLossPercent: 99, bonusLossMaxAmount: 500,
};

test('bonus uses the fixed percentage of basic pay without a cap or extra basic', () => {
  assert.equal(computePayslip(employee, { ...settings, bonusResult: 'PROFIT' }, 4).earnings.bonus, 2000);
  assert.equal(computePayslip(employee, { ...settings, bonusResult: 'LOSS' }, 4).earnings.bonus, 833);
  assert.equal(computePayslip(employee, { ...settings, bonusResult: 'PROFIT' }, 5).earnings.bonus, 0);
});
