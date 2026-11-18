'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'dpdp-api-test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { sequelize, Organization, User, Employee, PostCadre } = require('../src/models');
const { signToken } = require('../src/services/authService');
const dpdpDocuments = require('../src/services/dpdpDocuments');
const dpdpAcknowledgements = require('../src/services/dpdpAcknowledgements');
const routes = require('../src/routes');

let server;
let base;
let org;
let superAdmin;
let superToken;
let orgAdmin;
let orgAdminToken;

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
  org = await Organization.create({ code: 'API_DPDP', name: 'API DPDP Bank' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'OFF_API', name: 'Officer' });
  const emp = await Employee.create({
    organizationId: org.id,
    empCode: 'API_EMP1',
    name: 'API Staff',
    doj: '2020-01-01',
    postCadreId: post.id,
    currentBasicPay: 40000,
  });

  superAdmin = await User.create({
    organizationId: null,
    email: 'super@platform.invalid',
    name: 'Super Admin',
    role: 'SUPER_ADMIN',
    passwordHash: 'dummy',
  });
  superToken = signToken(superAdmin);

  orgAdmin = await User.create({
    organizationId: org.id,
    email: 'orgadmin@apidpdp.invalid',
    name: 'Org Admin',
    role: 'ORG_ADMIN',
    employeeId: emp.id,
    passwordHash: 'dummy',
  });
  orgAdminToken = signToken(orgAdmin);

  // Publish baseline documents
  const terms = await dpdpDocuments.publishDocument({
    ownerType: 'PLATFORM',
    type: 'TERMS',
    title: 'Platform Terms & Conditions',
    body: 'Terms details for all users',
    version: '1.0',
    actor: superAdmin,
  });

  const privacy = await dpdpDocuments.publishDocument({
    ownerType: 'PLATFORM',
    type: 'PLATFORM_PRIVACY',
    title: 'Platform Privacy Notice',
    body: 'Privacy details for all users',
    version: '1.0',
    actor: superAdmin,
  });

  const notice = await dpdpDocuments.publishDocument({
    ownerType: 'ORGANIZATION',
    organizationId: org.id,
    type: 'EMPLOYEE_NOTICE',
    title: 'Bank Employee Privacy Notice',
    body: 'Bank notice details for bank employees',
    version: '1.0',
    actor: orgAdmin,
  });
  await dpdpAcknowledgements.recordAcknowledgements({
    user: orgAdmin,
    employee: emp,
    documentIds: [terms.id, privacy.id, notice.id],
    channel: 'WEB',
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

test('public GET /public/dpdp returns active legal bundle without authentication', async () => {
  const res = await request(`/public/dpdp?organizationId=${org.id}`, null);
  assert.equal(res.status, 200);
  assert.ok(res.body.data.terms);
  assert.equal(res.body.data.terms.type, 'TERMS');
  assert.ok(res.body.data.platformPrivacy);
  assert.ok(res.body.data.employeeNotice);
  // Ensure private internal metadata is not leaked
  assert.equal(res.body.data.terms.publishedBy, undefined);
});

test('platform admin can view and publish platform documents', async () => {
  const listRes = await request('/admin/dpdp/documents', superToken);
  assert.equal(listRes.status, 200);
  assert.ok(Array.isArray(listRes.body.data));

  const pubRes = await request('/admin/dpdp/documents/publish', superToken, 'POST', {
    type: 'TERMS',
    title: 'Updated Platform Terms',
    body: 'New updated terms content',
    version: '2.0',
  });
  assert.equal(pubRes.status, 201);
  assert.equal(pubRes.body.data.version, '2.0');
});

test('org admin can view and publish employee notice but not platform terms', async () => {
  const status = await dpdpAcknowledgements.acknowledgementStatus({ user: orgAdmin, channel: 'WEB' });
  if (status.missingDocumentIds.length) {
    await dpdpAcknowledgements.recordAcknowledgements({
      user: orgAdmin,
      documentIds: status.missingDocumentIds,
      channel: 'WEB',
    });
  }
  const listRes = await request('/org/dpdp/documents', orgAdminToken);
  assert.equal(listRes.status, 200);

  // Reject publishing TERMS as organisation
  const badRes = await request('/org/dpdp/documents/publish', orgAdminToken, 'POST', {
    type: 'TERMS',
    title: 'Bank Attempting Terms',
    body: 'Content',
    version: '2.0',
  });
  assert.equal(badRes.status, 400);

  // Success publishing EMPLOYEE_NOTICE
  const pubRes = await request('/org/dpdp/documents/publish', orgAdminToken, 'POST', {
    type: 'EMPLOYEE_NOTICE',
    title: 'Updated Employee Privacy Notice',
    body: 'Updated bank notice content',
    version: '1.1',
  });
  assert.equal(pubRes.status, 201);
  assert.equal(pubRes.body.data.version, '1.1');
});
