'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'no-smtp-bypass-test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { sequelize, Organization, PostCadre, Employee, User, SmtpConfig } = require('../src/models');
const { hashPassword, signToken } = require('../src/services/authService');
const orgUsersRoutes = require('../src/routes/orgUsers');
const authRoutes = require('../src/routes/auth');
const deviceRoutes = require('../src/routes/employeeDevices');

let server;
let base;
let org;
let orgAdminToken;
let employee;

before(async () => {
  await sequelize.sync();
  org = await Organization.create({ code: 'NOSMTP', name: 'No SMTP Urban Bank', status: 'ACTIVE', maxUsers: 50, maxEmployees: 50 });
  const post = await PostCadre.create({ organizationId: org.id, code: 'CLK', name: 'Clerk', status: 'ACTIVE' });
  employee = await Employee.create({
    organizationId: org.id,
    empCode: 'E001',
    name: 'Asha Menon',
    doj: '2022-01-10',
    postCadreId: post.id,
    personalEmail: 'asha@nosmtp.invalid',
    status: 'ACTIVE',
  });
  const orgAdmin = await User.create({
    organizationId: org.id,
    email: 'admin@nosmtp.invalid',
    name: 'Org Admin',
    role: 'ORG_ADMIN',
    passwordHash: await hashPassword('AdminPass123!'),
    mustChangePassword: false,
    status: 'ACTIVE',
  });
  orgAdminToken = signToken(orgAdmin);

  const app = express();
  app.use(express.json());
  app.use('/api/v1/organizations/:orgId/users', orgUsersRoutes);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/me/devices', deviceRoutes.employee);

  server = await new Promise((resolve) => {
    const running = app.listen(0, '127.0.0.1', () => resolve(running));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await sequelize.close();
});

test('no-SMTP bypass issues tempPassword for create & reset and allows ESS + mobile link setup', async () => {
  const statusRes = await fetch(`${base}/api/v1/organizations/${org.id}/users/smtp-status`, {
    headers: { Authorization: `Bearer ${orgAdminToken}` },
  });
  assert.equal(statusRes.status, 200);
  const statusBody = await statusRes.json();
  assert.equal(statusBody.data.smtpConfigured, false);
  assert.equal(statusBody.data.via, null);
  assert.match(statusBody.data.loginUrl, /\/o\/NOSMTP$/);

  const createRes = await fetch(`${base}/api/v1/organizations/${org.id}/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${orgAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: employee.name,
      email: employee.personalEmail,
      role: 'EMPLOYEE',
      employeeId: employee.id,
      sendEmail: true,
    }),
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.ok(created.tempPassword && created.tempPassword.length >= 12);
  assert.equal(created.email.sent, false);
  assert.equal(created.email.bypassed, true);
  assert.equal(created.email.smtpConfigured, false);
  assert.match(created.loginUrl, /\/o\/NOSMTP$/);

  const resetRes = await fetch(`${base}/api/v1/organizations/${org.id}/users/${created.data.id}/reset-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${orgAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sendEmail: false }),
  });
  assert.equal(resetRes.status, 200);
  const reset = await resetRes.json();
  assert.ok(reset.tempPassword && reset.tempPassword.length >= 12);
  assert.notEqual(reset.tempPassword, created.tempPassword);
  assert.equal(reset.email.sent, false);
  assert.equal(reset.email.bypassed, true);
  assert.equal(reset.email.smtpConfigured, false);

  // Employee signs in to ESS portal with the temporary password
  const loginRes = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: employee.personalEmail, password: reset.tempPassword, orgCode: org.code }),
  });
  assert.equal(loginRes.status, 200);
  const login = await loginRes.json();
  assert.equal(login.mustChangePassword, true);
  assert.ok(login.token);

  // Employee sets permanent password on first login
  const newPassword = 'PermanentPassword!9';
  const changeRes = await fetch(`${base}/api/v1/auth/change-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${login.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword: reset.tempPassword, newPassword }),
  });
  assert.equal(changeRes.status, 200);

  // Employee can now create a mobile device link QR code from the portal
  const linkRes = await fetch(`${base}/api/v1/me/devices/link`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${login.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword: newPassword }),
  });
  assert.equal(linkRes.status, 201);
  const linkBody = await linkRes.json();
  assert.ok(linkBody.data.qrCodeDataUrl);
});

test('configured SMTP can still be manually bypassed via sendEmail=false', async () => {
  await SmtpConfig.create({
    organizationId: org.id,
    enabled: true,
    host: 'smtp.example.invalid',
    port: 587,
    security: 'STARTTLS',
    fromEmail: 'hr@nosmtp.invalid',
  });

  const statusRes = await fetch(`${base}/api/v1/organizations/${org.id}/users/smtp-status`, {
    headers: { Authorization: `Bearer ${orgAdminToken}` },
  });
  assert.equal(statusRes.status, 200);
  const statusBody = await statusRes.json();
  assert.equal(statusBody.data.smtpConfigured, true);
  assert.equal(statusBody.data.via, 'ORGANISATION');

  const createRes = await fetch(`${base}/api/v1/organizations/${org.id}/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${orgAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Manual Officer',
      email: 'officer@nosmtp.invalid',
      role: 'HR_OFFICER',
      sendEmail: false,
    }),
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.ok(created.tempPassword);
  assert.equal(created.email.sent, false);
  assert.equal(created.email.bypassed, true);
  assert.equal(created.email.smtpConfigured, true);
});
