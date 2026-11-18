'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'auth-dpdp-gate-test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { sequelize, Organization, User, Employee, PostCadre } = require('../src/models');
const { signToken, hashPassword } = require('../src/services/authService');
const dpdpDocuments = require('../src/services/dpdpDocuments');
const routes = require('../src/routes');

let server;
let base;
let org;
let user;
let platformAdmin;
let termsDoc;
let privacyDoc;
let noticeDoc;

const request = async (path, token, method = 'GET', body = null) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
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
  org = await Organization.create({ code: 'AUTH_GATE', name: 'Auth Gate Bank' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'OFF_GATE', name: 'Officer' });
  const emp = await Employee.create({
    organizationId: org.id,
    empCode: 'GATE_E1',
    name: 'Gate Staff',
    doj: '2020-01-01',
    postCadreId: post.id,
    currentBasicPay: 40000,
  });

  const pwd = await hashPassword('Secret123!');
  user = await User.create({
    organizationId: org.id,
    email: 'gateuser@bank.invalid',
    name: 'Gate User',
    role: 'EMPLOYEE',
    employeeId: emp.id,
    passwordHash: pwd,
  });
  platformAdmin = await User.create({
    email: 'platform-gate@invalid.example',
    name: 'Platform Gate Admin',
    role: 'SUPER_ADMIN',
    passwordHash: await hashPassword('PlatformSecret123!'),
    mustChangePassword: false,
  });

  // Publish baseline documents
  termsDoc = await dpdpDocuments.publishDocument({
    ownerType: 'PLATFORM',
    type: 'TERMS',
    title: 'Terms',
    body: 'Terms content',
    version: '1.0-gate',
    actor: user,
  });

  privacyDoc = await dpdpDocuments.publishDocument({
    ownerType: 'PLATFORM',
    type: 'PLATFORM_PRIVACY',
    title: 'Privacy',
    body: 'Privacy content',
    version: '1.0-gate',
    actor: user,
  });

  noticeDoc = await dpdpDocuments.publishDocument({
    ownerType: 'ORGANIZATION',
    organizationId: org.id,
    type: 'EMPLOYEE_NOTICE',
    title: 'Notice',
    body: 'Notice content',
    version: '1.0-gate',
    actor: user,
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

test('compliance-limited token cannot reach standard employee or organisation endpoints', async () => {
  const pendingToken = signToken(user, { dpdpPending: true });

  // Normal /me endpoint rejects with DPDP_ACKNOWLEDGEMENT_REQUIRED
  const meRes = await request('/me/workplace', pendingToken);
  assert.equal(meRes.status, 403);
  assert.equal(meRes.body.code, 'DPDP_ACKNOWLEDGEMENT_REQUIRED');

  // Allowed endpoint /me/dpdp succeeds
  const dpdpRes = await request('/me/dpdp', pendingToken);
  assert.equal(dpdpRes.status, 200);
  assert.equal(dpdpRes.body.data.isCurrent, false);
});

test('allowed-looking query text does not bypass the compliance gate', async () => {
  const pendingToken = signToken(user, { dpdpPending: true });
  const response = await request('/me/workplace?next=/me/dpdp', pendingToken);

  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'DPDP_ACKNOWLEDGEMENT_REQUIRED');
});

test('platform admin login is not routed into employee acknowledgement', async () => {
  const response = await request('/auth/login', null, 'POST', {
    email: platformAdmin.email,
    password: 'PlatformSecret123!',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.user.role, 'SUPER_ADMIN');
  assert.equal(response.body.dpdpPending, false);
});

test('acknowledging pending documents issues full token that unblocks normal endpoints', async () => {
  const pendingToken = signToken(user, { dpdpPending: true });

  const ackRes = await request('/me/dpdp/acknowledge', pendingToken, 'POST', {
    documentIds: [termsDoc.id, privacyDoc.id, noticeDoc.id],
  });

  assert.equal(ackRes.status, 200);
  assert.ok(ackRes.body.token, 'New full token returned');

  const fullToken = ackRes.body.token;

  // Now normal /me endpoint succeeds with the full token
  const meRes = await request('/me/workplace', fullToken);
  assert.notEqual(meRes.status, 403);
});

test('an existing web session is restricted immediately after a document revision', async () => {
  const fullToken = signToken(user);
  await dpdpDocuments.publishDocument({
    ownerType: 'ORGANIZATION',
    organizationId: org.id,
    type: 'EMPLOYEE_NOTICE',
    title: 'Revised notice',
    body: 'Revised notice content',
    version: '2.0-gate',
    actor: user,
  });

  const response = await request('/me/workplace', fullToken);
  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'DPDP_ACKNOWLEDGEMENT_REQUIRED');
});
