'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'dpdp-registry-api-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { sequelize, Organization, User } = require('../src/models');
const { signToken } = require('../src/services/authService');
const routes = require('../src/routes');

let server;
let base;
let org;
let token;

async function request(path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

before(async () => {
  await sequelize.sync({ force: true });
  org = await Organization.create({ code: 'REG_API', name: 'Registry API Bank' });
  const user = await User.create({ organizationId: org.id, email: 'admin@regapi.invalid', name: 'Registry Admin', role: 'ORG_ADMIN', passwordHash: 'x' });
  token = signToken(user);
  const app = express();
  app.use(express.json());
  app.use('/api/v1', routes);
  server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    instance.on('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await sequelize.close();
});

test('organisation DPDP registry routes create tenant-owned records and dashboard totals', async () => {
  const processor = await request('/org/dpdp/processors', 'POST', { code: 'CLOUD', name: 'Cloud Host', dpaStatus: 'CURRENT', status: 'ACTIVE' });
  assert.equal(processor.status, 201);

  const activity = await request('/org/dpdp/processing-activities', 'POST', {
    code: 'EMP_NAME', module: 'PEOPLE', storageLocation: 'employee.name', fieldName: 'name', dataCategory: 'BASIC_IDENTITY',
    principalType: 'EMPLOYEE', purpose: 'Employment administration', lawfulBasis: 'EMPLOYMENT_LEGITIMATE_USE',
    securityClassification: 'INTERNAL', processorIds: [processor.body.data.id], retentionCategory: 'SERVICE_BOOK',
  });
  assert.equal(activity.status, 201);

  const control = await request('/org/dpdp/controls', 'PUT', { controlCode: 'MFA_PRIVILEGED', title: 'Privileged MFA', status: 'IMPLEMENTED', evidenceReference: 'MFA policy' });
  assert.equal(control.status, 200);

  const dashboard = await request('/org/dpdp/dashboard');
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.data.processingActivities.total, 1);
  assert.equal(dashboard.body.data.processors.current, 1);

  const list = await request('/org/dpdp/processing-activities');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 1);
  assert.equal(list.body.data[0].organizationId, org.id);
});
