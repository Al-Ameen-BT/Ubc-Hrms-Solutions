'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sequelize, Organization, User, Employee, PostCadre, DpdpRequestEvent, DpdpNomination, AuditLog } = require('../src/models');
const cases = require('../src/services/dpdpCases');

let org;
let employee;
let employeeUser;
let dpo;

before(async () => {
  await sequelize.sync({ force: true });
  org = await Organization.create({ code: 'RIGHTS', name: 'Rights Bank' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'OFF', name: 'Officer' });
  employee = await Employee.create({ organizationId: org.id, empCode: 'R1', name: 'Rights Employee', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 10000 });
  employeeUser = await User.create({ organizationId: org.id, employeeId: employee.id, email: 'employee@rights.invalid', name: 'Rights Employee', role: 'EMPLOYEE', passwordHash: 'x' });
  dpo = await User.create({ organizationId: org.id, email: 'dpo@rights.invalid', name: 'Rights DPO', role: 'DATA_PROTECTION_OFFICER', passwordHash: 'x' });
});

after(async () => sequelize.close());

test('rights cases receive stable case IDs, a 30-day SLA, and require identity verification before review', async () => {
  const created = await cases.createRequest({ actor: employeeUser, employee, requestType: 'ACCESS', details: 'Data summary', submittedAt: '2026-11-18T00:00:00.000Z' });
  assert.match(created.caseId, /^DPDP-\d+-2026-\d+$/);
  assert.equal(created.dueAt.toISOString(), '2026-12-18T00:00:00.000Z');
  await assert.rejects(cases.advanceRequest({ actor: dpo, requestId: created.id, status: 'IN_REVIEW' }), /identity verification/i);
  const verified = await cases.verifyRequestIdentity({ actor: dpo, requestId: created.id, method: 'EMPLOYEE_LOGIN_AND_HR_RECORD' });
  assert.ok(verified.identityVerifiedAt);
  const reviewing = await cases.advanceRequest({ actor: dpo, requestId: created.id, status: 'IN_REVIEW' });
  assert.equal(reviewing.status, 'IN_REVIEW');
  const closed = await cases.decideRequest({ actor: dpo, requestId: created.id, status: 'COMPLETED', decisionReason: 'Summary delivered.' });
  assert.ok(closed.closedAt);
  assert.ok(await DpdpRequestEvent.count({ where: { requestId: created.id } }) >= 3);
});

test('assisted external cases stay out of employee self-service and SLA cannot exceed 90 days', async () => {
  const external = await cases.createAssistedRequest({
    actor: dpo, principalType: 'CANDIDATE', principalReference: 'CAND-77', principalName: 'Candidate Person',
    requestType: 'CORRECTION', details: 'Correct candidate record', slaDays: 200,
  });
  assert.equal(external.employeeId, null);
  assert.equal(Math.round((external.dueAt - external.createdAt) / 86400000), 90);
  const mine = await cases.listMyRequests({ actor: employeeUser, employee });
  assert.equal(mine.some((row) => row.id === external.id), false);
});

test('nomination replacement preserves history and only one current nomination', async () => {
  const first = await cases.submitNomination({ actor: employeeUser, employee, data: { nomineeName: 'First Nominee', relationship: 'Spouse', contact: 'first@example.invalid' } });
  const second = await cases.submitNomination({ actor: employeeUser, employee, data: { nomineeName: 'Second Nominee', relationship: 'Sibling', contact: 'second@example.invalid' } });
  await first.reload();
  assert.ok(first.withdrawnAt);
  assert.equal(second.withdrawnAt ?? null, null);
  assert.equal(await DpdpNomination.count({ where: { employeeId: employee.id } }), 2);
  const audit = await AuditLog.findOne({ where: { action: 'dpdp.nomination.submit', targetId: String(second.id) } });
  assert.ok(audit);
  assert.doesNotMatch(JSON.stringify(audit.details), /Second Nominee|second@example/);
});
