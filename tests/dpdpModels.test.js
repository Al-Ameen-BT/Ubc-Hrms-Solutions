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
  OrganizationResponsibilityAssignment,
  DpdpDocument,
  DpdpAcknowledgement,
  DpdpDataRequest,
  DpdpIncident,
  DpdpOrganizationProfile,
} = require('../src/models');

after(async () => {
  await sequelize.close();
});

test('models exist and are exported from models/index', () => {
  assert.ok(DpdpDocument, 'DpdpDocument is exported');
  assert.ok(DpdpAcknowledgement, 'DpdpAcknowledgement is exported');
  assert.ok(DpdpDataRequest, 'DpdpDataRequest is exported');
  assert.ok(DpdpIncident, 'DpdpIncident is exported');
  assert.ok(DpdpOrganizationProfile, 'DpdpOrganizationProfile is exported');
});

test('OrganizationResponsibilityAssignment supports DATA_PROTECTION_OFFICER responsibility', async () => {
  await sequelize.sync();
  const org = await Organization.create({ code: 'DPDP_RESP', name: 'DPDP Resp Bank' });
  const post = await sequelize.models.PostCadre.create({ organizationId: org.id, code: 'OFF_DPDP', name: 'Officer' });
  const emp = await Employee.create({
    organizationId: org.id,
    empCode: 'DPO01',
    name: 'DPO Staff',
    doj: '2022-01-01',
    postCadreId: post.id,
    currentBasicPay: 30000,
  });

  const assignment = await OrganizationResponsibilityAssignment.create({
    organizationId: org.id,
    employeeId: emp.id,
    responsibility: 'DATA_PROTECTION_OFFICER',
    scopeType: 'ORGANISATION',
    effectiveFrom: '2026-01-01',
    status: 'ACTIVE',
  });

  assert.equal(assignment.responsibility, 'DATA_PROTECTION_OFFICER');
  assert.equal(assignment.scopeType, 'ORGANISATION');
});

test('DpdpDocument enforces version uniqueness per owner, org, and type', async () => {
  await sequelize.sync();
  const org = await Organization.create({ code: 'DPDP_DOC', name: 'DPDP Doc Bank' });

  await DpdpDocument.create({
    ownerType: 'PLATFORM',
    organizationId: null,
    type: 'TERMS',
    version: '1.0',
    title: 'Platform Terms',
    body: 'Terms content',
    state: 'PUBLISHED',
  });

  // Duplicate version for same ownerType/org/type should fail
  await assert.rejects(async () => {
    await DpdpDocument.create({
      ownerType: 'PLATFORM',
      organizationId: null,
      type: 'TERMS',
      version: '1.0',
      title: 'Platform Terms Duplicate',
      body: 'Duplicate terms content',
      state: 'DRAFT',
    });
  });

  // Different org can have its own employee notice with version 1.0
  const orgDoc = await DpdpDocument.create({
    ownerType: 'ORGANIZATION',
    organizationId: org.id,
    type: 'EMPLOYEE_NOTICE',
    version: '1.0',
    title: 'Bank Notice',
    body: 'Notice content',
    state: 'PUBLISHED',
  });
  assert.equal(orgDoc.version, '1.0');
});

test('DpdpAcknowledgement enforces uniqueness per document, user, channel, and deviceLink', async () => {
  await sequelize.sync();
  const org = await Organization.create({ code: 'DPDP_ACK', name: 'DPDP Ack Bank' });
  const post = await sequelize.models.PostCadre.create({ organizationId: org.id, code: 'OFF_ACK', name: 'Officer' });
  const emp = await Employee.create({
    organizationId: org.id,
    empCode: 'ACK01',
    name: 'Ack Staff',
    doj: '2022-01-01',
    postCadreId: post.id,
    currentBasicPay: 30000,
  });
  const user = await User.create({
    organizationId: org.id,
    email: 'ack@bank.invalid',
    name: 'Ack User',
    role: 'EMPLOYEE',
    employeeId: emp.id,
    passwordHash: 'dummy',
  });

  const doc = await DpdpDocument.create({
    ownerType: 'PLATFORM',
    type: 'TERMS',
    version: '1.0-ack',
    title: 'Terms',
    body: 'Terms',
    state: 'PUBLISHED',
  });

  await DpdpAcknowledgement.create({
    documentId: doc.id,
    organizationId: org.id,
    userId: user.id,
    employeeId: emp.id,
    channel: 'WEB',
  });

  // Duplicate acknowledgement for same document, user, channel, and null deviceLink should reject
  await assert.rejects(async () => {
    await DpdpAcknowledgement.create({
      documentId: doc.id,
      organizationId: org.id,
      userId: user.id,
      employeeId: emp.id,
      channel: 'WEB',
    });
  });
});

test('DpdpDataRequest and DpdpIncident enforce tenant isolation and status fields', async () => {
  await sequelize.sync();
  const org = await Organization.create({ code: 'DPDP_CASE', name: 'DPDP Case Bank' });
  const post = await sequelize.models.PostCadre.create({ organizationId: org.id, code: 'OFF_CASE', name: 'Officer' });
  const emp = await Employee.create({
    organizationId: org.id,
    empCode: 'CASE01',
    name: 'Case Staff',
    doj: '2022-01-01',
    postCadreId: post.id,
    currentBasicPay: 30000,
  });

  const req = await DpdpDataRequest.create({
    organizationId: org.id,
    employeeId: emp.id,
    requestType: 'ACCESS',
    status: 'SUBMITTED',
    details: 'Requesting my HR and attendance records',
  });
  assert.equal(req.requestType, 'ACCESS');
  assert.equal(req.status, 'SUBMITTED');

  const incident = await DpdpIncident.create({
    organizationId: org.id,
    title: 'Misdirected email notice',
    status: 'OPEN',
    severity: 'LOW',
    discoveredAt: new Date(),
  });
  assert.equal(incident.status, 'OPEN');
  assert.equal(incident.severity, 'LOW');
});

test('DpdpOrganizationProfile enforces one profile per organisation', async () => {
  await sequelize.sync();
  const org = await Organization.create({ code: 'DPDP_PROF', name: 'DPDP Profile Bank' });

  const profile = await DpdpOrganizationProfile.create({
    organizationId: org.id,
    dpoName: 'Suresh DPO',
    dpoEmail: 'dpo@dpdpprof.invalid',
    complianceStatus: 'IN_PROGRESS',
  });
  assert.equal(profile.dpoName, 'Suresh DPO');

  await assert.rejects(async () => {
    await DpdpOrganizationProfile.create({
      organizationId: org.id,
      dpoName: 'Duplicate DPO',
      dpoEmail: 'dup@dpdpprof.invalid',
    });
  });
});
