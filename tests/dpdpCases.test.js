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
  DpdpDataRequest,
  DpdpIncident,
  AuditLog,
} = require('../src/models');
const dpdpCases = require('../src/services/dpdpCases');

let orgA, orgB;
let postA, postB;
let empA, empB;
let userA, userB, dpoA;

before(async () => {
  await sequelize.sync();
  orgA = await Organization.create({ code: 'CASE_A', name: 'Bank A' });
  orgB = await Organization.create({ code: 'CASE_B', name: 'Bank B' });

  postA = await PostCadre.create({ organizationId: orgA.id, code: 'OFF_A', name: 'Officer A' });
  postB = await PostCadre.create({ organizationId: orgB.id, code: 'OFF_B', name: 'Officer B' });

  empA = await Employee.create({
    organizationId: orgA.id,
    empCode: 'EMP_A',
    name: 'Alice A',
    doj: '2020-01-01',
    postCadreId: postA.id,
    currentBasicPay: 40000,
  });

  empB = await Employee.create({
    organizationId: orgB.id,
    empCode: 'EMP_B',
    name: 'Bob B',
    doj: '2020-01-01',
    postCadreId: postB.id,
    currentBasicPay: 40000,
  });

  userA = await User.create({
    organizationId: orgA.id,
    email: 'alice@banka.invalid',
    name: 'Alice',
    role: 'EMPLOYEE',
    employeeId: empA.id,
    passwordHash: 'dummy',
  });

  dpoA = await User.create({
    organizationId: orgA.id,
    email: 'dpo@banka.invalid',
    name: 'DPO Bank A',
    role: 'DATA_PROTECTION_OFFICER',
    employeeId: empA.id,
    passwordHash: 'dummy',
  });

  userB = await User.create({
    organizationId: orgB.id,
    email: 'bob@bankb.invalid',
    name: 'Bob',
    role: 'EMPLOYEE',
    employeeId: empB.id,
    passwordHash: 'dummy',
  });
});

after(async () => {
  await sequelize.close();
});

test('employee creates data request successfully', async () => {
  const req = await dpdpCases.createRequest({
    actor: userA,
    employee: empA,
    requestType: 'ACCESS',
    details: 'Requesting summary of my personal data processing.',
  });

  assert.equal(req.status, 'SUBMITTED');
  assert.equal(req.employeeId, empA.id);
  assert.equal(req.organizationId, orgA.id);
  assert.equal(req.requestType, 'ACCESS');
  const audit = await AuditLog.findOne({ where: { action: 'dpdp.request.create', targetId: String(req.id) } });
  assert.equal(audit.actorUserId, userA.id);
  assert.equal(audit.details.requestType, 'ACCESS');
});

test('deciding request requires decision reason and statutory retention reason for rejected erasure', async () => {
  const req = await dpdpCases.createRequest({
    actor: userA,
    employee: empA,
    requestType: 'ERASURE',
    details: 'Please erase my payroll history.',
  });

  // Rejection without decisionReason must fail
  await assert.rejects(async () => {
    await dpdpCases.decideRequest({
      actor: dpoA,
      requestId: req.id,
      status: 'REJECTED',
      decisionReason: '',
      dpoResponse: 'No',
    });
  }, /Decision reason is required/);

  // Rejecting ERASURE requires statutory retention reason
  await assert.rejects(async () => {
    await dpdpCases.decideRequest({
      actor: dpoA,
      requestId: req.id,
      status: 'REJECTED',
      decisionReason: 'Statutory records retention applies.',
      retentionReason: '', // Empty retentionReason
      dpoResponse: 'Payroll history must be retained.',
    });
  }, /Statutory retention reason is required/);

  // Proper rejection of ERASURE with statutory retention ground
  const decided = await dpdpCases.decideRequest({
    actor: dpoA,
    requestId: req.id,
    status: 'REJECTED',
    decisionReason: 'Statutory compliance requires retaining audit and payroll records.',
    retentionReason: 'Banking Regulation Act & IT Act mandatory 8-year statutory retention.',
    dpoResponse: 'We cannot erase statutory salary book records.',
  });

  assert.equal(decided.status, 'REJECTED');
  assert.equal(decided.decidedBy, dpoA.id);
  assert.ok(decided.decidedAt);
});

test('cross-tenant DPO access fails opaquely', async () => {
  const reqB = await dpdpCases.createRequest({
    actor: userB,
    employee: empB,
    requestType: 'ACCESS',
    details: 'Bob data request',
  });

  // dpoA trying to decide or view Bank B request must fail
  await assert.rejects(async () => {
    await dpdpCases.decideRequest({
      actor: dpoA,
      requestId: reqB.id,
      status: 'COMPLETED',
      decisionReason: 'Done',
      dpoResponse: 'OK',
    });
  }, /Request not found/);
});

test('DPO incident management creates and advances incident', async () => {
  const inc = await dpdpCases.createIncident({
    actor: dpoA,
    title: 'Suspected unauthorised export attempt',
    severity: 'HIGH',
    affectedCategories: 'EMPLOYEE_FINANCIAL',
    affectedCount: 5,
    discoveredAt: new Date(),
    summary: 'Detected export of unapproved pay report.',
  });

  assert.equal(inc.status, 'OPEN');
  assert.equal(inc.organizationId, orgA.id);

  const updated = await dpdpCases.updateIncident({
    actor: dpoA,
    incidentId: inc.id,
    status: 'CONTAINED',
    containedAt: new Date(),
    actionTaken: 'Export endpoint session revoked.',
  });

  assert.equal(updated.status, 'CONTAINED');
  await updated.reload();
  assert.equal(updated.containmentActions, 'Export endpoint session revoked.');
  assert.equal(inc.reportedBy, dpoA.id);
  const audit = await AuditLog.findOne({ where: { action: 'dpdp.incident.update', targetId: String(inc.id) } });
  assert.equal(audit.actorUserId, dpoA.id);
  assert.equal(audit.details.status, 'CONTAINED');
});
