'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'access-version-test-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { sequelize, Organization, Employee, PostCadre, User, EmployeeMobileDevice, EmployeeDeviceLink, AuditLog } = require('../src/models');
const auth = require('../src/services/authService');
const users = require('../src/services/userAdmin');
const { authenticate } = require('../src/middleware/auth');
const { effectiveAccess, can } = require('../src/services/accessControl');
let server, base, org, post, serial = 0;
before(async () => {
  await sequelize.sync();
  org = await Organization.create({ code: 'VERSIONS', name: 'Version Bank' });
  post = await PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });
  const app = express(); app.use(express.json());
  app.get('/protected', authenticate, (req, res) => res.json({ data: req.user }));
  app.use('/api/v1', require('../src/routes'));
  server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await sequelize.close(); });
async function request(path, method = 'GET', body, token) {
  const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text.startsWith('{') ? JSON.parse(text) : null };
}
async function user(role = 'PAYROLL_OFFICER') {
  const index = ++serial;
  const employee = await Employee.create({ organizationId: org.id, postCadreId: post.id, empCode: `E${index}`, name: 'Employee', doj: '2020-01-01' });
  return User.create({ organizationId: org.id, employeeId: employee.id, role, email: `version${index}@test.invalid`, name: 'User', passwordHash: await auth.hashPassword('current-secret'), mustChangePassword: false });
}
async function device(owner) {
  return EmployeeMobileDevice.create({ userId: owner.id, organizationId: org.id, name: 'Phone', platform: 'android', refreshHash: 'a'.repeat(64), lastUsedAt: new Date() });
}
async function link(owner, status = 'PENDING') {
  return EmployeeDeviceLink.create({ userId: owner.id, organizationId: org.id, challengeHash: String(++serial).padStart(64, '0'), status, expiresAt: new Date(Date.now() + 120000) });
}
async function mobileSession(owner) {
  const portalToken = auth.signToken(owner);
  const start = await request('/api/v1/me/devices/link', 'POST', { currentPassword: 'current-secret' }, portalToken);
  assert.equal(start.status, 201);
  const claimSecret = 'Q'.repeat(43);
  const claimed = await request('/api/v1/mobile/link/claim', 'POST', { challenge: start.body.data.qrData.slice('ucbhrms-link://'.length), claimSecret, platform: 'android', deviceName: 'Phone' });
  assert.equal(claimed.status, 200);
  assert.equal((await request(`/api/v1/me/devices/link/${start.body.data.id}/approve`, 'POST', { verificationCode: claimed.body.data.verificationCode }, portalToken)).status, 200);
  const issued = await request('/api/v1/mobile/link/status', 'POST', { linkId: start.body.data.id, claimSecret });
  assert.equal(issued.status, 200);
  return issued.body.data;
}

test('browser and device access tokens carry av; stale and unversioned tokens get ACCESS_CHANGED', async () => {
  const owner = await user(); const phone = await device(owner);
  const browser = auth.signToken(owner), mobile = auth.signDeviceAccessToken(owner, phone.id);
  assert.equal(auth.verifyToken(browser).av, 0);
  assert.equal(auth.verifyToken(mobile).av, 0);
  assert.equal((await request('/protected', 'GET', undefined, browser)).status, 200);
  await User.increment('accessVersion', { where: { id: owner.id } });
  for (const token of [browser, mobile, jwt.sign({ sub: owner.id, typ: 'access' }, process.env.JWT_SECRET)]) {
    const result = await request('/protected', 'GET', undefined, token);
    assert.equal(result.status, 401); assert.equal(result.body.code, 'ACCESS_CHANGED');
  }
  await owner.reload();
  assert.equal((await request('/protected', 'GET', undefined, auth.signToken(owner))).status, 200);
  const expired = jwt.sign({ sub: owner.id, av: owner.accessVersion, typ: 'access' }, process.env.JWT_SECRET, { expiresIn: -1 });
  assert.equal((await request('/protected', 'GET', undefined, expired)).body.code, undefined);
  const badPassword = await request('/api/v1/auth/login', 'POST', { orgCode: org.code, email: owner.email, password: 'wrong' });
  assert.equal(badPassword.status, 401); assert.equal(badPassword.body.code, undefined);
});

test('access changes report ACCESS_CHANGED even when the same edit deactivates the user', async () => {
  const owner = await user(); const token = auth.signToken(owner);
  await owner.update({ status: 'INACTIVE', accessVersion: 1 });
  const result = await request('/protected', 'GET', undefined, token);
  assert.equal(result.status, 401); assert.equal(result.body.code, 'ACCESS_CHANGED');
});

test('multi-user invalidation commits versions, devices, link attempts and safe audit in the caller transaction', async () => {
  const owners = [await user(), await user('HR_ADMIN')]; const outsider = await user();
  const phones = await Promise.all(owners.map(device)); const untouched = await device(outsider);
  const attempts = [];
  for (const owner of owners) for (const state of ['PENDING', 'CLAIMED', 'APPROVED']) attempts.push(await link(owner, state));
  await sequelize.transaction(async transaction => {
    await User.update({ organizationId: org.id, role: 'HR_OFFICER' }, { where: { id: owners.map(u => u.id) }, transaction });
    await users.invalidateUserAccess([...owners.map(u => u.id), owners[0].id], { transaction, reason: 'roles.changed', actor: { id: outsider.id } });
    for (const owner of owners) assert.equal((await User.findByPk(owner.id, { transaction })).accessVersion, 1);
    for (const phone of phones) assert.ok((await EmployeeMobileDevice.findByPk(phone.id, { transaction })).revokedAt);
  });
  for (const owner of owners) assert.equal((await owner.reload()).accessVersion, 1);
  for (const attempt of attempts) assert.equal((await attempt.reload()).status, 'CANCELLED');
  assert.equal((await outsider.reload()).accessVersion, 0); assert.equal((await untouched.reload()).revokedAt, null);
  const logs = await AuditLog.findAll({ where: { action: 'user.access.invalidate', actorUserId: outsider.id } });
  assert.equal(logs.length, 2);
  assert.deepEqual(logs.map(row => row.details), [{ reason: 'roles.changed' }, { reason: 'roles.changed' }]);
});

test('rollback restores all affected roles, access versions, phones, links and audit', async () => {
  const owners = [await user(), await user()]; const phones = await Promise.all(owners.map(device)); const pending = await link(owners[0]);
  const beforeAudit = await AuditLog.count();
  await assert.rejects(sequelize.transaction(async transaction => {
    await User.update({ organizationId: org.id, role: 'HR_OFFICER' }, { where: { id: owners.map(u => u.id) }, transaction });
    await users.invalidateUserAccess(owners.map(u => u.id), { transaction, reason: 'scope.changed', actor: { id: owners[0].id } });
    throw new Error('abort role edit');
  }), /abort role edit/);
  for (const owner of owners) { await owner.reload(); assert.equal(owner.role, 'PAYROLL_OFFICER'); assert.equal(owner.accessVersion, 0); }
  for (const phone of phones) assert.equal((await phone.reload()).revokedAt, null);
  assert.equal((await pending.reload()).status, 'PENDING'); assert.equal(await AuditLog.count(), beforeAudit);
});

test('every linked operational role can QR-link and keeps protected own access; bootstrap cannot link', async () => {
  for (const role of User.ROLES.filter(role => role !== 'SUPER_ADMIN')) {
    const owner = await user(role); const issued = await mobileSession(owner);
    const me = await request('/api/v1/auth/me', 'GET', undefined, issued.accessToken);
    assert.equal(me.status, 200); assert.equal(me.body.data.role, role);
    const access = await effectiveAccess(owner.id);
    assert.equal(can(access, 'self.profile', { resourceType: 'Employee', ...(await Employee.findByPk(owner.employeeId)).toJSON() }), true);
    assert.equal((await request('/api/v1/mobile/session/refresh', 'POST', { refreshToken: issued.refreshToken })).status, 200);
  }
  const bootstrap = await User.create({ organizationId: org.id, email: 'bootstrap@versions.invalid', name: 'Admin', role: 'ORG_ADMIN', passwordHash: 'unused', mustChangePassword: false });
  assert.equal((await request('/api/v1/me/devices/link', 'POST', { currentPassword: 'current-secret' }, auth.signToken(bootstrap))).status, 409);
});

test('invalidation forces browser login and QR-only mobile relink, including pending link cancellation', async () => {
  const owner = await user('EMPLOYEE'), issued = await mobileSession(owner);
  const browser = auth.signToken(owner), pending = await link(owner);
  await users.invalidateUserAccess([owner.id], { reason: 'scope.changed', actor: { id: owner.id } });
  assert.equal((await request('/protected', 'GET', undefined, browser)).body.code, 'ACCESS_CHANGED');
  assert.equal((await request('/protected', 'GET', undefined, issued.accessToken)).body.code, 'ACCESS_CHANGED');
  assert.equal((await request('/api/v1/mobile/session/refresh', 'POST', { refreshToken: issued.refreshToken })).status, 401);
  assert.equal((await pending.reload()).status, 'CANCELLED');
  assert.equal((await request('/api/v1/mobile/login', 'POST', { email: owner.email, password: 'current-secret' })).status, 404);
  const login = await request('/api/v1/auth/login', 'POST', { orgCode: org.code, email: owner.email, password: 'current-secret' });
  assert.equal(login.status, 200); assert.equal((await request('/protected', 'GET', undefined, login.body.token)).status, 200);
  await owner.reload(); const relinked = await mobileSession(owner);
  assert.equal((await request('/protected', 'GET', undefined, relinked.accessToken)).status, 200);
});
