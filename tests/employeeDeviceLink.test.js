'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'employee-device-link-test-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { sequelize, Organization, PostCadre, Employee, User, EmployeeMobileDevice, EmployeeDeviceLink, PasswordResetToken } = require('../src/models');
const { signToken, signDeviceAccessToken, hashPassword } = require('../src/services/authService');
const { authenticate } = require('../src/middleware/auth');
const routes = require('../src/routes');
const secretBox = require('../src/services/secretBox');
const userAdmin = require('../src/services/userAdmin');

let server, base, owner, other, unlinked;
const get = async token => fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${token}` } });
const request = async (path, method = 'GET', body, token) => {
  const res = await fetch(`${base}/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text.startsWith('{') ? JSON.parse(text) : null };
};
const newLink = async () => {
  const result = await request('/me/devices/link', 'POST', { currentPassword: 'current-secret' }, signToken(owner));
  assert.equal(result.status, 201);
  return result.body.data;
};

before(async () => {
  await sequelize.sync();
  const org = await Organization.create({ code: 'DEVICE', name: 'Device Bank' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });
  const employee = await Employee.create({ organizationId: org.id, empCode: 'D1', name: 'Device Employee', doj: '2020-01-01', postCadreId: post.id, directPay: true, currentBasicPay: 10000 });
  const otherEmployee = await Employee.create({ organizationId: org.id, empCode: 'D2', name: 'Other Employee', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 10000 });
  owner = await User.create({ organizationId: org.id, employeeId: employee.id, email: 'device@self.invalid', name: 'Device Employee', role: 'EMPLOYEE', passwordHash: await hashPassword('current-secret'), mustChangePassword: false });
  other = await User.create({ organizationId: org.id, employeeId: otherEmployee.id, email: 'otherdevice@self.invalid', name: 'Other', role: 'EMPLOYEE', passwordHash: 'unused', mustChangePassword: false });
  unlinked = await User.create({ organizationId: org.id, email: 'unlinkeddevice@self.invalid', name: 'Unlinked', role: 'EMPLOYEE', passwordHash: 'unused' });
  const app = express(); app.use(express.json()); app.get('/protected', authenticate, (req, res) => res.json({ id: req.user.id })); app.use('/api/v1', routes);
  server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await sequelize.close(); });

test('device token requires its own active device, while browser token still works', async () => {
  const device = await EmployeeMobileDevice.create({ userId: owner.id, organizationId: owner.organizationId, name: 'Pixel', platform: 'android', refreshHash: 'a'.repeat(64), rotation: 0, lastUsedAt: new Date() });
  assert.equal((await get(signToken(owner))).status, 200);
  assert.equal((await get(signDeviceAccessToken(owner, device.id))).status, 200);
  assert.equal((await get(signDeviceAccessToken(other, device.id))).status, 401);
  device.revokedAt = new Date(); await device.save();
  assert.equal((await get(signDeviceAccessToken(owner, device.id))).status, 401);
});

test('only portal approval can issue a mobile session and the QR can be claimed once', async () => {
  const link = await newLink();
  assert.match(link.qrData, /^ucbhrms-link:\/\//);
  const challenge = link.qrData.slice('ucbhrms-link://'.length);
  const claimSecret = 'A'.repeat(43);
  const claimed = await request('/mobile/link/claim', 'POST', { challenge, claimSecret, platform: 'android', deviceName: 'Pixel 8' });
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.data.linkId, link.id);
  assert.match(claimed.body.data.verificationCode, /^\d{6}$/);
  assert.equal((await request('/mobile/link/status', 'POST', { linkId: link.id, claimSecret })).body.data.status, 'CLAIMED');
  assert.equal((await request('/mobile/link/claim', 'POST', { challenge, claimSecret: 'B'.repeat(43), platform: 'ios', deviceName: 'iPhone' })).status, 409);
  assert.equal((await request(`/me/devices/link/${link.id}/approve`, 'POST', { verificationCode: claimed.body.data.verificationCode }, signToken(other))).status, 404);
  const visible = await request(`/me/devices/link/${link.id}`, 'GET', undefined, signToken(owner));
  assert.equal(visible.body.data.verificationCode, undefined);
  assert.equal((await request(`/me/devices/link/${link.id}/approve`, 'POST', { verificationCode: claimed.body.data.verificationCode === '000000' ? '000001' : '000000' }, signToken(owner))).status, 400);
  assert.equal((await request(`/me/devices/link/${link.id}/approve`, 'POST', { verificationCode: claimed.body.data.verificationCode }, signToken(owner))).status, 200);
  const approved = await request(`/me/devices/link/${link.id}`, 'GET', undefined, signToken(owner));
  assert.ok(new Date(approved.body.data.expiresAt).getTime() > new Date(link.expiresAt).getTime());
  const issued = await request('/mobile/link/status', 'POST', { linkId: link.id, claimSecret });
  assert.equal(issued.status, 200);
  assert.ok(issued.body.data.accessToken);
  assert.ok(issued.body.data.refreshToken);
  assert.equal((await request('/auth/me', 'GET', undefined, issued.body.data.accessToken)).body.data.role, 'EMPLOYEE');
  assert.equal((await request('/mobile/link/status', 'POST', { linkId: link.id, claimSecret })).status, 409);
  await EmployeeDeviceLink.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { id: link.id } });
  assert.equal((await request(`/me/devices/link/${link.id}`, 'GET', undefined, signToken(owner))).body.data.status, 'ISSUED');
});

test('refresh rotates, old refresh reuse revokes, and revoked access fails immediately', async () => {
  const link = await newLink();
  const challenge = link.qrData.slice('ucbhrms-link://'.length);
  const claimed = await request('/mobile/link/claim', 'POST', { challenge, claimSecret: 'C'.repeat(43), platform: 'ios', deviceName: 'iPhone' });
  await request(`/me/devices/link/${link.id}/approve`, 'POST', { verificationCode: claimed.body.data.verificationCode }, signToken(owner));
  const issued = (await request('/mobile/link/status', 'POST', { linkId: link.id, claimSecret: 'C'.repeat(43) })).body.data;
  const rotated = await request('/mobile/session/refresh', 'POST', { refreshToken: issued.refreshToken });
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.body.data.refreshToken, issued.refreshToken);
  assert.equal((await request('/mobile/session/refresh', 'POST', { refreshToken: issued.refreshToken })).status, 401);
  assert.equal((await request('/auth/me', 'GET', undefined, rotated.body.data.accessToken)).status, 401);
});

test('expired QR cannot be claimed and portal revocation ends an issued session', async () => {
  const expired = await newLink();
  await EmployeeDeviceLink.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { id: expired.id } });
  assert.equal((await request('/mobile/link/claim', 'POST', { challenge: expired.qrData.slice('ucbhrms-link://'.length), claimSecret: 'D'.repeat(43), platform: 'android', deviceName: 'Old' })).status, 400);
  const link = await newLink();
  const claimed = await request('/mobile/link/claim', 'POST', { challenge: link.qrData.slice('ucbhrms-link://'.length), claimSecret: 'E'.repeat(43), platform: 'android', deviceName: 'Pixel' });
  await request(`/me/devices/link/${link.id}/approve`, 'POST', { verificationCode: claimed.body.data.verificationCode }, signToken(owner));
  const issued = (await request('/mobile/link/status', 'POST', { linkId: link.id, claimSecret: 'E'.repeat(43) })).body.data;
  const device = await EmployeeMobileDevice.findOne({ where: { userId: owner.id, revokedAt: null }, order: [['id', 'DESC']] });
  assert.equal((await request(`/me/devices/${device.id}/revoke`, 'POST', {}, signToken(owner))).status, 200);
  assert.equal((await request('/auth/me', 'GET', undefined, issued.accessToken)).status, 401);
  assert.equal((await request('/mobile/session/refresh', 'POST', { refreshToken: issued.refreshToken })).status, 401);
});

test('a new QR cancels the previous pending link', async () => {
  const previous = await newLink();
  const current = await newLink();
  assert.equal((await request(`/me/devices/link/${previous.id}`, 'GET', undefined, signToken(owner))).body.data.status, 'CANCELLED');
  assert.equal((await request('/mobile/link/claim', 'POST', { challenge: previous.qrData.slice('ucbhrms-link://'.length), claimSecret: 'G'.repeat(43), platform: 'android', deviceName: 'Old' })).status, 409);
  assert.equal((await request(`/me/devices/link/${current.id}`, 'GET', undefined, signToken(owner))).body.data.status, 'PENDING');
});

test('deactivated employee record invalidates device access', async () => {
  const device = await EmployeeMobileDevice.create({ userId: owner.id, organizationId: owner.organizationId, name: 'Inactive test', platform: 'android', refreshHash: 'f'.repeat(64), rotation: 0, lastUsedAt: new Date() });
  const employee = await Employee.findByPk(owner.employeeId);
  await employee.update({ status: 'INACTIVE' });
  try { assert.equal((await get(signDeviceAccessToken(owner, device.id))).status, 401); }
  finally { await employee.update({ status: 'ACTIVE' }); }
});

test('inactive bank blocks an otherwise active linked phone', async () => {
  const device = await EmployeeMobileDevice.create({ userId: owner.id, organizationId: owner.organizationId, name: 'Bank inactive', platform: 'android', refreshHash: '1'.repeat(64), rotation: 0, lastUsedAt: new Date() });
  const org = await Organization.findByPk(owner.organizationId);
  await org.update({ status: 'INACTIVE' });
  try { assert.equal((await get(signDeviceAccessToken(owner, device.id))).status, 403); }
  finally { await org.update({ status: 'ACTIVE' }); }
});

test('password reset revokes mobile devices', async () => {
  const pending = await newLink();
  const device = await EmployeeMobileDevice.create({ userId: owner.id, organizationId: owner.organizationId, name: 'Reset test', platform: 'ios', refreshHash: 'e'.repeat(64), rotation: 0, lastUsedAt: new Date() });
  const token = 'reset-device-secret';
  await PasswordResetToken.create({ userId: owner.id, tokenHash: secretBox.sha256(token), expiresAt: new Date(Date.now() + 300000) });
  const result = await request('/auth/reset-password', 'POST', { token, newPassword: 'new-password-secret' });
  assert.equal(result.status, 200);
  assert.equal((await get(signDeviceAccessToken(owner, device.id))).status, 401);
  assert.notEqual((await request('/mobile/link/claim', 'POST', { challenge: pending.qrData.slice('ucbhrms-link://'.length), claimSecret: 'F'.repeat(43), platform: 'ios', deviceName: 'Old QR' })).status, 200);
});

test('unlinked employee and admin cannot start a mobile link', async () => {
  assert.equal((await request('/me/devices/link', 'POST', { currentPassword: 'current-secret' }, signToken(unlinked))).status, 409);
  const admin = await User.create({ organizationId: owner.organizationId, email: 'device-admin@self.invalid', name: 'Admin', role: 'ORG_ADMIN', passwordHash: await hashPassword('current-secret') });
  assert.equal((await request('/me/devices/link', 'POST', { currentPassword: 'current-secret' }, signToken(admin))).status, 403);
});

test('admin password reset and deactivation permanently revoke linked phones', async () => {
  const pending = await EmployeeDeviceLink.create({ userId: owner.id, organizationId: owner.organizationId, challengeHash: 'e'.repeat(64), expiresAt: new Date(Date.now() + 120000) });
  const resetDevice = await EmployeeMobileDevice.create({ userId: owner.id, organizationId: owner.organizationId, name: 'Admin reset', platform: 'ios', refreshHash: 'a'.repeat(64), rotation: 0, lastUsedAt: new Date() });
  await userAdmin.resetPassword({}, owner, false);
  assert.ok((await resetDevice.reload()).revokedAt);
  assert.equal((await EmployeeDeviceLink.findByPk(pending.id)).status, 'CANCELLED');

  const statusDevice = await EmployeeMobileDevice.create({ userId: owner.id, organizationId: owner.organizationId, name: 'Deactivated', platform: 'ios', refreshHash: 'b'.repeat(64), rotation: 0, lastUsedAt: new Date() });
  await userAdmin.setStatus({}, owner, 'INACTIVE');
  await userAdmin.setStatus({}, owner, 'ACTIVE');
  assert.ok((await statusDevice.reload()).revokedAt);
});

test('hard deletion removes dependent mobile links and devices', async () => {
  const doomed = await User.create({ organizationId: owner.organizationId, email: 'deleted-device@self.invalid', name: 'Deleted', role: 'EMPLOYEE', passwordHash: 'unused', status: 'INACTIVE' });
  const device = await EmployeeMobileDevice.create({ userId: doomed.id, organizationId: doomed.organizationId, name: 'Deleted phone', platform: 'android', refreshHash: 'c'.repeat(64), rotation: 0, lastUsedAt: new Date() });
  const link = await EmployeeDeviceLink.create({ userId: doomed.id, organizationId: doomed.organizationId, challengeHash: 'd'.repeat(64), status: 'ISSUED', deviceId: device.id, expiresAt: new Date() });
  await userAdmin.hardDelete({}, doomed);
  assert.equal(await EmployeeDeviceLink.findByPk(link.id), null);
  assert.equal(await EmployeeMobileDevice.findByPk(device.id), null);
  assert.equal(await User.findByPk(doomed.id), null);
});

test('organisation role changes revoke the previous employee device', async () => {
  const admin = await User.create({ organizationId: owner.organizationId, email: 'device-role-admin@self.invalid', name: 'Admin', role: 'ORG_ADMIN', passwordHash: 'unused' });
  const device = await EmployeeMobileDevice.create({ userId: other.id, organizationId: other.organizationId, name: 'Role change phone', platform: 'android', refreshHash: 'f'.repeat(64), rotation: 0, lastUsedAt: new Date() });
  const result = await request(`/organizations/${owner.organizationId}/users/${other.id}`, 'PUT', { role: 'HR_OFFICER' }, signToken(admin));
  assert.equal(result.status, 200);
  assert.ok((await device.reload()).revokedAt);
});
