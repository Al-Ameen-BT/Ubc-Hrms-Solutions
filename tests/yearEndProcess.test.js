'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'yearend-test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const { sequelize, Organization, PayrollRun, YearEndClosure, Employee, PostCadre } = models;
const { yearBounds, yearLabelFor, leaveYearLabelFor } = require('../src/services/dateUtils');
const yearEnd = require('../src/services/yearEnd');

let serial = 0;

before(async () => {
  await sequelize.sync();
});

after(async () => {
  await sequelize.close();
});

test('dateUtils cleanly decouples financial year (Apr-Mar) from calendar leave year (Jan-Dec)', () => {
  // Financial Year convention
  const fyBounds = yearBounds('FINANCIAL', 2025);
  assert.equal(fyBounds.startDate, '2025-04-01');
  assert.equal(fyBounds.endDate, '2026-03-31');

  // Calendar Year convention
  const cyBounds = yearBounds('CALENDAR', 2025);
  assert.equal(cyBounds.startDate, '2025-01-01');
  assert.equal(cyBounds.endDate, '2025-12-31');

  // Month mapping for Financial Year
  assert.equal(yearLabelFor('FINANCIAL', 2025, 4), 2025); // April 2025 is FY2025
  assert.equal(yearLabelFor('FINANCIAL', 2025, 12), 2025); // December 2025 is FY2025
  assert.equal(yearLabelFor('FINANCIAL', 2026, 1), 2025); // January 2026 is FY2025
  assert.equal(yearLabelFor('FINANCIAL', 2026, 3), 2025); // March 2026 is FY2025
  assert.equal(yearLabelFor('FINANCIAL', 2026, 4), 2026); // April 2026 is FY2026

  // Month mapping for Statutory Leave Calendar Year under KSR
  assert.equal(leaveYearLabelFor('CALENDAR', 2025, 12), 2025);
  assert.equal(leaveYearLabelFor('CALENDAR', 2026, 1), 2026);
  assert.equal(leaveYearLabelFor('CALENDAR', 2026, 3), 2026);
});

test('financial year-end summary reconciles all 12 months and aggregates approved/paid runs', async () => {
  const org = await Organization.create({
    code: `YE_${++serial}`,
    name: 'Year End Test Bank',
    status: 'ACTIVE',
  });

  const post = await PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });
  await Employee.create({
    organizationId: org.id,
    postCadreId: post.id,
    empCode: `EMP_${serial}`,
    name: 'Test Staff',
    doj: '2020-01-01',
    currentBasicPay: 30000,
    status: 'ACTIVE',
  });

  // Seed 12 months for FY 2025 (Apr 2025 - Mar 2026)
  const runs = [];
  const months = [
    { year: 2025, month: 4 }, { year: 2025, month: 5 }, { year: 2025, month: 6 },
    { year: 2025, month: 7 }, { year: 2025, month: 8 }, { year: 2025, month: 9 },
    { year: 2025, month: 10 }, { year: 2025, month: 11 }, { year: 2025, month: 12 },
    { year: 2026, month: 1 }, { year: 2026, month: 2 }, { year: 2026, month: 3 },
  ];

  for (const { year, month } of months) {
    runs.push(await PayrollRun.create({
      organizationId: org.id,
      year,
      month,
      status: 'PAID',
      totalGrossEarnings: 50000,
      totalDeductions: 5000,
      totalNetPay: 45000,
    }));
  }

  const s = await yearEnd.summary(org.id, 2025);
  assert.equal(s.monthsInYear, 12);
  assert.equal(s.payrollRunsIncluded, 12);
  assert.equal(s.payrollRunsExpected, 12);
  assert.equal(s.isComplete, true);
  assert.equal(s.totals.grossEarnings, 600000);
  assert.equal(s.totals.deductions, 60000);
  assert.equal(s.totals.netPay, 540000);

  const admin = await models.User.create({
    organizationId: org.id,
    name: 'Admin',
    email: `admin_ye_${serial}@bank.invalid`,
    role: 'ORG_ADMIN',
    passwordHash: 'hash',
  });

  // Close the year
  const closed = await yearEnd.closeYear(org.id, 2025, admin.id, 'Audited FY 2025-26 closure');
  assert.equal(closed.status, 'CLOSED');
  assert.ok(closed.summaryJson.includes('600000'));

  // Assert month open blocks new payroll run
  await assert.rejects(
    yearEnd.assertMonthOpen(org.id, 2025, 6),
    /closed this year/
  );

  // Reopen the year
  const reopened = await yearEnd.reopenYear(org.id, 2025);
  assert.equal(reopened.status, 'OPEN');
});
