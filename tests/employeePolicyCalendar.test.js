'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'employee-policy-test-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { sequelize, Organization, PostCadre, Employee, User } = require('../src/models');
const { signToken } = require('../src/services/authService');
const routes = require('../src/routes');
let server, base, employeeToken, adminToken, otherAdminToken;
async function call(path, token, method = 'GET', body) {
  const r = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, body: text.startsWith('{') ? JSON.parse(text) : { data: null } };
}
before(async () => {
  await sequelize.sync();
  const org = await Organization.create({ code: 'POL', name: 'Policy Bank' });
  const otherOrg = await Organization.create({ code: 'POL2', name: 'Other Bank' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'A', name: 'Assistant' });
  const employee = await Employee.create({ organizationId: org.id, empCode: 'P1', name: 'Policy Employee', doj: '2020-01-01', postCadreId: post.id });
  const owner = await User.create({ organizationId: org.id, employeeId: employee.id, email: 'emp@pol.invalid', name: 'Employee', role: 'EMPLOYEE', passwordHash: 'unused' });
  const admin = await User.create({ organizationId: org.id, email: 'admin@pol.invalid', name: 'Admin', role: 'ORG_ADMIN', passwordHash: 'unused' });
  const otherAdmin = await User.create({ organizationId: otherOrg.id, email: 'other@pol.invalid', name: 'Other', role: 'ORG_ADMIN', passwordHash: 'unused' });
  employeeToken = signToken(owner); adminToken = signToken(admin); otherAdminToken = signToken(otherAdmin);
  const app = express(); app.use(express.json()); app.use('/api/v1', routes);
  server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await sequelize.close(); });

test('policy acknowledgement is tied to an immutable version', async () => {
  const empty = await call('/me/policy', employeeToken);
  assert.equal(empty.status, 200);
  assert.equal(empty.body.data.policy, null);
  const first = await call('/org/employee-policy', adminToken, 'POST', { title: 'Conduct', body: 'First policy' });
  assert.equal(first.status, 201);
  assert.equal(first.body.data.version, 1);
  const same = await call('/org/employee-policy', adminToken, 'POST', { title: 'Conduct', body: 'First policy' });
  assert.equal(same.body.data.version, 1);
  const accepted = await call('/me/policy/acknowledge', employeeToken, 'POST', { version: 1 });
  assert.equal(accepted.status, 201);
  assert.equal((await call('/me/policy', employeeToken)).body.data.acknowledged, true);
  const second = await call('/org/employee-policy', adminToken, 'POST', { title: 'Conduct', body: 'Updated policy' });
  assert.equal(second.body.data.version, 2);
  assert.equal((await call('/me/policy', employeeToken)).body.data.acknowledged, false);
  assert.equal((await call('/me/policy/acknowledge', employeeToken, 'POST', { version: 1 })).status, 409);
  assert.equal((await call('/me/policy', employeeToken)).body.data.history.length, 1);
});

test('calendar contains own-bank holidays and rejects malformed month', async () => {
  assert.equal((await call('/org/holidays', adminToken, 'POST', { date: '2026-99-99', name: 'Invalid' })).status, 400);
  const holiday = await call('/org/holidays', adminToken, 'POST', { date: '2026-11-14', name: 'Bank Holiday' });
  assert.equal(holiday.status, 201);
  assert.equal((await call('/org/holidays', otherAdminToken, 'POST', { date: '2026-11-15', name: 'Other Bank Holiday' })).status, 201);
  const calendar = await call('/me/calendar?year=2026&month=11', employeeToken);
  assert.equal(calendar.status, 200);
  assert.deepEqual(calendar.body.data.holidays.map(h => h.name), ['Bank Holiday']);
  assert.equal((await call('/me/calendar?year=2026&month=13', employeeToken)).status, 400);
  assert.equal((await call('/org/holidays', adminToken, 'POST', { date: '2026-11-14', name: 'Duplicate' })).status, 409);
});
