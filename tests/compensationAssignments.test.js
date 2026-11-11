'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sequelize, Organization, BankRuleCatalogue, PostCadre, Employee } = require('../src/models');
const adoption = require('../src/services/catalogueAdoption');
const assignments = require('../src/services/compensationAssignments');
let org, revision, employee, direct;
before(async () => {
  await sequelize.sync();
  org = await Organization.create({ code: 'ASSIGN', name: 'Assignment Bank', bankClass: 'CLASS_I' });
  revision = await BankRuleCatalogue.create({ name: 'Class I', bankClass: 'CLASS_I', status: 'PUBLISHED', effectiveDate: '2026-04-01', posts: [{ code: 'CLERK', name: 'Clerk', stages: [10000, 10500], payableDays: 30 }], rules: [], payrollDefaults: {}, createdByUserId: 1 });
  const adoptionRow = await adoption.proposeAdoption({ organizationId: org.id, catalogueId: revision.id, effectiveDate: '2026-04-01', actorId: 10 });
  await adoption.decideAdoption({ organizationId: org.id, proposalId: adoptionRow.id, decision: 'APPROVED', actorId: 11 });
  const post = await PostCadre.create({ organizationId: org.id, code: 'LEGACY', name: 'Legacy post' });
  employee = await Employee.create({ organizationId: org.id, empCode: 'A1', name: 'Clerk', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 9000 });
  direct = await Employee.create({ organizationId: org.id, empCode: 'A2', name: 'Direct', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 8000, directPay: true });
});
after(async () => { await sequelize.close(); });

test('rejects an absent stage or a government stage on direct-pay staff', async () => {
  const base = { organizationId: org.id, employeeId: employee.id, catalogueId: revision.id, postCode: 'CLERK', effectiveDate: '2026-04-01', actorId: 20, reason: 'Mapping' };
  await assert.rejects(assignments.proposeAssignment({ ...base, stageNo: 3 }), /stage/i);
  await assert.rejects(assignments.proposeAssignment({ ...base, postCode: 'OTHER', stageNo: 1 }), /post/i);
  await assert.rejects(assignments.proposeAssignment({ ...base, employeeId: direct.id, stageNo: 1 }), /direct/i);
});

test('approval uses a separate actor and preserves dated salary history', async () => {
  const base = { organizationId: org.id, employeeId: employee.id, catalogueId: revision.id, postCode: 'CLERK', stageNo: 1, effectiveDate: '2026-04-01', actorId: 20, reason: 'Mapping' };
  const proposal = await assignments.proposeAssignment(base);
  await assert.rejects(assignments.decideAssignment({ organizationId: org.id, proposalId: proposal.id, decision: 'APPROVED', actorId: 20 }), /different/i);
  const approved = await assignments.decideAssignment({ organizationId: org.id, proposalId: proposal.id, decision: 'APPROVED', actorId: 21 });
  assert.equal(approved.status, 'APPROVED');
  assert.equal((await assignments.assignmentForDate(employee.id, '2026-03-31')), null);
  assert.equal((await assignments.assignmentForDate(employee.id, '2026-04-01')).stageNo, 1);
  await assert.rejects(assignments.decideAssignment({ organizationId: org.id, proposalId: proposal.id, decision: 'APPROVED', actorId: 22 }), /changed|already/i);
  await assert.rejects(assignments.proposeAssignment(base), /date|exists/i);
  const second = await assignments.proposeAssignment({ ...base, stageNo: 2, effectiveDate: '2026-04-15' });
  await assignments.decideAssignment({ organizationId: org.id, proposalId: second.id, decision: 'APPROVED', actorId: 21 });
  assert.equal((await assignments.assignmentForDate(employee.id, '2026-04-14')).stageNo, 1);
  assert.equal((await assignments.assignmentForDate(employee.id, '2026-04-15')).stageNo, 2);
});

test('direct-pay proposal has an approved whole-rupee amount and no stage', async () => {
  const proposal = await assignments.proposeAssignment({ organizationId: org.id, employeeId: direct.id, amount: 14000, effectiveDate: '2026-04-01', actorId: 20, reason: 'Bank salary' });
  const approved = await assignments.decideAssignment({ organizationId: org.id, proposalId: proposal.id, decision: 'APPROVED', actorId: 21 });
  assert.equal(approved.amount, 14000);
  assert.equal(approved.catalogueId, null);
  assert.equal(approved.stageNo, null);
});

test('direct-pay amount supplied as a safe BIGINT string remains approvable', async () => {
  const proposal = await assignments.proposeAssignment({ organizationId: org.id, employeeId: direct.id, amount: '15000', effectiveDate: '2026-05-01', actorId: 20, reason: 'Bank salary revision' });
  const approved = await assignments.decideAssignment({ organizationId: org.id, proposalId: proposal.id, decision: 'APPROVED', actorId: 21 });
  assert.equal(Number(approved.amount), 15000);
});

test('backdated first mapping preserves the original legacy salary baseline', async () => {
  const post = await PostCadre.findOne({ where: { organizationId: org.id, code: 'LEGACY' } });
  const worker = await Employee.create({ organizationId: org.id, empCode: 'A3', name: 'Backdated', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 9000 });
  const first = await assignments.proposeAssignment({ organizationId: org.id, employeeId: worker.id, catalogueId: revision.id, postCode: 'CLERK', stageNo: 1, effectiveDate: '2026-04-16', actorId: 20, reason: 'First mapping' });
  await assignments.decideAssignment({ organizationId: org.id, proposalId: first.id, decision: 'APPROVED', actorId: 21 });
  const earlier = await assignments.proposeAssignment({ organizationId: org.id, employeeId: worker.id, catalogueId: revision.id, postCode: 'CLERK', stageNo: 2, effectiveDate: '2026-04-10', actorId: 20, reason: 'Correction' });
  await assignments.decideAssignment({ organizationId: org.id, proposalId: earlier.id, decision: 'APPROVED', actorId: 21 });
  assert.equal((await require('../src/services/compensationResolver').resolveCompensation(worker, '2026-04-09')).basicPay, 9000);
});
