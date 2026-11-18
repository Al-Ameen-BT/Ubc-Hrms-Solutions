'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  sequelize,
  Organization,
  User,
  Employee,
  PostCadre,
  EmployeeDeviceLink,
  EmployeeMobileDevice,
  DpdpDocument,
  DpdpAcknowledgement,
} = require('../src/models');
const dpdpDocuments = require('../src/services/dpdpDocuments');
const secretBox = require('../src/services/secretBox');
const routes = require('../src/routes');

let server;
let base;
let org;
let post;
let adultEmp, minorEmp, noDobEmp;
let adultUser, minorUser, noDobUser;
let termsDoc, privacyDoc, noticeDoc;
let issuedRefreshToken;

const request = async (path, method = 'POST', body = null) => {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  return {
    status: res.status,
    body: await res.json().catch(() => null),
  };
};

before(async () => {
  await sequelize.sync();
  org = await Organization.create({ code: 'MOB_TEST', name: 'Mobile DPDP Bank' });
  post = await PostCadre.create({ organizationId: org.id, code: 'OFF_MOB', name: 'Officer' });

  // 1. Adult employee (DOB 25 years ago)
  adultEmp = await Employee.create({
    organizationId: org.id,
    empCode: 'MOB_ADULT',
    name: 'Adult Staff',
    dob: '1998-05-15',
    doj: '2020-01-01',
    postCadreId: post.id,
    currentBasicPay: 40000,
  });

  adultUser = await User.create({
    organizationId: org.id,
    email: 'adult@bank.invalid',
    name: 'Adult Staff',
    role: 'EMPLOYEE',
    employeeId: adultEmp.id,
    passwordHash: 'dummy',
    mustChangePassword: false,
  });

  // 2. Minor employee (DOB 16 years ago)
  minorEmp = await Employee.create({
    organizationId: org.id,
    empCode: 'MOB_MINOR',
    name: 'Minor Staff',
    dob: '2010-01-01',
    doj: '2026-01-01',
    postCadreId: post.id,
    currentBasicPay: 30000,
  });

  minorUser = await User.create({
    organizationId: org.id,
    email: 'minor@bank.invalid',
    name: 'Minor Staff',
    role: 'EMPLOYEE',
    employeeId: minorEmp.id,
    passwordHash: 'dummy',
    mustChangePassword: false,
  });

  // 3. Employee without DOB
  noDobEmp = await Employee.create({
    organizationId: org.id,
    empCode: 'MOB_NODOB',
    name: 'No DOB Staff',
    doj: '2020-01-01',
    postCadreId: post.id,
    currentBasicPay: 35000,
  });

  noDobUser = await User.create({
    organizationId: org.id,
    email: 'nodob@bank.invalid',
    name: 'No DOB Staff',
    role: 'EMPLOYEE',
    employeeId: noDobEmp.id,
    passwordHash: 'dummy',
    mustChangePassword: false,
  });

  // Publish baseline DPDP documents
  termsDoc = await dpdpDocuments.publishDocument({
    ownerType: 'PLATFORM',
    type: 'TERMS',
    title: 'Terms',
    body: 'Terms content',
    version: '1.0-mob',
    actor: adultUser,
  });

  privacyDoc = await dpdpDocuments.publishDocument({
    ownerType: 'PLATFORM',
    type: 'PLATFORM_PRIVACY',
    title: 'Platform Privacy',
    body: 'Privacy content',
    version: '1.0-mob',
    actor: adultUser,
  });

  noticeDoc = await dpdpDocuments.publishDocument({
    ownerType: 'ORGANIZATION',
    organizationId: org.id,
    type: 'EMPLOYEE_NOTICE',
    title: 'Bank Employee Privacy Notice',
    body: 'Notice content',
    version: '1.0-mob',
    actor: adultUser,
  });

  const app = express();
  app.use(express.json());
  app.use('/api/v1', routes);

  server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await sequelize.close();
});

test('preview returns active document notice and requires challenge without revealing DOB', async () => {
  const challenge = 'a'.repeat(32);
  await EmployeeDeviceLink.create({
    userId: adultUser.id,
    organizationId: org.id,
    challengeHash: secretBox.sha256(challenge),
    expiresAt: new Date(Date.now() + 60000),
  });

  const res = await request('/mobile/link/preview', 'POST', { challenge });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.organizationName, org.name);
  assert.ok(res.body.data.requiredDocumentIds.includes(termsDoc.id));
  assert.ok(res.body.data.requiredDocumentIds.includes(noticeDoc.id));
  assert.equal(res.body.data.employeeNotice.id, noticeDoc.id);
  // Must NOT reveal dob or employee name
  assert.equal(res.body.data.dob, undefined);
  assert.equal(res.body.data.employeeName, undefined);
});

test('link claim rejects underage or missing DOB employee', async () => {
  const minorChallenge = 'm'.repeat(32);
  const minorSecret = 's'.repeat(32);
  await EmployeeDeviceLink.create({
    userId: minorUser.id,
    organizationId: org.id,
    challengeHash: secretBox.sha256(minorChallenge),
    expiresAt: new Date(Date.now() + 60000),
  });

  const res = await request('/mobile/link/claim', 'POST', {
    challenge: minorChallenge,
    claimSecret: minorSecret,
    platform: 'android',
    deviceName: 'Minor Pixel',
    acceptedDocumentIds: [termsDoc.id, privacyDoc.id, noticeDoc.id],
  });

  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'AGE_RESTRICTED');
});

test('link claim succeeds for adult employee with complete document bundle', async () => {
  const adultChallenge = 'c'.repeat(32);
  const adultSecret = 'k'.repeat(32);
  const link = await EmployeeDeviceLink.create({
    userId: adultUser.id,
    organizationId: org.id,
    challengeHash: secretBox.sha256(adultChallenge),
    expiresAt: new Date(Date.now() + 60000),
  });

  const res = await request('/mobile/link/claim', 'POST', {
    challenge: adultChallenge,
    claimSecret: adultSecret,
    platform: 'android',
    deviceName: 'Adult Galaxy',
    acceptedDocumentIds: [termsDoc.id, privacyDoc.id, noticeDoc.id],
  });

  assert.equal(res.status, 200);
  assert.ok(res.body.data.linkId);
  assert.ok(res.body.data.verificationCode);

  // Link status APPROVED -> ISSUED records DpdpAcknowledgement rows for mobile channel
  await link.reload();
  await link.update({ status: 'APPROVED' });

  const statusRes = await request('/mobile/link/status', 'POST', {
    linkId: link.id,
    claimSecret: adultSecret,
  });

  assert.equal(statusRes.status, 200);
  assert.ok(statusRes.body.data.accessToken);
  issuedRefreshToken = statusRes.body.data.refreshToken;

  // Verify acknowledgements created with channel MOBILE
  const acks = await DpdpAcknowledgement.findAll({
    where: {
      userId: adultUser.id,
      channel: 'MOBILE',
    },
  });
  assert.equal(acks.length, 3);
});

test('mobile refresh fails after an effective legal document revision', async () => {
  await dpdpDocuments.publishDocument({
    ownerType: 'PLATFORM',
    type: 'PLATFORM_PRIVACY',
    title: 'Revised Platform Privacy',
    body: 'Revised privacy content',
    version: '2.0-mob-refresh',
    actor: adultUser,
  });

  const response = await request('/mobile/session/refresh', 'POST', { refreshToken: issuedRefreshToken });
  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'DPDP_ACKNOWLEDGEMENT_REQUIRED');
});

test('device issuance rolls back when accepted documents are no longer active', async () => {
  const active = await dpdpDocuments.activeBundle({ organizationId: org.id });
  const challenge = 'z'.repeat(32);
  const claimSecret = 'y'.repeat(32);
  const link = await EmployeeDeviceLink.create({
    userId: adultUser.id,
    organizationId: org.id,
    challengeHash: secretBox.sha256(challenge),
    expiresAt: new Date(Date.now() + 60000),
  });

  const claim = await request('/mobile/link/claim', 'POST', {
    challenge,
    claimSecret,
    platform: 'android',
    deviceName: 'Stale Docs Phone',
    acceptedDocumentIds: dpdpDocuments.requiredDocumentIds(active),
  });
  assert.equal(claim.status, 200);

  await dpdpDocuments.publishDocument({
    ownerType: 'ORGANIZATION',
    organizationId: org.id,
    type: 'EMPLOYEE_NOTICE',
    title: 'Revised Employee Notice',
    body: 'Revised employee notice content',
    version: '2.0-mob-stale',
    actor: adultUser,
  });
  await link.update({ status: 'APPROVED' });

  const issuance = await request('/mobile/link/status', 'POST', { linkId: link.id, claimSecret });
  assert.notEqual(issuance.status, 200);
  assert.equal(await EmployeeMobileDevice.count({ where: { userId: adultUser.id, name: 'Stale Docs Phone' } }), 0);
  assert.equal((await link.reload()).status, 'APPROVED');
});
