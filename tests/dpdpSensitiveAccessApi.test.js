'use strict';
process.env.DB_DIALECT = 'sqlite'; process.env.DB_STORAGE = ':memory:'; process.env.JWT_SECRET = 'sensitive-api-test-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { sequelize, Organization, User, Employee, PostCadre } = require('../src/models');
const { signToken } = require('../src/services/authService');
const routes = require('../src/routes');
let server; let base; let actor; let employee;
const request = async (path, token, method = 'GET', body) => { const res = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, body: await res.json() }; };

before(async () => {
  await sequelize.sync({ force: true });
  const org = await Organization.create({ code: 'MASK_API', name: 'Mask API Bank' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'OFF', name: 'Officer' });
  employee = await Employee.create({ organizationId: org.id, empCode: 'MA1', name: 'API Employee', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 1, panNumber: 'ABCDE1234F', aadhaarNumber: '123456789012', bankAccountNumber: '001122334455' });
  actor = await User.create({ organizationId: org.id, email: 'admin@maskapi.invalid', name: 'Admin', role: 'ORG_ADMIN', passwordHash: 'x' });
  const app = express(); app.use(express.json()); app.use('/api/v1', routes);
  server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await sequelize.close(); });

test('employee detail is masked and one sensitive group can be revealed', async () => {
  const token = signToken(actor);
  const detail = await request(`/employees/${employee.id}`, token);
  assert.equal(detail.status, 200);
  assert.notEqual(detail.body.data.panNumber, 'ABCDE1234F');
  assert.notEqual(detail.body.data.bankAccountNumber, '001122334455');
  const serviceBook = await request(`/employees/${employee.id}/service-book`, token);
  assert.equal(serviceBook.status, 200);
  assert.notEqual(serviceBook.body.data.employee.aadhaarNumber, '123456789012');

  const revealed = await request('/org/dpdp/sensitive-access', token, 'POST', { employeeId: employee.id, fieldGroup: 'BANK', purpose: 'PAYROLL_VERIFICATION', justification: 'Validate salary account before payroll.' });
  assert.equal(revealed.status, 200);
  assert.equal(revealed.body.data.values.bankAccountNumber, '001122334455');
  assert.equal(Object.hasOwn(revealed.body.data.values, 'panNumber'), false);
});
