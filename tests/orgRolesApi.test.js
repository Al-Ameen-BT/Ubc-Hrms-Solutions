'use strict';
process.env.DB_DIALECT = 'sqlite'; process.env.DB_STORAGE = ':memory:'; process.env.JWT_SECRET = 'org-roles-api-test-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const m = require('../src/models');
const { signToken } = require('../src/services/authService');
const bootstrap = require('../src/services/accessBootstrap');
const { todayIST } = require('../src/services/orgAccess');
const users = require('../src/services/userAdmin');
let server, base, serial = 0;
before(async () => { await m.sequelize.sync(); const app = express(); app.use(express.json()); app.use('/api/v1', require('../src/routes')); server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }); base = `http://127.0.0.1:${server.address().port}/api/v1`; });
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await m.sequelize.close(); });
async function fixture() {
  const n = ++serial, org = await m.Organization.create({ code: `ROLE${n}`, name: 'Bank' });
  const branch = await m.OrganizationBranch.create({ organizationId: org.id, number: '000', code: 'HO', name: 'Head Office', unitType: 'HEAD_OFFICE', isHeadOffice: true });
  const post = await m.PostCadre.create({ organizationId: org.id, code: 'P', name: 'Post' });
  async function account(role = 'EMPLOYEE', linked = true) {
    const i = ++serial, employee = linked ? await m.Employee.create({ organizationId: org.id, postCadreId: post.id, empCode: `E${i}`, name: 'Private employee', doj: '2020-01-01', branchId: branch.id, branchCode: branch.code, branchName: branch.name }) : null;
    const user = await m.User.create({ organizationId: org.id, employeeId: employee?.id, email: `u${i}@roles.invalid`, name: 'User', role, passwordHash: 'private hash', mfaSecret: 'private mfa' });
    return user;
  }
  const admin = await account('ORG_ADMIN'); await bootstrap.bootstrapOrganizationAccess({ organizationId: org.id });
  const roles = await m.OrganizationRole.findAll({ where: { organizationId: org.id } });
  const role = code => roles.find(r => r.code === code);
  async function request(path, method = 'GET', body, actor = admin) {
    const current = await m.User.findByPk(actor.id);
    const r = await fetch(`${base}/org${path}`, { method, headers: { authorization: `Bearer ${signToken(current)}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: r.headers.get('content-type')?.includes('application/json') ? await r.json() : await r.text() };
  }
  return { org, branch, admin, role, account, request };
}

test('roles are protected; custom copies accept only their template ceiling and deny foreign IDs', async () => {
  const f = await fixture(), other = await fixture();
  const list = await f.request('/roles'); assert.equal(list.status, 200); assert.equal(list.body.data.length, 9);
  for (const method of ['PUT', 'DELETE']) assert.equal((await f.request(`/roles/${f.role('HR_OFFICER').id}`, method, method === 'PUT' ? { name: 'Changed' } : undefined)).status, 400);
  assert.equal((await f.request('/roles', 'POST', { sourceRoleId: f.role('HR_OFFICER').id, code: 'EVIL', name: 'Evil', permissionCodes: ['payroll.prepare'] })).status, 400);
  assert.equal((await f.request('/roles', 'POST', { sourceRoleId: f.role('HR_OFFICER').id, code: 'UNKNOWN', name: 'Unknown', permissionCodes: ['invented.manage'] })).status, 400);
  assert.equal((await f.request('/roles', 'POST', { sourceRoleId: other.role('HR_OFFICER').id, code: 'FOREIGN', name: 'Foreign' })).status, 404);
  const custom = await f.request('/roles', 'POST', { sourceRoleId: f.role('HR_OFFICER').id, code: 'READ_HR', name: 'HR view', permissionCodes: ['people.view'] });
  assert.equal(custom.status, 201); assert.equal(custom.body.data.isProtected, false); assert.deepEqual(custom.body.data.permissionCodes, ['people.view']);
  assert.deepEqual((await f.request(`/roles/${custom.body.data.id}`)).body.data.permissionCodes, ['people.view']);
  assert.equal((await f.request(`/roles/${custom.body.data.id}/permissions`, 'PUT', { permissionCodes: ['people.view', 'roles.manage'] })).status, 400);
  const manager = await f.account(); assert.equal((await f.request('/role-assignments', 'POST', { userId: manager.id, roleId: f.role('BRANCH_MANAGER').id, scopeType: 'SELECTED_BRANCHES', branchIds: [f.branch.id], effectiveFrom: todayIST() })).status, 201);
  await f.org.update({ accessControlMode: 'PERMISSIONS' });
  const access = await require('../src/services/accessControl').effectiveAccess(manager.id); assert.ok(access.permissionCodes.includes('leave.approve'));
  for (const path of ['/roles', '/structure/branches', '/transfers']) assert.equal((await f.request(path, 'GET', undefined, manager)).status, 403);
});

test('assignments validate scope, employee links, duplicates and invalidate devices atomically', async () => {
  const f = await fixture(), target = await f.account(), unlinked = await f.account('HR_OFFICER', false), other = await fixture();
  const input = { userId: target.id, roleId: f.role('HR_OFFICER').id, scopeType: 'SELECTED_BRANCHES', branchIds: [f.branch.id], effectiveFrom: todayIST() };
  const before = target.accessVersion;
  const device = await m.EmployeeMobileDevice.create({ organizationId: f.org.id, userId: target.id, employeeId: target.employeeId, name: 'Phone', refreshHash: 'a'.repeat(64), platform: 'android', lastUsedAt: new Date() });
  assert.equal((await f.request('/role-assignments', 'POST', { ...input, branchIds: [other.branch.id] })).status, 404);
  assert.equal((await f.request('/role-assignments', 'POST', { ...input, userId: unlinked.id })).status, 400);
  for (const data of [{ ...input, branchIds: [] }, { ...input, scopeType: 'OWN' }, { ...input, departmentIds: [1] }, { ...input, effectiveFrom: '2026-02-30' }]) assert.equal((await f.request('/role-assignments', 'POST', data)).status, 400);
  const result = await f.request('/role-assignments', 'POST', input); assert.equal(result.status, 201);
  assert.equal((await m.User.findByPk(target.id)).accessVersion, before + 1); assert.ok((await device.reload()).revokedAt);
  assert.equal((await f.request('/role-assignments', 'POST', input)).status, 409);
  assert.equal((await f.request('/role-assignments', 'POST', { ...input, roleId: f.role('BRANCH_MANAGER').id })).status, 201);
  assert.equal((await m.User.findByPk(target.id)).role, 'HR_OFFICER');
  const preview = await f.request(`/access-preview/${target.id}`); assert.equal(preview.status, 200); assert.ok(Array.isArray(preview.body.data.permissionCodes)); assert.equal(JSON.stringify(preview.body).includes('Private employee'), false);
  assert.equal((await f.request(`/access-preview/${other.admin.id}`)).status, 404);
  assert.equal((await f.request('/role-assignments', 'POST', { ...input, userId: f.admin.id })).status, 400);
});

test('role changes expose impact, protect the last administrator and roll back invalidation failures', async () => {
  const f = await fixture(), target = await f.account();
  const custom = (await f.request('/roles', 'POST', { sourceRoleId: f.role('HR_OFFICER').id, code: 'CUSTOM', name: 'Custom', permissionCodes: ['people.view'] })).body.data;
  await f.request('/role-assignments', 'POST', { userId: target.id, roleId: custom.id, scopeType: 'SELECTED_BRANCHES', branchIds: [f.branch.id], effectiveFrom: todayIST() });
  const impact = await f.request(`/roles/${custom.id}/impact`); assert.equal(impact.status, 200); assert.deepEqual(impact.body.data.userIds, [target.id]);
  assert.equal((await f.request(`/roles/${custom.id}`, 'DELETE')).status, 409);
  const prior = (await m.User.findByPk(target.id)).accessVersion;
  const hook = () => { throw new Error('invalidation audit failure'); };
  m.AuditLog.addHook('beforeBulkCreate', 'failRoleAudit', hook);
  try { assert.equal((await f.request(`/roles/${custom.id}/permissions`, 'PUT', { permissionCodes: ['people.view', 'attendance.view'] })).status, 500); } finally { m.AuditLog.removeHook('beforeBulkCreate', 'failRoleAudit'); }
  assert.equal((await m.User.findByPk(target.id)).accessVersion, prior);
  assert.deepEqual((await f.request('/roles')).body.data.find(r => r.id === custom.id).permissionCodes, ['people.view']);
  const sole = await m.UserRoleAssignment.findOne({ where: { organizationId: f.org.id, userId: f.admin.id, roleId: f.role('ORGANISATION_ADMIN').id } });
  await assert.rejects(users.changeRoleAssignment({ organizationId: f.org.id, actor: f.admin, id: sole.id, data: { status: 'INACTIVE' } }), /last|final|own/i);
});

test('readiness is non-mutating and activation is locked, irreversible, audited and forces reauthentication', async () => {
  const f = await fixture();
  const before = await m.AuditLog.count(), version = f.admin.accessVersion;
  const preview = await f.request('/roles/readiness'); assert.equal(preview.status, 200); assert.equal(preview.body.data.ready, true); assert.equal(await m.AuditLog.count(), before);
  const token = signToken(await f.admin.reload());
  const activated = await f.request('/roles/activate', 'POST', { accessControlMode: 'PERMISSIONS' }); assert.equal(activated.status, 200); assert.equal(activated.body.data.accessControlMode, 'PERMISSIONS');
  assert.equal((await f.org.reload()).accessControlMode, 'PERMISSIONS'); assert.equal((await f.admin.reload()).accessVersion, version + 1);
  const stale = await fetch(`${base}/org/roles`, { headers: { authorization: `Bearer ${token}` } }); assert.equal(stale.status, 401); assert.equal((await stale.json()).code, 'ACCESS_CHANGED');
  assert.equal((await f.request('/roles/activate', 'POST', { accessControlMode: 'LEGACY' })).status, 400);
  const custom = (await f.request('/roles', 'POST', { sourceRoleId: f.role('HR_OFFICER').id, code: 'TAMPER', name: 'Tampered' })).body.data;
  await m.OrganizationRolePermission.create({ organizationId: f.org.id, roleId: custom.id, permissionCode: 'roles.manage' });
  assert.equal((await f.request('/roles/readiness')).body.data.ready, false);
});

test('account mutations require employee and assignments, prevent unlinking and expose no secrets', async () => {
  const f = await fixture();
  const req = async (method, body, id = '') => { const r = await fetch(`${base}/organizations/${f.org.id}/users${id}`, { method, headers: { authorization: `Bearer ${signToken(await f.admin.reload())}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: r.headers.get('content-type')?.includes('application/json') ? await r.json() : await r.text() }; };
  assert.equal((await req('POST', { email: 'unlinked@roles.invalid', name: 'Bad', role: 'HR_OFFICER' })).status, 400);
  const target = await f.account();
  await f.org.update({ accessControlMode: 'PERMISSIONS' });
  assert.equal((await req('PUT', { employeeId: null }, `/${target.id}`)).status, 400);
  const result = await req('PUT', { name: 'Updated', assignments: [{ roleId: f.role('HR_OFFICER').id, scopeType: 'SELECTED_BRANCHES', branchIds: [f.branch.id], effectiveFrom: todayIST() }] }, `/${target.id}`);
  assert.equal(result.status, 200); assert.equal(result.body.data.role, 'HR_OFFICER');
  assert.ok(await m.AuditLog.count({ where: { organizationId: f.org.id, action: 'org.roleAssignment.create' } })); assert.equal(JSON.stringify(result.body).includes('private hash'), false); assert.equal(JSON.stringify(result.body).includes('private mfa'), false);
});

test('bootstrap readiness blocks activation, invalidation rollback restores activation and valid new accounts retain temporary passwords', async () => {
  const f = await fixture();
  const unlinked = await f.account('ORG_ADMIN', false); await bootstrap.bootstrapOrganizationAccess({ organizationId: f.org.id });
  const readiness = await f.request('/roles/readiness'); assert.equal(readiness.body.data.ready, false); assert.ok(readiness.body.data.blockers.some(b => b.reason === 'BOOTSTRAP_ADMIN_LINK_REQUIRED'));
  assert.equal((await f.request('/roles/activate', 'POST', {})).status, 409); assert.equal((await f.org.reload()).accessControlMode, 'LEGACY');
  await unlinked.update({ status: 'INACTIVE' });
  const version = (await f.admin.reload()).accessVersion;
  m.AuditLog.addHook('beforeBulkCreate', 'failActivation', () => { throw new Error('activation invalidation failure'); });
  try { assert.equal((await f.request('/roles/activate', 'POST', {})).status, 500); } finally { m.AuditLog.removeHook('beforeBulkCreate', 'failActivation'); }
  assert.equal((await f.org.reload()).accessControlMode, 'LEGACY'); assert.equal((await f.admin.reload()).accessVersion, version);
  const employee = await m.Employee.create({ organizationId: f.org.id, postCadreId: (await m.PostCadre.findOne({ where: { organizationId: f.org.id } })).id, empCode: 'NEW', name: 'New Employee', doj: '2020-01-01', branchId: f.branch.id });
  const r = await fetch(`${base}/organizations/${f.org.id}/users`, { method: 'POST', headers: { authorization: `Bearer ${signToken(f.admin)}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'New account', email: 'new-account@roles.invalid', employeeId: employee.id, sendEmail: false, assignments: [{ roleId: f.role('HR_OFFICER').id, scopeType: 'SELECTED_BRANCHES', branchIds: [f.branch.id], effectiveFrom: todayIST() }] }) });
  const result = await r.json(); assert.equal(r.status, 201); assert.equal(typeof result.tempPassword, 'string'); assert.equal(result.email.bypassed, true); assert.equal(Object.hasOwn(result.data, 'passwordHash'), false);
  assert.equal(await m.UserRoleAssignment.count({ where: { userId: result.data.id, status: 'ACTIVE' } }), 2);
});

test('another administrator cannot remove the last effective protected admin through assignments or user status', async () => {
  const f = await fixture(), manager = await f.account();
  const copied = (await f.request('/roles', 'POST', { sourceRoleId: f.role('ORGANISATION_ADMIN').id, code: 'ACCESS', name: 'Access manager', permissionCodes: ['roles.manage', 'users.manage'] })).body.data;
  await f.request('/role-assignments', 'POST', { userId: manager.id, roleId: copied.id, scopeType: 'ORGANISATION', effectiveFrom: todayIST() });
  await f.org.update({ accessControlMode: 'PERMISSIONS' });
  const assignment = await m.UserRoleAssignment.findOne({ where: { userId: f.admin.id, roleId: f.role('ORGANISATION_ADMIN').id } });
  assert.equal((await f.request(`/role-assignments/${assignment.id}`, 'DELETE', undefined, manager)).status, 409);
  const r = await fetch(`${base}/organizations/${f.org.id}/users/${f.admin.id}`, { method: 'PUT', headers: { authorization: `Bearer ${signToken(await manager.reload())}`, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'INACTIVE' }) });
  assert.equal(r.status, 409); assert.equal((await f.admin.reload()).status, 'ACTIVE');
});

test('a users-only custom administrator cannot grant role assignments through account endpoints', async () => {
  const f = await fixture(), manager = await f.account(), target = await f.account();
  const copied = (await f.request('/roles', 'POST', { sourceRoleId: f.role('ORGANISATION_ADMIN').id, code: 'USERS_ONLY', name: 'Users only', permissionCodes: ['users.manage'] })).body.data;
  await f.request('/role-assignments', 'POST', { userId: manager.id, roleId: copied.id, scopeType: 'ORGANISATION', effectiveFrom: todayIST() }); await f.org.update({ accessControlMode: 'PERMISSIONS' });
  const r = await fetch(`${base}/organizations/${f.org.id}/users/${target.id}`, { method: 'PUT', headers: { authorization: `Bearer ${signToken(await manager.reload())}`, 'content-type': 'application/json' }, body: JSON.stringify({ assignments: [{ roleId: f.role('ORGANISATION_ADMIN').id, scopeType: 'ORGANISATION', effectiveFrom: todayIST() }] }) });
  assert.equal(r.status, 403);
});

test('ordinary account editing cannot move an administrator own employee identity', async () => {
  const f = await fixture();
  const employee = await m.Employee.create({ organizationId: f.org.id, postCadreId: (await m.PostCadre.findOne({ where: { organizationId: f.org.id } })).id, empCode: 'OWN_IDENTITY', name: 'Another employee', doj: '2020-01-01', branchId: f.branch.id });
  const r = await fetch(`${base}/organizations/${f.org.id}/users/${f.admin.id}`, { method: 'PUT', headers: { authorization: `Bearer ${signToken(await f.admin.reload())}`, 'content-type': 'application/json' }, body: JSON.stringify({ employeeId: employee.id }) });
  assert.equal(r.status, 400); assert.notEqual((await f.admin.reload()).employeeId, employee.id);
});

test('legacy employee creation without assignments creates only the protected OWN baseline', async () => {
  const f = await fixture();
  const employee = await m.Employee.create({ organizationId: f.org.id, postCadreId: (await m.PostCadre.findOne({ where: { organizationId: f.org.id } })).id, empCode: 'LEGACY_OWN', name: 'Self service', doj: '2020-01-01', branchId: f.branch.id });
  const r = await fetch(`${base}/organizations/${f.org.id}/users`, { method: 'POST', headers: { authorization: `Bearer ${signToken(await f.admin.reload())}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Self service', email: 'legacy-own@roles.invalid', role: 'EMPLOYEE', employeeId: employee.id, sendEmail: false }) });
  const body = await r.json(); assert.equal(r.status, 201);
  const assignments = await m.UserRoleAssignment.findAll({ where: { userId: body.data.id, status: 'ACTIVE' } });
  assert.equal(assignments.length, 1); assert.equal(assignments[0].roleId, f.role('EMPLOYEE').id); assert.equal(assignments[0].scopeType, 'OWN');
  assert.equal(await m.UserRoleBranch.count({ where: { userRoleAssignmentId: assignments[0].id } }), 0); assert.equal(await m.UserRoleDepartment.count({ where: { userRoleAssignmentId: assignments[0].id } }), 0);
  const access = await require('../src/services/accessControl').effectiveAccess(body.data.id); assert.equal(access.scopeSummary.organization, false); assert.deepEqual(access.scopeSummary.branchIds, []); assert.equal(access.permissionCodes.includes('people.view'), false);
});

async function updateAccount(f, user, data) {
  const response = await fetch(`${base}/organizations/${f.org.id}/users/${user.id}`, { method: 'PUT', headers: { authorization: `Bearer ${signToken(await f.admin.reload())}`, 'content-type': 'application/json' }, body: JSON.stringify(data) });
  return { status: response.status, body: await response.json() };
}

test('linking an inactive bootstrap through user updates permanently records bootstrap exit', async () => {
  const f = await fixture(), target = await f.account('ORG_ADMIN', false);
  await bootstrap.bootstrapOrganizationAccess({ organizationId: f.org.id });
  assert.equal((await bootstrap.accessReadiness(f.org.id)).bootstrapUserId, target.id);
  assert.equal((await updateAccount(f, target, { status: 'INACTIVE' })).status, 200);
  const employee = await m.Employee.create({ organizationId: f.org.id, postCadreId: (await m.PostCadre.findOne({ where: { organizationId: f.org.id } })).id, empCode: 'INACTIVE_BOOTSTRAP', name: 'Former bootstrap', doj: '2020-01-01', branchId: f.branch.id });
  const markerWhere = { organizationId: f.org.id, userId: target.id, roleId: f.role('EMPLOYEE').id, scopeType: 'OWN' };
  const inactiveVersion = (await target.reload()).accessVersion;
  m.AuditLog.addHook('beforeBulkCreate', 'inactiveLinkFailure', () => { throw new Error('inactive link invalidation failed'); });
  try { await assert.rejects(users.updateOrganizationUser({ user: f.admin }, target, { employeeId: employee.id }), /inactive link invalidation failed/); } finally { m.AuditLog.removeHook('beforeBulkCreate', 'inactiveLinkFailure'); }
  await target.reload(); assert.equal(target.employeeId, null); assert.equal(target.status, 'INACTIVE'); assert.equal(target.accessVersion, inactiveVersion); assert.equal(await m.UserRoleAssignment.count({ where: markerWhere }), 0);
  await users.updateOrganizationUser({ user: f.admin }, target, { employeeId: employee.id });
  assert.equal(await m.UserRoleAssignment.count({ where: markerWhere }), 1);
  assert.equal((await m.UserRoleAssignment.findOne({ where: markerWhere })).status, 'INACTIVE');
  await users.updateOrganizationUser({ user: f.admin }, target, { employeeId: employee.id });
  assert.equal(await m.UserRoleAssignment.count({ where: markerWhere }), 1);
  assert.equal((await updateAccount(f, target, { employeeId: null })).status, 200);
  assert.equal((await updateAccount(f, target, { status: 'ACTIVE' })).status, 200);
  const reloaded = await target.reload(); assert.equal(reloaded.employeeId, null); assert.equal(reloaded.status, 'ACTIVE');
  const readiness = await bootstrap.accessReadiness(f.org.id);
  assert.equal(readiness.bootstrapUserId, null); assert.ok(readiness.blockers.some(b => b.userId === target.id && b.reason === 'EMPLOYEE_LINK_REQUIRED'));
  assert.deepEqual((await require('../src/services/accessControl').effectiveAccess(target.id)).permissionCodes, []);
});

test('permission mode rejects combined deactivation/unlink and inactive unlink until operational assignments end', async () => {
  const f = await fixture(), target = await f.account();
  const assigned = await f.request('/role-assignments', 'POST', { userId: target.id, roleId: f.role('HR_OFFICER').id, scopeType: 'SELECTED_BRANCHES', branchIds: [f.branch.id], effectiveFrom: todayIST() });
  assert.equal(assigned.status, 201); await f.org.update({ accessControlMode: 'PERMISSIONS' });
  const employeeId = (await target.reload()).employeeId;
  for (const data of [{ status: 'INACTIVE', employeeId: null }, { employeeId: null }]) {
    const before = await target.reload(), version = before.accessVersion, status = before.status, auditCount = await m.AuditLog.count();
    const result = await updateAccount(f, target, data); assert.equal(result.status, 400);
    await target.reload(); assert.equal(target.employeeId, employeeId); assert.equal(target.status, status); assert.equal(target.accessVersion, version); assert.equal(await m.AuditLog.count(), auditCount);
    assert.equal((await m.UserRoleAssignment.findByPk(assigned.body.data.id)).status, 'ACTIVE');
    if (target.status === 'ACTIVE') assert.equal((await updateAccount(f, target, { status: 'INACTIVE' })).status, 200);
  }
  const ended = await f.request(`/role-assignments/${assigned.body.data.id}`, 'DELETE'); assert.equal(ended.status, 200);
  assert.equal((await updateAccount(f, target, { employeeId: null })).status, 200);
  assert.equal((await target.reload()).employeeId, null); assert.equal((await m.UserRoleAssignment.findByPk(assigned.body.data.id)).status, 'INACTIVE');
});
