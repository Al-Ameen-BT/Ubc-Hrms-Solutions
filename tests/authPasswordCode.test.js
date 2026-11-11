'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'auth-password-code-test-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { sequelize, Organization, User } = require('../src/models');
const { hashPassword, signToken } = require('../src/services/authService');
const authRoutes = require('../src/routes/auth');

let server, base, token;
before(async () => {
  await sequelize.sync();
  const org = await Organization.create({ code: 'PWD', name: 'Password Bank' });
  const user = await User.create({ organizationId: org.id, email: 'employee@pwd.invalid', name: 'Employee', role: 'EMPLOYEE', passwordHash: await hashPassword('correct-password') });
  token = signToken(user);
  const app = express(); app.use(express.json()); app.use('/auth', authRoutes);
  server = await new Promise(resolve => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await sequelize.close(); });

test('wrong current password has a distinct code from expired authentication', async () => {
  const response = await fetch(`${base}/auth/change-password`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: 'wrong-password', newPassword: 'new-password' }) });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'INVALID_CURRENT_PASSWORD');
  const stale = await fetch(`${base}/auth/change-password`, { method: 'POST', headers: { Authorization: 'Bearer invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: 'wrong-password', newPassword: 'new-password' }) });
  assert.equal(stale.status, 401);
  assert.notEqual((await stale.json()).code, 'INVALID_CURRENT_PASSWORD');
});
