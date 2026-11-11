'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'employee-time-test-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { sequelize, Organization, PostCadre, Employee, User, EmployeeTimeEntry, AuditLog, BankRuleCatalogue, EmployeeCompensationAssignment } = require('../src/models');
const { signToken } = require('../src/services/authService');
const routes = require('../src/routes');
let server, base, employeeToken, otherToken, hrToken, employeeId;
async function call(path, token, method = 'GET', body) {
  const r = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); return { status: r.status, body: text.startsWith('{') ? JSON.parse(text) : {} };
}
before(async () => {
  await sequelize.sync();
  const org = await Organization.create({ code: 'TIME', name: 'Time Bank' });
  const foreignOrg = await Organization.create({ code: 'TIME2', name: 'Foreign Bank' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });
  const employee = await Employee.create({ organizationId: org.id, empCode: 'T1', name: 'One', doj: '2020-01-01', postCadreId: post.id, branchName: 'Main', department: 'Operations', designation: 'Clerk', panNumber: 'AAAAA1234A', currentBasicPay: 10000 }); employeeId = employee.id;
  const other = await Employee.create({ organizationId: foreignOrg.id, empCode: 'T2', name: 'Foreign', doj: '2020-01-01', postCadreId: post.id });
  const owner = await User.create({ organizationId: org.id, employeeId: employee.id, email: 'one@time.invalid', name: 'One', role: 'EMPLOYEE', passwordHash: 'unused' });
  const foreign = await User.create({ organizationId: foreignOrg.id, employeeId: other.id, email: 'other@time.invalid', name: 'Foreign', role: 'EMPLOYEE', passwordHash: 'unused' });
  const hr = await User.create({ organizationId: org.id, email: 'hr@time.invalid', name: 'HR', role: 'HR_ADMIN', passwordHash: 'unused' });
  employeeToken = signToken(owner); otherToken = signToken(foreign); hrToken = signToken(hr);
  const app = express(); app.use(express.json()); app.use('/api/v1', routes);
  server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await sequelize.close(); });

test('workplace directory exposes only same-bank work identity', async () => {
  const result = await call('/me/workplace', employeeToken);
  assert.equal(result.status, 200);
  assert.equal(result.body.data.length, 1);
  assert.equal(result.body.data[0].name, 'One');
  assert.equal('panNumber' in result.body.data[0], false);
  assert.equal('currentBasicPay' in result.body.data[0], false);
  assert.equal((await call('/me/workplace', otherToken)).body.data.length, 1);
});

test('workplace directory shows the current approved catalogue role', async () => {
  const employee = await Employee.findByPk(employeeId);
  const catalogue = await BankRuleCatalogue.create({ name: 'Roles', bankClass: 'CLASS_I', status: 'PUBLISHED', effectiveDate: '2026-01-01', posts: [{ code: 'MANAGER', name: 'Manager', stages: [20000], payableDays: 30 }], rules: [], payrollDefaults: {}, createdByUserId: 1 });
  await EmployeeCompensationAssignment.create({ organizationId: employee.organizationId, employeeId, catalogueId: catalogue.id, postCode: 'MANAGER', stageNo: 1, amount: 20000, previousAmount: 10000, effectiveDate: '2026-01-01', reason: 'Role assignment', status: 'APPROVED', preparedBy: 1, decidedBy: 2 });
  const result = await call('/me/workplace', employeeToken);
  assert.equal(result.body.data[0].postName, 'Manager');
});

test('check-in/out permits one daily entry and staff correction needs a reason', async () => {
  const first = await call('/me/time/check-in', employeeToken, 'POST', {});
  assert.equal(first.status, 201);
  assert.equal((await call('/me/time/check-in', employeeToken, 'POST', {})).status, 409);
  assert.equal((await call(`/org/time/${first.body.data.id}/correct`, hrToken, 'PUT', { checkOutAt: new Date().toISOString() })).status, 400);
  const out = await call('/me/time/check-out', employeeToken, 'POST', {});
  assert.equal(out.status, 200);
  assert.ok(out.body.data.checkOutAt);
  assert.equal((await call('/me/time/check-out', employeeToken, 'POST', {})).status, 409);
  assert.equal((await call(`/org/time/${first.body.data.id}/correct`, hrToken, 'PUT', { checkOutAt: new Date().toISOString(), reason: 'Correcting missed exit' })).status, 200);
  assert.equal((await call('/me/time?year=2026&month=13', employeeToken)).status, 400);
  assert.equal((await call(`/org/time/${first.body.data.id}/correct`, otherToken, 'PUT', { reason: 'No' })).status, 403);
  assert.equal((await call('/me/time', otherToken)).body.data.length, 0);
});

test('time correction rolls back when its evidence cannot be recorded', async () => {
  const row = await EmployeeTimeEntry.findOne({ where: { employeeId } });
  const before = row.checkInAt.toISOString();
  const create = AuditLog.create;
  AuditLog.create = async () => { throw new Error('Audit unavailable'); };
  try {
    const result = await call(`/org/time/${row.id}/correct`, hrToken, 'PUT', { checkInAt: new Date(row.checkInAt.getTime() - 60000).toISOString(), reason: 'Clock correction' });
    assert.equal(result.status, 500);
  } finally { AuditLog.create = create; }
  await row.reload();
  assert.equal(row.checkInAt.toISOString(), before);
});
