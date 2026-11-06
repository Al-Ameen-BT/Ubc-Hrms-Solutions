'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const loans = require('../src/services/loans');

test('overdraft minimum offer is fifteen times basic plus DA', () => {
  assert.equal(loans.overdraftEligibility({ currentBasicPay: 10000 }, { daPercent: 20 }).minimumOffer, 180000);
  assert.equal(loans.overdraftEligibility({ currentBasicPay: 10000, daType: 'FIXED', fixedDaAmount: 2500 }, { daPercent: 20 }).minimumOffer, 187500);
  assert.equal(loans.overdraftMaxRepayMonths({}, new Date('2026-01-01')), 84);
  assert.equal(loans.overdraftMaxRepayMonths({ dateOfRetirement: '2025-12-31' }, {}, new Date('2026-01-01')), 0);
});

test('entered repayment terms drive balances without calculated interest', () => {
  const record = { amount: 1000, totalRepaymentAmount: 1050, monthlyPayment: 100, repayMonths: 12, availedDate: '2026-01-01', interestRatePercent: 99 };
  assert.equal(loans.scheduleStatus(record, new Date('2026-02-01')).balanceRemaining, 950);
  assert.equal(loans.scheduleStatus(record, new Date('2025-12-01')).dueThisMonth, 0);
  assert.equal(loans.scheduleStatus(record, new Date('2026-11-01')).dueThisMonth, 50);
  assert.equal(loans.scheduleStatus(record, new Date('2026-12-01')).dueThisMonth, 0);
});

test('repayment terms reject amounts that cannot be cleared within tenure', () => {
  assert.throws(() => loans.validateRepaymentTerms(1000, 1200, 100, 10));
  assert.throws(() => loans.validateRepaymentTerms(1000, 900, 100, 10));
  assert.doesNotThrow(() => loans.validateRepaymentTerms(1000, 1200, 100, 12));
});

test('manual housing and vehicle payments stop at the entered total', () => {
  const asOf = new Date('2026-11-01');
  const housing = { totalLoanAmount: 1000, totalRepaymentAmount: 1050, monthlyPayment: 100, periodMonths: 12, emiStartDate: '2026-01-15', emiEndDate: '2027-01-15' };
  const vehicle = { totalAmount: 1000, totalRepaymentAmount: 1050, monthlyPayment: 100, periodMonths: 12, startDate: '2026-01-15', endDate: '2027-01-15' };
  assert.equal(loans.housingLoanStatus(housing, asOf, true).dueThisMonth, 50);
  assert.equal(loans.vehicleLoanStatus(vehicle, asOf, true).dueThisMonth, 50);
  assert.equal(loans.housingLoanStatus(housing, asOf, true).interest, 0);
  assert.equal(loans.vehicleLoanStatus(vehicle, asOf, true).interest, 0);
});
