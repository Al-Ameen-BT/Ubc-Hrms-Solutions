'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  sequelize, Organization, BankRuleCatalogue, OrganizationCatalogueAdoption,
  PostCadre, PayRevision, PayScale, PayStage, Employee,
  EmployeeCompensationAssignment,
} = require('../src/models');
const assignments = require('../src/services/compensationAssignments');

let org;
let catalogue;
let employee;

before(async () => {
  await sequelize.sync({ force: true });
  org = await Organization.create({ code: 'STAGE0', name: 'Stage Zero Bank', bankClass: 'CLASS_I' });
  catalogue = await BankRuleCatalogue.create({
    name: 'Class I', bankClass: 'CLASS_I', status: 'PUBLISHED', effectiveDate: '2026-04-01',
    posts: [{ code: 'CLERK', name: 'Clerk', stages: [10000, 10500], payableDays: 30 }],
    rules: [], payrollDefaults: {}, createdByUserId: 1,
  });
  await OrganizationCatalogueAdoption.create({
    organizationId: org.id, catalogueId: catalogue.id, effectiveDate: '2026-04-01',
    status: 'APPROVED', preparedBy: 1, decidedBy: 2,
  });
  const post = await PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });
  employee = await Employee.create({ organizationId: org.id, empCode: 'S0', name: 'Stage Zero', doj: '2020-01-01', postCadreId: post.id });
});

after(async () => { await sequelize.close(); });

test('legacy stage migration is collision-safe and idempotent', async () => {
  const revision = await PayRevision.create({ organizationId: org.id, name: 'Legacy', effectiveDate: '2020-01-01' });
  const scale = await PayScale.create({ organizationId: org.id, payRevisionId: revision.id, code: 'LEGACY', name: 'Legacy', effectiveFrom: '2020-01-01' });
  await PayStage.bulkCreate([
    { payScaleId: scale.id, stageNo: 1, amount: 10000 },
    { payScaleId: scale.id, stageNo: 2, amount: 10500 },
  ]);
  await EmployeeCompensationAssignment.create({
    organizationId: org.id, employeeId: employee.id, catalogueId: catalogue.id,
    postCode: 'CLERK', stageNo: 1, amount: 10000, effectiveDate: '2025-01-01',
    reason: 'Legacy assignment', status: 'APPROVED', preparedBy: 1, decidedBy: 2,
  });

  const { migrateStageNumbers } = require('../src/scripts/migrate');
  assert.equal(await migrateStageNumbers(), true);
  assert.deepEqual((await PayStage.findAll({ where: { payScaleId: scale.id }, order: [['stageNo', 'ASC']] })).map(row => row.stageNo), [0, 1]);
  assert.equal((await EmployeeCompensationAssignment.findOne({ where: { reason: 'Legacy assignment' } })).stageNo, 0);
  assert.equal(await migrateStageNumbers(), false);
});

test('catalogue stage zero selects the first salary amount', async () => {
  const proposal = await assignments.proposeAssignment({
    organizationId: org.id, employeeId: employee.id, catalogueId: catalogue.id,
    postCode: 'CLERK', stageNo: 0, effectiveDate: '2026-04-01', actorId: 1,
    reason: 'Initial stage',
  });
  assert.equal(proposal.stageNo, 0);
  assert.equal(Number(proposal.amount), 10000);
});
