'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  sequelize,
  Organization,
  User,
  Employee,
  PostCadre,
  DpdpRetentionRule,
} = require('../src/models');
const dpdpRetention = require('../src/services/dpdpRetention');

let org1, org2;
let admin1;

before(async () => {
  await sequelize.sync({ force: true });
  org1 = await Organization.create({ code: 'RET_ORG1', name: 'Retention Bank 1' });
  org2 = await Organization.create({ code: 'RET_ORG2', name: 'Retention Bank 2' });

  const post = await PostCadre.create({ organizationId: org1.id, code: 'OFF', name: 'Officer' });
  const emp = await Employee.create({ organizationId: org1.id, empCode: 'E1', name: 'Admin', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 50000 });
  admin1 = await User.create({ organizationId: org1.id, email: 'admin@bank1.invalid', name: 'Admin', role: 'ORG_ADMIN', employeeId: emp.id, passwordHash: 'dummy', mustChangePassword: false });
});

after(async () => {
  await sequelize.close();
});

test('retention rules manage categories, retention periods, and legal holds per tenant', async () => {
  // 1. Create a retention rule with legal hold disabled
  const rule = await dpdpRetention.upsertRule({
    organizationId: org1.id,
    category: 'EXPENSE_RECEIPTS',
    periodMonths: 36, // 3 years
    legalHold: false,
    actor: admin1,
  });

  assert.equal(rule.category, 'EXPENSE_RECEIPTS');
  assert.equal(rule.periodMonths, 36);
  assert.equal(rule.legalHold, false);

  // List rules for org1
  const rules = await dpdpRetention.listRules({ organizationId: org1.id });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].category, 'EXPENSE_RECEIPTS');

  // Org2 has separate rules
  const org2Rules = await dpdpRetention.listRules({ organizationId: org2.id });
  assert.equal(org2Rules.length, 0);

  // Statutory categories (PAYROLL, AUDIT_LOG, SERVICE_BOOK) cannot be shortened or marked for destructive retention
  assert.ok(dpdpRetention.STATUTORY_EXCLUDED_CATEGORIES.includes('PAYROLL'));
  assert.ok(dpdpRetention.STATUTORY_EXCLUDED_CATEGORIES.includes('AUDIT_LOG'));
  assert.ok(dpdpRetention.STATUTORY_EXCLUDED_CATEGORIES.includes('SERVICE_BOOK'));
});

test('expiryCandidates reports candidate records without deleting them and legal hold suppresses candidates', async () => {
  // Update rule with legal hold
  await dpdpRetention.upsertRule({
    organizationId: org1.id,
    category: 'EXPENSE_RECEIPTS',
    periodMonths: 12,
    legalHold: true,
    actor: admin1,
  });

  const reportHeld = await dpdpRetention.expiryCandidates({ organizationId: org1.id });
  const expenseCat = reportHeld.find(c => c.category === 'EXPENSE_RECEIPTS');
  assert.equal(expenseCat.legalHold, true);
  assert.equal(expenseCat.candidateCount, 0); // suppressed by legal hold
  assert.equal(expenseCat.status, 'HELD');

  // Disable legal hold
  await dpdpRetention.upsertRule({
    organizationId: org1.id,
    category: 'EXPENSE_RECEIPTS',
    periodMonths: 12,
    legalHold: false,
    actor: admin1,
  });

  const reportActive = await dpdpRetention.expiryCandidates({ organizationId: org1.id });
  const activeExpense = reportActive.find(c => c.category === 'EXPENSE_RECEIPTS');
  assert.equal(activeExpense.legalHold, false);
  assert.equal(activeExpense.status, 'REPORT_ONLY');
  // Must be report-only, no deletion method exists
  assert.equal(typeof dpdpRetention.deleteExpiredRecords, 'undefined');
});
