'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'employee-self-service-test-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { sequelize, Organization, PostCadre, Employee, User, PayrollRun, PayrollRunLine, LeaveType, EmployeeLeaveBalance, LeaveApplication } = require('../src/models');
const { signToken } = require('../src/services/authService');
const routes = require('../src/routes');
const leaveService = require('../src/services/leave');

let server, base, org, employee, other, ownerToken, otherToken, adminToken, unlinkedToken, foreignToken, payLine;
const request = async (path, token, method = 'GET', body) => {
  const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.arrayBuffer() };
};

before(async () => {
  await sequelize.sync();
  org = await Organization.create({ code: 'SELF', name: 'Self Service Bank' });
  const foreignOrg = await Organization.create({ code: 'OTHER', name: 'Other Bank' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'ASSIST', name: 'Assistant' });
  employee = await Employee.create({ organizationId: org.id, empCode: 'E1', name: 'One', doj: '2020-01-01', postCadreId: post.id, directPay: true, currentBasicPay: 10000 });
  other = await Employee.create({ organizationId: org.id, empCode: 'E2', name: 'Two', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 12000 });
  const owner = await User.create({ organizationId: org.id, employeeId: employee.id, email: 'one@self.invalid', name: 'One', role: 'EMPLOYEE', passwordHash: 'unused' });
  const outsider = await User.create({ organizationId: org.id, employeeId: other.id, email: 'two@self.invalid', name: 'Two', role: 'EMPLOYEE', passwordHash: 'unused' });
  const unlinked = await User.create({ organizationId: org.id, email: 'unlinked@self.invalid', name: 'Unlinked', role: 'EMPLOYEE', passwordHash: 'unused' });
  const foreign = await User.create({ organizationId: foreignOrg.id, employeeId: employee.id, email: 'foreign@self.invalid', name: 'Foreign', role: 'EMPLOYEE', passwordHash: 'unused' });
  const admin = await User.create({ organizationId: org.id, email: 'admin@self.invalid', name: 'Admin', role: 'ORG_ADMIN', passwordHash: 'unused' });
  ownerToken = signToken(owner); otherToken = signToken(outsider); unlinkedToken = signToken(unlinked); foreignToken = signToken(foreign); adminToken = signToken(admin);
  for (const [month, status] of [[1, 'PROCESSED'], [2, 'APPROVED'], [3, 'PAID']]) {
    const run = await PayrollRun.create({ organizationId: org.id, year: 2026, month, status });
    const line = await PayrollRunLine.create({ payrollRunId: run.id, employeeId: employee.id, empCode: 'E1', employeeName: 'One', grossEarnings: 10000, totalDeductions: 0, netPay: 10000, payslipJson: JSON.stringify({ netPay: 10000, earnings: { basic: 10000, grossEarnings: 10000 }, deductions: { totalDeductions: 0 } }) });
    if (month === 2) payLine = line;
  }
  const type = await LeaveType.create({ organizationId: org.id, code: 'CL', name: 'Casual Leave', accrualMethod: 'FIXED_ANNUAL', annualDays: 5 });
  await EmployeeLeaveBalance.create({ employeeId: employee.id, leaveTypeId: type.id, year: 2026, openingBalance: 5, closingBalance: 5 });
  const app = express(); app.use(express.json()); app.use('/api/v1', routes);
  server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await sequelize.close(); });

test('unlinked and cross-tenant links cannot expose employee data', async () => {
  assert.equal((await request('/me/context', unlinkedToken)).status, 200);
  assert.equal((await request('/me/leave/balances', unlinkedToken)).status, 409);
  assert.equal((await request('/me/payslips', foreignToken)).status, 409);
  assert.equal((await request('/me/payslips', adminToken)).status, 403);
});

test('employee gets only finalized own payslips and an authenticated frozen PDF', async () => {
  const result = await request('/me/payslips', ownerToken);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data.map(row => row.month), [3, 2]);
  assert.equal((await request(`/me/payslips/${payLine.id}/pdf`, ownerToken)).status, 200);
  assert.equal((await request(`/me/payslips/${payLine.id}/pdf`, otherToken)).status, 404);
});

test('employee can see balance, request leave, and cancel only own pending request', async () => {
  const balances = await request('/me/leave/balances?year=2026', ownerToken);
  assert.equal(balances.status, 200);
  assert.equal(Number(balances.body.data[0].closingBalance), 5);
  const applied = await request('/me/leave/applications', ownerToken, 'POST', { leaveTypeId: balances.body.data[0].leaveTypeId, fromDate: '2026-11-20', toDate: '2026-11-21', reason: 'Family' });
  assert.equal(applied.status, 201);
  const id = applied.body.data.id;
  assert.equal((await request(`/me/leave/applications/${id}/cancel`, otherToken, 'POST', {})).status, 404);
  assert.equal((await request(`/me/leave/applications/${id}/cancel`, ownerToken, 'POST', {})).status, 200);
  assert.equal((await LeaveApplication.findByPk(id)).status, 'CANCELLED');
});

test('direct-pay employee can receive account, but an active duplicate link is rejected', async () => {
  const duplicate = await request(`/organizations/${org.id}/users`, adminToken, 'POST', { email: 'duplicate@self.invalid', name: 'Duplicate', role: 'EMPLOYEE', employeeId: employee.id });
  assert.equal(duplicate.status, 409);
  const newDirectPay = await Employee.create({ organizationId: org.id, empCode: 'DP2', name: 'Direct Pay', doj: '2026-01-01', postCadreId: employee.postCadreId, directPay: true, currentBasicPay: 9000 });
  const created = await request(`/organizations/${org.id}/users`, adminToken, 'POST', { email: 'dp2@self.invalid', name: 'Direct Pay', role: 'EMPLOYEE', employeeId: newDirectPay.id });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.employeeId, newDirectPay.id);
  const moveToUsed = await request(`/organizations/${org.id}/users/${created.body.data.id}`, adminToken, 'PUT', { employeeId: employee.id });
  assert.equal(moveToUsed.status, 409);
  const clear = await request(`/organizations/${org.id}/users/${created.body.data.id}`, adminToken, 'PUT', { employeeId: null });
  assert.equal(clear.status, 200);
  assert.equal(clear.body.data.employeeId, null);
});

test('ambiguous active account links fail closed for employee data', async () => {
  const duplicate = await User.create({ organizationId: org.id, employeeId: employee.id, email: 'ambiguous@self.invalid', name: 'Ambiguous', role: 'EMPLOYEE', passwordHash: 'unused' });
  try { assert.equal((await request('/me/payslips', ownerToken)).status, 409); }
  finally { await duplicate.destroy(); }
});

test('stale pending leave cancellation cannot overwrite an approval or its balance', async () => {
  const type = await LeaveType.findOne({ where: { organizationId: org.id, code: 'CL' } });
  const application = await leaveService.applyLeave(employee, { leaveTypeId: type.id, fromDate: '2026-11-25', toDate: '2026-11-26', reason: 'Visit' }, 1);
  const stale = await LeaveApplication.findByPk(application.id);
  await leaveService.decideLeave(application, 'APPROVED', 5);
  await assert.rejects(() => leaveService.cancelLeave(stale, 1), err => err.status === 409);
  assert.equal((await LeaveApplication.findByPk(application.id)).status, 'APPROVED');
  assert.equal(Number((await EmployeeLeaveBalance.findOne({ where: { employeeId: employee.id, leaveTypeId: type.id, year: 2026 } })).closingBalance), 3);
});
