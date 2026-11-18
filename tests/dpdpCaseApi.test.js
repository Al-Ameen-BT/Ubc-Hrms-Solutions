'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'dpdp-case-api-test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  sequelize,
  Organization,
  User,
  Employee,
  PostCadre,
} = require('../src/models');
const { signToken, hashPassword } = require('../src/services/authService');
const routes = require('../src/routes');

let server;
let base;
let org;
let employee;
let empUser;
let dpoUser;

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
  org = await Organization.create({ code: 'CASE_API', name: 'Case API Bank' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'OFF_CASE', name: 'Officer' });

  employee = await Employee.create({
    organizationId: org.id,
    empCode: 'CASE_E1',
    name: 'Case Staff',
    doj: '2020-01-01',
    postCadreId: post.id,
    currentBasicPay: 40000,
  });

  const dpoEmp = await Employee.create({
    organizationId: org.id,
    empCode: 'DPO_E1',
    name: 'DPO Staff',
    doj: '2020-01-01',
    postCadreId: post.id,
    currentBasicPay: 50000,
  });

  const pwd = await hashPassword('Secret123!');
  empUser = await User.create({
    organizationId: org.id,
    email: 'staff@caseapi.invalid',
    name: 'Staff Case',
    role: 'EMPLOYEE',
    employeeId: employee.id,
    passwordHash: pwd,
  });

  dpoUser = await User.create({
    organizationId: org.id,
    email: 'dpo@caseapi.invalid',
    name: 'DPO Case',
    role: 'DATA_PROTECTION_OFFICER',
    employeeId: dpoEmp.id,
    passwordHash: pwd,
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

test('Employee can submit rights request at /me/dpdp/requests', async () => {
  const token = signToken(empUser);
  const res = await request('/me/dpdp/requests', token, 'POST', {
    requestType: 'ACCESS',
    details: 'Need copy of personal data',
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.data.requestType, 'ACCESS');

  const listRes = await request('/me/dpdp/requests', token, 'GET');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.data.length, 1);
});

test('DPO can view organization requests and decide case at /org/dpdp/requests', async () => {
  const dpoToken = signToken(dpoUser);
  const listRes = await request('/org/dpdp/requests', dpoToken, 'GET');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.data.length, 1);

  const reqId = listRes.body.data[0].id;
  const decideRes = await request(`/org/dpdp/requests/${reqId}/decide`, dpoToken, 'POST', {
    status: 'COMPLETED',
    decisionReason: 'Report generated and provided.',
    dpoResponse: 'Data delivered to employee portal.',
  });

  assert.equal(decideRes.status, 200);
  assert.equal(decideRes.body.data.status, 'COMPLETED');
});

test('DPO can register and list incidents at /org/dpdp/incidents', async () => {
  const dpoToken = signToken(dpoUser);
  const incRes = await request('/org/dpdp/incidents', dpoToken, 'POST', {
    title: 'Phishing attempt against staff email',
    severity: 'MEDIUM',
    awareAt: '2026-11-18T10:00:00.000Z',
    summary: 'Phishing campaign detected and blocked at mail filter.',
  });

  assert.equal(incRes.status, 201);
  assert.equal(incRes.body.data.title, 'Phishing attempt against staff email');
  assert.equal(incRes.body.data.boardDetailedDueAt, '2026-11-21T10:00:00.000Z');

  const closeRes = await request(`/org/dpdp/incidents/${incRes.body.data.id}`, dpoToken, 'PUT', {
    status: 'CLOSED',
    rootCause: 'Credential harvesting email',
    correctiveActions: 'Mail rule and staff guidance updated',
    affectedPrincipalNotificationStatus: 'NOT_REQUIRED',
    boardNotificationStatus: 'NOT_REQUIRED',
  });
  assert.equal(closeRes.status, 200);
  assert.equal(closeRes.body.data.status, 'CLOSED');

  const listIncRes = await request('/org/dpdp/incidents', dpoToken, 'GET');
  assert.equal(listIncRes.status, 200);
  assert.equal(listIncRes.body.data.length, 1);
});

test('DPO can create and list controlled retention proposals', async () => {
  const token = signToken(dpoUser);
  const created = await request('/org/dpdp/retention/proposals', token, 'POST', {
    category: 'TEMP_ATTACHMENTS',
    cutoffAt: '2026-10-01',
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.status, 'PROPOSED');

  const list = await request('/org/dpdp/retention/proposals', token);
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 1);
});

test('DPO assisted intake and identity verification advance an external case', async () => {
  const token = signToken(dpoUser);
  const created = await request('/org/dpdp/requests/assisted', token, 'POST', {
    principalType: 'CANDIDATE', principalReference: 'C-19', principalName: 'Candidate Nineteen',
    requestType: 'CORRECTION', details: 'Correct candidate record',
  });
  assert.equal(created.status, 201);
  assert.match(created.body.data.caseId, /^DPDP-/);

  const verified = await request(`/org/dpdp/requests/${created.body.data.id}/verify`, token, 'POST', { method: 'OFFLINE_ID_AND_APPLICATION' });
  assert.equal(verified.status, 200);
  const advanced = await request(`/org/dpdp/requests/${created.body.data.id}/advance`, token, 'POST', { status: 'IN_REVIEW' });
  assert.equal(advanced.status, 200);
  assert.equal(advanced.body.data.status, 'IN_REVIEW');
});

test('employee privacy summary and nomination remain self-owned', async () => {
  const token = signToken(empUser);
  const summary = await request('/me/dpdp/summary', token);
  assert.equal(summary.status, 200);
  assert.equal(summary.body.data.employee.empCode, employee.empCode);

  const nomination = await request('/me/dpdp/nomination', token, 'POST', { nomineeName: 'Trusted Nominee', relationship: 'Sibling', contact: 'nominee@example.invalid' });
  assert.equal(nomination.status, 201);
  const current = await request('/me/dpdp/nomination', token);
  assert.equal(current.status, 200);
  assert.equal(current.body.data.nomineeName, 'Trusted Nominee');
});
