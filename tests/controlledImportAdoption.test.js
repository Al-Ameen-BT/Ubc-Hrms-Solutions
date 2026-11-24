'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'controlled-import-adoption-test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const adoption = require('../src/services/catalogueAdoption');

let org, catalogue, proposal, approver;

before(async () => {
  await models.sequelize.sync();
  org = await models.Organization.create({ code: 'IMPORTORG', name: 'Import Bank', bankClass: 'CLASS_I' });
  const maker = await models.User.create({ organizationId: org.id, email: 'maker@import.invalid', name: 'Maker', role: 'ORG_ADMIN', passwordHash: 'unused' });
  approver = await models.User.create({ organizationId: org.id, email: 'approver@import.invalid', name: 'Approver', role: 'APPROVING_AUTHORITY', passwordHash: 'unused' });
  catalogue = await models.BankRuleCatalogue.create({
    name: 'Imported Global Rules', bankClass: 'CLASS_I', status: 'PUBLISHED', effectiveDate: '2026-04-01',
    posts: [], payrollDefaults: {}, createdByUserId: maker.id, publishedByUserId: maker.id,
    rules: [
      { kind: 'ALLOWANCE', code: 'CASH_RISK_ALLOWANCE', name: 'Cash Risk Allowance', enabled: true, calculationType: 'FLAT', amount: 300, frequency: 'MONTHLY', maximum: 300, customizableFields: ['amount', 'maximum'] },
      { kind: 'ALLOWANCE', code: 'PHYSICALLY_HANDICAPPED_ALLOWANCE', name: 'Physically Handicapped Allowance', enabled: true, calculationType: 'PERCENTAGE', percentageValue: 5, percentageBase: 'BASIC', frequency: 'MONTHLY', maximum: 1000, requiresEmployeeFlag: 'physicallyHandicapped', customizableFields: ['percentageValue', 'maximum'] },
      { kind: 'DEDUCTION', code: 'PROVIDENT_FUND', name: 'Provident Fund', enabled: true, category: 'STATUTORY', calculationType: 'PERCENTAGE', percentageValue: 12, percentageBase: 'BASIC_PLUS_DA', frequency: 'MONTHLY', customizableFields: ['percentageValue'] },
      { kind: 'LEAVE', code: 'CASUAL_LEAVE', name: 'Casual Leave', enabled: true, accrualMethod: 'FIXED_ANNUAL', annualDays: 20, maxAccumulation: 20, customizableFields: ['annualDays', 'maxAccumulation'] },
    ],
  });
  proposal = await models.OrganizationCatalogueAdoption.create({ organizationId: org.id, catalogueId: catalogue.id, effectiveDate: '2026-04-01', preparedBy: maker.id });
});

after(async () => models.sequelize.close());

test('approving catalogue adoption materializes customizable allowance, deduction and leave defaults', async () => {
  const result = await adoption.decideAdoption({ organizationId: org.id, proposalId: proposal.id, decision: 'APPROVED', actorId: approver.id, reason: 'Verified import.' });
  assert.equal(result.status, 'APPROVED');

  const allowance = await models.AllowanceType.findOne({ where: { organizationId: org.id, catalogueRuleCode: 'CASH_RISK_ALLOWANCE' } });
  assert.equal(Number(allowance.amount), 300);
  assert.equal(allowance.catalogueId, catalogue.id);
  assert.deepEqual(allowance.customizableFields, ['amount', 'maximum']);

  const deduction = await models.DeductionType.findOne({ where: { organizationId: org.id, catalogueRuleCode: 'PROVIDENT_FUND' } });
  assert.equal(Number(deduction.percentageValue), 12);
  assert.equal(deduction.percentageBase, 'BASIC_PLUS_DA');

  const leave = await models.LeaveType.findOne({ where: { organizationId: org.id, catalogueRuleCode: 'CASUAL_LEAVE' } });
  assert.equal(Number(leave.annualDays), 20);
  assert.deepEqual(leave.customizableFields, ['annualDays', 'maxAccumulation']);

  const applicable = await require('../src/services/allowances').applicableAllowancesFor(org.id, null, 2026, 5, {
    basicPaise: 2000000, daPaise: 0, grossPaise: 2000000, employee: { physicallyHandicapped: true },
  });
  assert.equal(applicable.find(item => item.name === 'Physically Handicapped Allowance').amount, 1000);
  const ineligible = await require('../src/services/allowances').applicableAllowancesFor(org.id, null, 2026, 5, {
    basicPaise: 2000000, daPaise: 0, grossPaise: 2000000, employee: { physicallyHandicapped: false },
  });
  assert.equal(ineligible.some(item => item.name === 'Physically Handicapped Allowance'), false);
});
