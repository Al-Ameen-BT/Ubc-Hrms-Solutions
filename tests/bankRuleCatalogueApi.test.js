'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'catalogue-api-test-secret-only';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { sequelize, User, Organization, AuditLog, PayScale, PostCadre } = require('../src/models');
const { signToken } = require('../src/services/authService');
const routes = require('../src/routes');
let server, base, adminToken;
const orgTokens = [];
async function call(method, path, body, token = adminToken) {
  const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  await sequelize.sync();
  const admin = await User.create({ name: 'Platform test', email: 'platform@test.invalid', role: 'SUPER_ADMIN', passwordHash: 'unused', mustChangePassword: false });
  const org = await Organization.create({ code: 'TEST', name: 'Test bank', bankClass: 'CLASS_I' });
  for (const role of User.ROLES.filter(r => r !== 'SUPER_ADMIN')) {
    const user = await User.create({ name: role, email: `${role.toLowerCase()}@test.invalid`, organizationId: org.id, role, passwordHash: 'unused', mustChangePassword: false });
    orgTokens.push(signToken(user));
  }
  adminToken = signToken(admin);
  const app = express(); app.use(express.json()); app.use('/api/v1', routes);
  server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}/api/v1/admin/bank-rule-catalogue`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await sequelize.close(); });
test('rejects anonymous and organisation users on all catalogue endpoints', async () => {
  assert.equal((await call('GET', '/', undefined, null)).status, 401);
  for (const token of orgTokens) for (const [method, path, body] of [['POST', '/preview', {}], ['GET', '/'], ['GET', '/metadata'], ['GET', '/reference/CLASS_I'], ['POST', '/', {}], ['GET', '/1'], ['PUT', '/1', {}], ['POST', '/1/publish', {}], ['DELETE', '/1', { version: 1 }]]) {
    assert.equal((await call(method, path, body, token)).status, 403, `${method} ${path}`);
  }
});
test('metadata, reference library, persisted drafts and publication work through the API', async () => {
  const metadata = await call('GET', '/metadata');
  assert.equal(metadata.status, 200);
  assert.equal(metadata.body.data.classes.length, 6);
  assert.ok(metadata.body.data.payrollFields.some(f => f.key === 'daPercent'));
  const ref = await call('GET', '/reference/CLASS_I');
  assert.equal(ref.status, 200);
  const previewed = await call('POST', '/preview', { name: 'Preview', bankClass: 'CLASS_I', posts: ref.body.data.posts });
  assert.equal(previewed.status, 200);
  assert.ok(previewed.body.data.posts[0].stages.length);
  const created = await call('POST', '/', { name: 'Test order', bankClass: 'CLASS_I', posts: ref.body.data.posts });
  assert.equal(created.status, 201);
  let row = created.body.data;
  assert.equal(row.status, 'DRAFT');
  const saved = await call('PUT', `/${row.id}`, { ...row, orderNumber: 'TEST/1', issuingAuthority: 'Test authority', sourceUrl: 'https://example.gov.in/order.pdf', orderDate: '2026-01-01', effectiveDate: '2026-04-01' });
  assert.equal(saved.status, 200); row = saved.body.data;
  assert.equal((await call('POST', `/${row.id}/publish`, { version: row.version, verified: true, verificationNote: 'Compared against source.' })).status, 200);
  assert.equal((await call('PUT', `/${row.id}`, row)).status, 409);
  assert.equal((await call('DELETE', `/${row.id}`, { version: row.version })).status, 409);
  const listed = await call('GET', '/?bankClass=CLASS_I&status=PUBLISHED');
  assert.equal(listed.body.data.length, 1);
  assert.equal(listed.body.data[0].postCount, ref.body.data.posts.length);
  assert.equal(listed.body.data[0].adoptedBankCount, 0);
  assert.ok(await AuditLog.count({ where: { action: 'bank-catalogue.publish' } }));
});
test('rejects invalid filters, malformed IDs, version omissions and source tampering', async () => {
  assert.equal((await call('GET', '/?bankClass=INVALID')).status, 400);
  assert.equal((await call('GET', '/?status=INVALID')).status, 400);
  assert.equal((await call('GET', '/abc')).status, 400);
  assert.equal((await call('GET', '/99999')).status, 404);
  assert.equal((await call('POST', '/', { name: 'Bad class', bankClass: '__proto__' })).status, 400);
  const created = await call('POST', '/', { name: 'Delete me', bankClass: 'CLASS_V', status: 'PUBLISHED', createdByUserId: 999 });
  assert.equal(created.body.data.status, 'DRAFT');
  assert.notEqual(created.body.data.createdByUserId, 999);
  const id = created.body.data.id;
  assert.equal((await call('DELETE', `/${id}`, {})).status, 409);
  assert.equal((await call('DELETE', `/${id}`, { version: 1 })).status, 200);
});

test('new bank waits for verified catalogue adoption instead of receiving reference pay stages', async () => {
  const response = await fetch(`${base.replace('/bank-rule-catalogue', '')}/organizations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ code: 'PENDING', name: 'Pending Setup Bank', bankClass: 'CLASS_V' }),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(await PayScale.count({ where: { organizationId: body.data.id } }), 0);
  assert.deepEqual((await PostCadre.findAll({ where: { organizationId: body.data.id } })).map(row => row.code), ['UNASSIGNED']);
});
