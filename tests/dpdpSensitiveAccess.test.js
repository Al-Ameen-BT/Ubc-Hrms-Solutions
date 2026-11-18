'use strict';
process.env.DB_DIALECT = 'sqlite'; process.env.DB_STORAGE = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sequelize, Organization, User, Employee, PostCadre, AuditLog } = require('../src/models');
const sensitive = require('../src/services/dpdpSensitiveAccess');

let org; let otherOrg; let actor; let employee;
before(async () => {
  await sequelize.sync({ force: true });
  org = await Organization.create({ code: 'MASK', name: 'Mask Bank' });
  otherOrg = await Organization.create({ code: 'OTHER_MASK', name: 'Other Mask Bank' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'OFF', name: 'Officer' });
  employee = await Employee.create({ organizationId: org.id, empCode: 'M1', name: 'Masked Employee', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 1, panNumber: 'ABCDE1234F', aadhaarNumber: '123456789012', personalEmail: 'person@example.invalid', residenceAddress: 'Private address', emergencyContactNumber: '9876543210', bankName: 'Example Bank', bankAccountNumber: '001122334455', bankIfsc: 'EXAM0000123' });
  actor = await User.create({ organizationId: org.id, email: 'dpo@mask.invalid', name: 'DPO', role: 'ORG_ADMIN', passwordHash: 'x' });
});
after(async () => sequelize.close());

test('normal employee serialization masks identity, contact and bank values', () => {
  const masked = sensitive.maskEmployeeSensitive(employee);
  const text = JSON.stringify(masked);
  for (const raw of ['ABCDE1234F', '123456789012', 'person@example.invalid', 'Private address', '9876543210', '001122334455']) assert.equal(text.includes(raw), false);
  assert.match(masked.aadhaarNumber, /9012$/);
  assert.match(masked.bankAccountNumber, /4455$/);
});

test('reveal returns one permitted group and logs no sensitive values', async () => {
  const access = { userId: actor.id, organizationId: org.id, accessControlMode: 'LEGACY', grants: [{ action: 'dpdp.sensitive.view', scope: 'ORGANISATION', branchIds: [], departmentIds: [] }] };
  const result = await sensitive.reveal({ actor, access, employeeId: employee.id, fieldGroup: 'IDENTITY', purpose: 'IDENTITY_VERIFICATION', justification: 'Verify the statutory identity record.' });
  assert.deepEqual(Object.keys(result.values).sort(), ['aadhaarNumber', 'dob', 'panNumber', 'pfNumber', 'uanNumber']);
  assert.equal(result.values.panNumber, 'ABCDE1234F');
  assert.equal(Object.hasOwn(result.values, 'bankAccountNumber'), false);
  const audit = await AuditLog.findOne({ where: { action: 'dpdp.sensitive.view', targetId: String(employee.id) }, order: [['id', 'DESC']] });
  assert.equal(audit.details.outcome, 'ALLOWED');
  const logged = JSON.stringify(audit.details);
  assert.equal(logged.includes('ABCDE1234F'), false);
  assert.equal(logged.includes('123456789012'), false);
});

test('reveal validates purpose, justification, permission and tenant opaquely', async () => {
  const allowed = { userId: actor.id, organizationId: org.id, accessControlMode: 'LEGACY', grants: [{ action: 'dpdp.sensitive.view', scope: 'ORGANISATION', branchIds: [], departmentIds: [] }] };
  await assert.rejects(sensitive.reveal({ actor, access: allowed, employeeId: employee.id, fieldGroup: 'BANK', purpose: '', justification: '' }), /purpose/i);
  await assert.rejects(sensitive.reveal({ actor, access: { ...allowed, grants: [] }, employeeId: employee.id, fieldGroup: 'BANK', purpose: 'PAYROLL_VERIFICATION', justification: 'Validate salary account.' }), error => error.status === 403);
  const crossTenantActor = { ...actor.toJSON(), organizationId: otherOrg.id };
  await assert.rejects(sensitive.reveal({ actor: crossTenantActor, access: { ...allowed, organizationId: otherOrg.id }, employeeId: employee.id, fieldGroup: 'BANK', purpose: 'PAYROLL_VERIFICATION', justification: 'Validate salary account.' }), error => error.status === 404);
  assert.ok(await AuditLog.count({ where: { action: 'dpdp.sensitive.denied' } }) >= 2);
});
