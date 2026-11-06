'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'service-book-test-secret-only';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { sequelize, Organization, PostCadre, Employee, User, PayrollRun, PayrollRunLine } = require('../src/models');
const { signToken } = require('../src/services/authService');
const routes = require('../src/routes');

let server, base, employee, ownToken, otherToken, hrToken, payrollToken, orgAdminToken, orgId, directPayId;
async function getBook(id, token) {
  const response = await fetch(`${base}/employees/${id}/service-book`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  await sequelize.sync();
  const org = await Organization.create({ code: 'BOOK', name: 'Service Book Bank', bankClass: 'CLASS_I' });
  orgId = org.id;
  const post = await PostCadre.create({ organizationId: org.id, code: 'A', name: 'Assistant' });
  employee = await Employee.create({ organizationId: org.id, empCode: 'E1', name: 'Employee One', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 10000 });
  const other = await Employee.create({ organizationId: org.id, empCode: 'E2', name: 'Employee Two', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 10000 });
  const owner = await User.create({ organizationId: org.id, employeeId: employee.id, name: 'Owner', email: 'owner@test.invalid', role: 'EMPLOYEE', passwordHash: 'unused' });
  const stranger = await User.create({ organizationId: org.id, employeeId: other.id, name: 'Other', email: 'other@test.invalid', role: 'EMPLOYEE', passwordHash: 'unused' });
  ownToken = signToken(owner); otherToken = signToken(stranger);
  const hr = await User.create({ organizationId: org.id, name: 'HR', email: 'hr@test.invalid', role: 'HR_OFFICER', passwordHash: 'unused' });
  const payroll = await User.create({ organizationId: org.id, name: 'Payroll', email: 'payroll@test.invalid', role: 'PAYROLL_OFFICER', passwordHash: 'unused' });
  const orgAdmin = await User.create({ organizationId: org.id, name: 'Org Admin', email: 'admin@test.invalid', role: 'ORG_ADMIN', passwordHash: 'unused' });
  hrToken = signToken(hr); payrollToken = signToken(payroll);
  orgAdminToken = signToken(orgAdmin);
  for (const status of ['PROCESSED', 'APPROVED', 'PAID', 'REJECTED']) {
    const run = await PayrollRun.create({ organizationId: org.id, year: 2026, month: { PROCESSED: 1, APPROVED: 2, PAID: 3, REJECTED: 4 }[status], status });
    await PayrollRunLine.create({ payrollRunId: run.id, employeeId: employee.id, empCode: 'E1', employeeName: 'Employee One', grossEarnings: 10000, totalDeductions: 0, netPay: 10000, payslipJson: JSON.stringify({ netPay: 10000, earnings: { basic: 10000, grossEarnings: 10000 }, deductions: { totalDeductions: 0 } }) });
  }
  const app = express(); app.use(express.json()); app.use('/api/v1', routes);
  server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
test('bank HR enters overdraft repayment terms and payroll staff cannot create loans', async () => {
  const path = `${base}/employees/${employee.id}/overdrafts`;
  const terms = { amount: 1000, totalRepaymentAmount: 1050, monthlyPayment: 100, repayMonths: 12, availedDate: '2026-01-01' };
  const call = (token, body) => fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await call(payrollToken, terms)).status, 403);
  assert.equal((await call(hrToken, { ...terms, totalRepaymentAmount: 5000 })).status, 400);
  const response = await call(hrToken, terms);
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  assert.equal(Number(body.data.totalRepaymentAmount), 1050);
  assert.equal(body.data.interest, 0);
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await sequelize.close(); });
test('service book exposes approved and paid snapshots only to the linked employee', async () => {
  const own = await getBook(employee.id, ownToken);
  assert.equal(own.status, 200);
  assert.deepEqual(own.body.data.payslips.map((p) => p.month), [3, 2]);
  assert.equal(own.body.data.payslips[0].payslip.netPay, 10000);
  assert.equal((await getBook(employee.id, otherToken)).status, 404);
  assert.equal((await fetch(`${base}/employees`, { headers: { Authorization: `Bearer ${ownToken}` } })).status, 403);
});
test('direct-pay staff have bank-set salary without a scale and cannot receive self-service accounts', async () => {
  const response = await fetch(`${base}/employees`, { method: 'POST', headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId: orgId, empCode: 'S1', name: 'Security Staff', doj: '2026-01-01', dob: '1995-01-01', postCadreId: employee.postCadreId, directPay: true, currentBasicPay: 14000, panNumber: 'AAAAA1234A', aadhaarNumber: '123456789012', personalEmail: 'security@test.invalid', designation: 'Security', bankName: 'Bank', bankAccountNumber: '1234567890', bankIfsc: 'TEST0000001', gender: 'MALE' }) });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  directPayId = body.data.id;
  assert.equal(body.data.directPay, true);
  assert.equal(body.data.currentPayScaleId == null, true);
  const account = await fetch(`${base}/organizations/${orgId}/users`, { method: 'POST', headers: { Authorization: `Bearer ${orgAdminToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'security@test.invalid', name: 'Security Staff', role: 'EMPLOYEE', employeeId: body.data.id }) });
  assert.equal(account.status, 400);
  const genericChange = await fetch(`${base}/employees/${body.data.id}`, { method: 'PUT', headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ currentBasicPay: 15000 }) });
  assert.equal(genericChange.status, 400);
  const salaryChange = await fetch(`${base}/employees/${body.data.id}/direct-pay-salary`, { method: 'PUT', headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 15000, reason: 'Annual bank salary revision' }) });
  assert.equal(salaryChange.status, 200);
  const book = await getBook(body.data.id, hrToken);
  assert.equal(book.body.data.timeline.at(-1).eventType, 'OTHER');
  assert.equal(Number(book.body.data.employee.currentBasicPay), 15000);
});
test('direct-pay staff are included in monthly payroll without a government scale', async () => {
  const run = await require('../src/services/payrollEngine').processRun({ organizationId: orgId, year: 2026, month: 11 });
  const line = await PayrollRunLine.findOne({ where: { payrollRunId: run.id, employeeId: directPayId } });
  assert.ok(line);
  const slip = JSON.parse(line.payslipJson);
  assert.equal(slip.directPay, true);
  assert.equal(slip.grade, null);
  assert.equal(slip.earnings.grossEarnings, 15000);
});
