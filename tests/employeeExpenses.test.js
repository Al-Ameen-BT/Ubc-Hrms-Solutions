'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'employee-expense-test-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { sequelize, Organization, PostCadre, Employee, User, ExpenseClaim } = require('../src/models');
const { signToken } = require('../src/services/authService');
const routes = require('../src/routes');
let server, base, employeeToken, otherToken, accountsToken, payrollToken, approverToken, orgAdminToken;
const receipt = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\nreceipt').toString('base64')}`;
async function call(path, token, method = 'GET', body) {
  const r = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); return { status: r.status, body: text.startsWith('{') ? JSON.parse(text) : null, contentType: r.headers.get('content-type') };
}
before(async () => {
  await sequelize.sync();
  const org = await Organization.create({ code: 'EXP', name: 'Expense Bank' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'A', name: 'Assistant' });
  const first = await Employee.create({ organizationId: org.id, empCode: 'X1', name: 'One', doj: '2020-01-01', postCadreId: post.id });
  const second = await Employee.create({ organizationId: org.id, empCode: 'X2', name: 'Two', doj: '2020-01-01', postCadreId: post.id });
  const users = [];
  for (const [name, role, employeeId] of [['one', 'EMPLOYEE', first.id], ['two', 'EMPLOYEE', second.id], ['accounts', 'ACCOUNTS_OFFICER'], ['payroll', 'PAYROLL_OFFICER'], ['approver', 'APPROVING_AUTHORITY'], ['admin', 'ORG_ADMIN']]) users.push(await User.create({ organizationId: org.id, employeeId, email: `${name}@exp.invalid`, name, role, passwordHash: 'unused' }));
  [employeeToken, otherToken, accountsToken, payrollToken, approverToken, orgAdminToken] = users.map(signToken);
  const app = express(); app.use(express.json({ limit: '10mb' })); app.use('/api/v1', routes);
  server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await sequelize.close(); });
const claim = (amount = 250) => ({ expenseDate: '2026-11-01', category: 'Travel', purpose: 'Branch visit', amount, receiptDataUrl: receipt });

test('claim amount is whole rupees and receipt is private', async () => {
  assert.equal((await call('/me/expenses', employeeToken, 'POST', claim(250.5))).status, 400);
  assert.equal((await call('/me/expenses', employeeToken, 'POST', { ...claim(), receiptDataUrl: null })).status, 400);
  const created = await call('/me/expenses', employeeToken, 'POST', claim());
  assert.equal(created.status, 201);
  assert.equal(Number(created.body.data.amount), 250);
  assert.equal((await call('/me/expenses', otherToken)).body.data.length, 0);
  assert.equal((await call(`/me/expenses/${created.body.data.id}/receipt`, otherToken)).status, 404);
  assert.equal((await call(`/me/expenses/${created.body.data.id}/receipt`, employeeToken)).contentType, 'application/pdf');
});

test('claim requires a separate preparer, approver and payer', async () => {
  const created = await call('/me/expenses', employeeToken, 'POST', claim());
  assert.equal(created.status, 201);
  const id = created.body.data.id;
  assert.equal((await call(`/org/expenses/${id}/decide`, approverToken, 'POST', { decision: 'APPROVED' })).status, 409);
  assert.equal((await call(`/org/expenses/${id}/prepare`, payrollToken, 'POST', {})).status, 200);
  assert.equal((await call(`/org/expenses/${id}/decide`, payrollToken, 'POST', { decision: 'APPROVED' })).status, 403);
  assert.equal((await call(`/org/expenses/${id}/decide`, approverToken, 'POST', { decision: 'APPROVED' })).status, 200);
  assert.equal((await call(`/org/expenses/${id}/pay`, accountsToken, 'POST', { paymentReference: 'BAD-DATE', paidAt: '2026-99-99' })).status, 400);
  assert.equal((await call(`/org/expenses/${id}/pay`, accountsToken, 'POST', { paymentReference: 'BANK-001', paidAt: '2026-11-10' })).status, 200);
  assert.equal((await call(`/org/expenses/${id}/pay`, accountsToken, 'POST', { paymentReference: 'BANK-002', paidAt: '2026-11-10' })).status, 409);
  assert.equal((await call(`/me/expenses/${id}/withdraw`, employeeToken, 'POST', {})).status, 409);
  assert.equal((await call(`/org/expenses/${id}/receipt`, orgAdminToken)).contentType, 'application/pdf');
});

test('concurrent payment attempts can mark an approved claim paid only once', async () => {
  const created = await call('/me/expenses', employeeToken, 'POST', claim());
  const id = created.body.data.id;
  await call(`/org/expenses/${id}/prepare`, payrollToken, 'POST', {});
  await call(`/org/expenses/${id}/decide`, approverToken, 'POST', { decision: 'APPROVED' });
  const results = await Promise.all(['BANK-A', 'BANK-B'].map(paymentReference => call(`/org/expenses/${id}/pay`, accountsToken, 'POST', { paymentReference, paidAt: '2026-11-10' })));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
});

test('withdrawal and approval cannot both succeed on the same prepared claim', async () => {
  const created = await call('/me/expenses', employeeToken, 'POST', claim());
  const id = created.body.data.id;
  await call(`/org/expenses/${id}/prepare`, payrollToken, 'POST', {});
  const waiting = [];
  ExpenseClaim.addHook('beforeUpdate', 'forceDecisionRace', async () => new Promise(resolve => { waiting.push(resolve); if (waiting.length === 2) waiting.forEach(release => release()); }));
  let results;
  try {
    results = await Promise.all([
      call(`/me/expenses/${id}/withdraw`, employeeToken, 'POST', {}),
      call(`/org/expenses/${id}/decide`, approverToken, 'POST', { decision: 'APPROVED' }),
    ]);
  } finally { ExpenseClaim.removeHook('beforeUpdate', 'forceDecisionRace'); }
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
});
