'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'org-user-management-test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { sequelize, Organization, PostCadre, Employee, User } = require('../src/models');
const { signToken } = require('../src/services/authService');
const routes = require('../src/routes');

let server;
let base;
let org;
let otherOrg;
let emp1;
let emp2;
let orgAdmin;
let otherOrgAdmin;
let superAdmin;
let unlinkedUser;
let alreadyLinkedUser;
let orgAdminToken;
let otherOrgAdminToken;
let superAdminToken;

const request = async (path, token, method = 'GET', body) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: response.headers.get('content-type')?.includes('application/json')
      ? await response.json()
      : await response.text(),
  };
};

before(async () => {
  await sequelize.sync();
  org = await Organization.create({ code: 'UMGT1', name: 'User Mgmt Bank 1' });
  otherOrg = await Organization.create({ code: 'UMGT2', name: 'User Mgmt Bank 2' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });

  emp1 = await Employee.create({
    organizationId: org.id,
    empCode: 'EMP001',
    name: 'Alice Employee',
    doj: '2022-01-01',
    postCadreId: post.id,
    currentBasicPay: 20000,
  });
  emp2 = await Employee.create({
    organizationId: org.id,
    empCode: 'EMP002',
    name: 'Bob Employee',
    doj: '2023-01-01',
    postCadreId: post.id,
    currentBasicPay: 22000,
  });

  superAdmin = await User.create({
    organizationId: null,
    email: 'super@umgt.invalid',
    name: 'Super Admin',
    role: 'SUPER_ADMIN',
    passwordHash: 'unused',
  });
  orgAdmin = await User.create({
    organizationId: org.id,
    email: 'orgadmin@umgt.invalid',
    name: 'Org Admin',
    role: 'ORG_ADMIN',
    passwordHash: 'unused',
  });
  otherOrgAdmin = await User.create({
    organizationId: otherOrg.id,
    email: 'otheradmin@umgt.invalid',
    name: 'Other Org Admin',
    role: 'ORG_ADMIN',
    passwordHash: 'unused',
  });
  alreadyLinkedUser = await User.create({
    organizationId: org.id,
    employeeId: emp1.id,
    email: 'alice@umgt.invalid',
    name: 'Alice Account',
    role: 'EMPLOYEE',
    passwordHash: 'unused',
  });
  unlinkedUser = await User.create({
    organizationId: org.id,
    email: 'bob@umgt.invalid',
    name: 'Bob Account',
    role: 'EMPLOYEE',
    passwordHash: 'unused',
  });

  superAdminToken = signToken(superAdmin);
  orgAdminToken = signToken(orgAdmin);
  otherOrgAdminToken = signToken(otherOrgAdmin);

  const app = express();
  app.use(express.json());
  app.use('/api/v1', routes);
  server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await sequelize.close();
});

test('PUT /organizations/:orgId/users/:userId edits user name and validates blank names', async () => {
  const blankRes = await request(`/organizations/${org.id}/users/${unlinkedUser.id}`, orgAdminToken, 'PUT', {
    name: '   ',
  });
  assert.equal(blankRes.status, 400);

  const updateRes = await request(`/organizations/${org.id}/users/${unlinkedUser.id}`, orgAdminToken, 'PUT', {
    name: '  Bob Updated Name  ',
  });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.data.name, 'Bob Updated Name');

  const reloaded = await User.findByPk(unlinkedUser.id);
  assert.equal(reloaded.name, 'Bob Updated Name');
});

test('PUT /organizations/:orgId/users/:userId links and unlinks already-created users to employees safely', async () => {
  const invalidEmp = await request(`/organizations/${org.id}/users/${unlinkedUser.id}`, orgAdminToken, 'PUT', {
    employeeId: 'not-a-number',
  });
  assert.equal(invalidEmp.status, 400);

  const duplicateEmp = await request(`/organizations/${org.id}/users/${unlinkedUser.id}`, orgAdminToken, 'PUT', {
    employeeId: emp1.id,
  });
  assert.equal(duplicateEmp.status, 409);

  const linkedRes = await request(`/organizations/${org.id}/users/${unlinkedUser.id}`, orgAdminToken, 'PUT', {
    employeeId: emp2.id,
  });
  assert.equal(linkedRes.status, 200);
  assert.equal(linkedRes.body.data.employeeId, emp2.id);

  const unlinkedRes = await request(`/organizations/${org.id}/users/${unlinkedUser.id}`, orgAdminToken, 'PUT', {
    employeeId: null,
  });
  assert.equal(unlinkedRes.status, 200);
  assert.equal(unlinkedRes.body.data.employeeId, null);
});

test('DELETE /organizations/:orgId/users/:userId is restricted strictly to that org ORG_ADMIN and preserves linked Employee', async () => {
  // Relink unlinkedUser to emp2 before deletion to confirm Employee record survives user deletion
  const relink = await request(`/organizations/${org.id}/users/${unlinkedUser.id}`, orgAdminToken, 'PUT', {
    employeeId: emp2.id,
  });
  assert.equal(relink.status, 200);

  // SUPER_ADMIN must not be allowed to remove organisation users
  const superAttempt = await request(`/organizations/${org.id}/users/${unlinkedUser.id}`, superAdminToken, 'DELETE');
  assert.equal(superAttempt.status, 403);

  // Another organisation's ORG_ADMIN must be rejected
  const foreignAttempt = await request(`/organizations/${org.id}/users/${unlinkedUser.id}`, otherOrgAdminToken, 'DELETE');
  assert.equal(foreignAttempt.status, 403);

  // ORG_ADMIN cannot delete their own account
  const selfAttempt = await request(`/organizations/${org.id}/users/${orgAdmin.id}`, orgAdminToken, 'DELETE');
  assert.equal(selfAttempt.status, 400);

  // Step 1: ACTIVE user -> deactivated (INACTIVE, deleted: false)
  const step1 = await request(`/organizations/${org.id}/users/${unlinkedUser.id}`, orgAdminToken, 'DELETE');
  assert.equal(step1.status, 200);
  assert.equal(step1.body.deleted, false);
  assert.equal(step1.body.data.status, 'INACTIVE');

  // Step 2: INACTIVE user -> permanently deleted (deleted: true)
  const step2 = await request(`/organizations/${org.id}/users/${unlinkedUser.id}`, orgAdminToken, 'DELETE');
  assert.equal(step2.status, 200);
  assert.equal(step2.body.deleted, true);

  assert.equal(await User.findByPk(unlinkedUser.id), null);
  const survivingEmployee = await Employee.findByPk(emp2.id);
  assert.ok(survivingEmployee, 'Linked Employee record must remain intact after user deletion');
});
