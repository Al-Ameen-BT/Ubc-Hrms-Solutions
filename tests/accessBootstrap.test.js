'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const { sequelize, Organization, OrganizationBranch, Employee, PostCadre, User, OrganizationRole, OrganizationRolePermission, UserRoleAssignment, UserRoleBranch, EmployeeOrganizationAssignment } = models;
const { ROLE_TEMPLATES, template } = require('../src/services/permissionCatalog');
const { bootstrapOrganizationAccess, resolveLegacyAssignments, accessReadiness } = require('../src/services/accessBootstrap');
const userAdmin = require('../src/services/userAdmin');
let serial = 0;
before(() => sequelize.sync());
after(() => sequelize.close());
async function bank() {
  const org = await Organization.create({ code: `BOOT${++serial}`, name: 'Bootstrap bank' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });
  const branch = await OrganizationBranch.create({ organizationId: org.id, code: 'HO', name: 'Head Office', isHeadOffice: true });
  return { org, post, branch };
}
async function employee(b, extra = {}) {
  return Employee.create({ organizationId: b.org.id, empCode: `EMP${++serial}`, name: 'Employee', doj: '2020-01-01', postCadreId: b.post.id, currentBasicPay: 20000, branchCode: 'HO', branchName: 'Head Office', ...extra });
}
async function user(b, role, employeeId = null, extra = {}) {
  return User.create({ organizationId: b.org.id, email: `boot${++serial}@example.invalid`, name: role, role, employeeId, passwordHash: 'unused', ...extra });
}

test('maps all legacy roles, gives linked users own baseline, and reruns without duplicates or legacy changes', async () => {
  const b = await bank();
  const legacy = User.ROLES.filter(code => code !== 'SUPER_ADMIN');
  for (const role of legacy) await user(b, role, (await employee(b)).id);
  const beforeUsers = (await User.findAll({ where: { organizationId: b.org.id } })).map(u => [u.id, u.role, u.accessVersion]);
  const first = await bootstrapOrganizationAccess({ organizationId: b.org.id });
  assert.equal(first.unresolvedUsers.length, 1); // Department Head needs an explicit department.
  assert.equal(first.unresolvedUsers[0].reason, 'DEPARTMENT_SCOPE_REQUIRED');
  assert.equal(await OrganizationRole.count({ where: { organizationId: b.org.id } }), ROLE_TEMPLATES.length);
  const roles = await OrganizationRole.findAll({ where: { organizationId: b.org.id } });
  for (const role of roles) {
    const codes = (await OrganizationRolePermission.findAll({ where: { roleId: role.id } })).map(p => p.permissionCode).sort();
    assert.deepEqual(codes, [...template(role.templateCode).permissionCodes].sort());
    assert.equal(role.isProtected, true);
  }
  const hr = await User.findOne({ where: { organizationId: b.org.id, role: 'HR_OFFICER' } });
  const hrRole = roles.find(r => r.code === 'HR_OFFICER');
  const hrAssignment = await UserRoleAssignment.findOne({ where: { userId: hr.id, roleId: hrRole.id } });
  assert.equal(hrAssignment.scopeType, 'SELECTED_BRANCHES');
  assert.equal((await UserRoleBranch.findOne({ where: { userRoleAssignmentId: hrAssignment.id } })).branchId, b.branch.id);
  const counts = await Promise.all([OrganizationRole, OrganizationRolePermission, UserRoleAssignment, UserRoleBranch, EmployeeOrganizationAssignment].map(m => m.count()));
  await bootstrapOrganizationAccess({ organizationId: b.org.id });
  assert.deepEqual(await Promise.all([OrganizationRole, OrganizationRolePermission, UserRoleAssignment, UserRoleBranch, EmployeeOrganizationAssignment].map(m => m.count())), counts);
  assert.deepEqual((await User.findAll({ where: { organizationId: b.org.id } })).map(u => [u.id, u.role, u.accessVersion]), beforeUsers);
  assert.equal((await b.org.reload()).accessControlMode, 'LEGACY');
});

test('exact tenant-local branch mapping rejects ambiguous, absent, conflicting and foreign IDs without guessing structure or pay', async () => {
  const b = await bank();
  const other = await bank();
  await OrganizationBranch.create({ organizationId: b.org.id, name: 'Duplicate', code: 'D1' });
  await OrganizationBranch.create({ organizationId: b.org.id, name: 'Duplicate', code: 'D2' });
  const good = await employee(b);
  const codeOnly = await employee(b, { branchCode: 'HO', branchName: null });
  const ambiguous = await employee(b, { branchCode: null, branchName: 'Duplicate' });
  const absent = await employee(b, { branchCode: 'none', branchName: null });
  const conflict = await employee(b, { branchCode: 'HO', branchName: 'Duplicate' });
  const foreign = await employee(b, { branchId: other.branch.id });
  const result = await resolveLegacyAssignments({ organizationId: b.org.id });
  assert.deepEqual(result.unresolvedEmployees.map(e => e.employeeId).sort((a, b) => a - b), [ambiguous.id, absent.id, conflict.id, foreign.id]);
  for (const e of [good, codeOnly]) {
    await e.reload();
    assert.equal(e.branchId, b.branch.id);
    assert.equal(e.departmentId, null);
    assert.equal(e.positionId, null);
    assert.equal(e.currentBasicPay, 20000);
    assert.equal(await EmployeeOrganizationAssignment.count({ where: { employeeId: e.id, branchId: b.branch.id } }), 1);
  }
  assert.equal((await foreign.reload()).branchId, other.branch.id);
  assert.ok((await accessReadiness(b.org.id)).blockers.some(b => b.reason === 'AMBIGUOUS_BRANCH'));
});

test('retains only one bootstrap admin and reports unlinked, inactive, duplicate and cross-tenant employee links', async () => {
  const b = await bank();
  const other = await bank();
  const admin = await user(b, 'ORG_ADMIN');
  const secondAdmin = await user(b, 'ORG_ADMIN');
  const unlinked = await user(b, 'PAYROLL_OFFICER');
  const foreign = await user(b, 'HR_ADMIN', (await employee(other)).id);
  const inactive = await user(b, 'HR_ADMIN', (await employee(b, { status: 'INACTIVE' })).id);
  const duplicateEmployee = await employee(b);
  const duplicate1 = await user(b, 'HR_ADMIN', duplicateEmployee.id);
  const duplicate2 = await user(b, 'EMPLOYEE', duplicateEmployee.id);
  const result = await bootstrapOrganizationAccess({ organizationId: b.org.id });
  assert.equal(result.bootstrapUserId, admin.id);
  assert.deepEqual(result.unresolvedUsers.map(u => u.userId).sort((a, b) => a - b), [secondAdmin.id, unlinked.id, foreign.id, inactive.id, duplicate1.id, duplicate2.id]);
  assert.equal(await UserRoleAssignment.count({ where: { userId: admin.id } }), 1);
  for (const u of [secondAdmin, unlinked, foreign, inactive, duplicate1, duplicate2]) assert.equal(await UserRoleAssignment.count({ where: { userId: u.id } }), 0);
  const readiness = await accessReadiness(b.org.id);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.bootstrapUserId, admin.id);
  assert.ok(readiness.warnings.some(w => w.reason === 'BOOTSTRAP_ADMIN_UNLINKED'));
  // Linking once creates the persistent own-record baseline; unlinking cannot restore the exception.
  admin.employeeId = (await employee(b)).id; await admin.save();
  await bootstrapOrganizationAccess({ organizationId: b.org.id });
  admin.employeeId = null; await admin.save();
  const rerun = await bootstrapOrganizationAccess({ organizationId: b.org.id });
  assert.ok(rerun.unresolvedUsers.some(u => u.userId === admin.id && u.reason === 'EMPLOYEE_LINK_REQUIRED'));
});

test('bootstrap is tenant-locked, rolls back with caller transaction, and never overwrites custom copies', async () => {
  const b = await bank();
  await assert.rejects(sequelize.transaction(async transaction => {
    await bootstrapOrganizationAccess({ organizationId: b.org.id, transaction });
    throw new Error('rollback');
  }), /rollback/);
  assert.equal(await OrganizationRole.count({ where: { organizationId: b.org.id } }), 0);
  await OrganizationRole.create({ organizationId: b.org.id, code: 'HR_ADMIN', name: 'Custom HR', templateCode: 'HR_OFFICER' });
  await assert.rejects(bootstrapOrganizationAccess({ organizationId: b.org.id }), /protected role/i);
  assert.equal(await OrganizationRolePermission.count({ where: { organizationId: b.org.id } }), 0);
});

test('account onboarding creates protected bootstrap access while LEGACY users remain compatible', async () => {
  const b = await bank();
  const created = await userAdmin.createAccount({}, { organizationId: b.org.id, email: `new${++serial}@example.invalid`, name: 'Admin', role: 'ORG_ADMIN', sendEmail: false });
  assert.equal(await UserRoleAssignment.count({ where: { userId: created.user.id } }), 1);
  const legacy = await userAdmin.createAccount({}, { organizationId: b.org.id, email: `new${++serial}@example.invalid`, name: 'Legacy HR', role: 'HR_OFFICER', sendEmail: false });
  assert.equal(legacy.user.role, 'HR_OFFICER');
  assert.equal(await UserRoleAssignment.count({ where: { userId: legacy.user.id } }), 0);
  assert.equal((await b.org.reload()).accessControlMode, 'LEGACY');
});

test('readiness is read-only and detects missing baselines, unsafe ceilings, missing admins and assignment conflicts', async () => {
  const b = await bank();
  await bootstrapOrganizationAccess({ organizationId: b.org.id });
  assert.ok((await accessReadiness(b.org.id)).blockers.some(b => b.reason === 'ORG_ADMIN_ASSIGNMENT_REQUIRED'));
  const admin = await user(b, 'ORG_ADMIN', (await employee(b)).id);
  await bootstrapOrganizationAccess({ organizationId: b.org.id });
  assert.equal((await accessReadiness(b.org.id)).ready, true);
  const baseline = await OrganizationRole.findOne({ where: { organizationId: b.org.id, code: 'EMPLOYEE' } });
  await UserRoleAssignment.destroy({ where: { userId: admin.id, roleId: baseline.id } });
  const count = await UserRoleAssignment.count();
  assert.ok((await accessReadiness(b.org.id)).blockers.some(b => b.reason === 'OWN_BASELINE_REQUIRED'));
  assert.equal(await UserRoleAssignment.count(), count);
  await bootstrapOrganizationAccess({ organizationId: b.org.id });
  await OrganizationRolePermission.create({ organizationId: b.org.id, roleId: baseline.id, permissionCode: 'payroll.approve' });
  assert.ok((await accessReadiness(b.org.id)).blockers.some(b => b.reason === 'TEMPLATE_CEILING_EXCEEDED'));
  await assert.rejects(bootstrapOrganizationAccess({ organizationId: b.org.id }), /ceiling/);
  await OrganizationRolePermission.destroy({ where: { roleId: baseline.id, permissionCode: 'payroll.approve' } });
  const otherBranch = await OrganizationBranch.create({ organizationId: b.org.id, code: 'OTHER', name: 'Other', unitType: 'BRANCH' });
  await EmployeeOrganizationAssignment.create({ organizationId: b.org.id, employeeId: admin.employeeId, branchId: otherBranch.id, effectiveFrom: '2020-01-01' });
  assert.ok((await accessReadiness(b.org.id)).blockers.some(b => b.reason === 'CONFLICTING_PRIMARY_ASSIGNMENT'));
});

test('explicit department scope is retained and permission-mode tenants cannot be bootstrapped', async () => {
  const b = await bank();
  const department = await models.OrganizationDepartment.create({ organizationId: b.org.id, branchId: b.branch.id, code: 'HR', name: 'HR' });
  const head = await user(b, 'DEPARTMENT_HEAD', (await employee(b, { departmentId: department.id })).id);
  const result = await bootstrapOrganizationAccess({ organizationId: b.org.id });
  assert.equal(result.unresolvedUsers.length, 0);
  const role = await OrganizationRole.findOne({ where: { organizationId: b.org.id, code: 'DEPARTMENT_HEAD' } });
  const assignment = await UserRoleAssignment.findOne({ where: { userId: head.id, roleId: role.id } });
  assert.equal(assignment.scopeType, 'DEPARTMENT');
  assert.equal((await models.UserRoleDepartment.findOne({ where: { userRoleAssignmentId: assignment.id } })).departmentId, department.id);
  await b.org.update({ accessControlMode: 'PERMISSIONS' });
  await assert.rejects(bootstrapOrganizationAccess({ organizationId: b.org.id }), /LEGACY/);
  await assert.rejects(resolveLegacyAssignments({ organizationId: b.org.id }), /LEGACY/);
});

test('db:init bootstraps existing tenants after migration and reruns with aggregate-only output', async () => {
  const { mkdtempSync, rmSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const { join } = require('node:path');
  const { execFileSync } = require('node:child_process');
  const directory = mkdtempSync(join(tmpdir(), 'hrms-access-bootstrap-'));
  const env = { ...process.env, DB_DIALECT: 'sqlite', DB_STORAGE: join(directory, 'test.sqlite') };
  const run = args => execFileSync(process.execPath, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    run(['-e', `const {sequelize, Organization, User} = require('./src/models'); (async () => { await sequelize.sync(); const org = await Organization.create({code:'INIT', name:'Private tenant'}); await User.create({organizationId:org.id, role:'ORG_ADMIN', name:'Private admin', email:'private@example.invalid', passwordHash:'private-credential'}); await sequelize.close(); })().catch(e => { console.error(e); process.exit(1); });`]);
    const first = run(['src/scripts/dbInit.js']);
    const second = run(['src/scripts/dbInit.js']);
    const summary = output => {
      const line = output.split('\n').find(line => line.startsWith('Organisation access bootstrap:'));
      assert.ok(line, JSON.stringify(output));
      return JSON.parse(line.slice('Organisation access bootstrap:'.length));
    };
    assert.equal(summary(first).rolesCreated, 11);
    assert.equal(summary(first).assignmentsCreated, 1);
    assert.equal(summary(second).rolesCreated, 0);
    assert.equal(summary(second).permissionsCreated, 0);
    assert.equal(summary(second).assignmentsCreated, 0);
    assert.ok(!first.includes('Private') && !first.includes('private@example.invalid') && !first.includes('private-credential'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('valid employee links retain own self-service while ambiguous operational branch scopes remain blocked', async () => {
  const b = await bank();
  await user(b, 'ORG_ADMIN');
  const linked = await user(b, 'HR_OFFICER', (await employee(b, { branchCode: 'missing', branchName: null })).id);
  const result = await bootstrapOrganizationAccess({ organizationId: b.org.id });
  assert.ok(result.unresolvedUsers.some(u => u.userId === linked.id));
  const baseline = await OrganizationRole.findOne({ where: { organizationId: b.org.id, code: 'EMPLOYEE' } });
  assert.equal(await UserRoleAssignment.count({ where: { userId: linked.id, roleId: baseline.id, scopeType: 'OWN' } }), 1);
  assert.equal(await UserRoleAssignment.count({ where: { userId: linked.id } }), 1);
  const e = await Employee.findByPk(linked.employeeId);
  await e.update({ branchCode: 'HO' });
  await bootstrapOrganizationAccess({ organizationId: b.org.id });
  assert.equal((await accessReadiness(b.org.id)).ready, true);
  const role = await OrganizationRole.findOne({ where: { organizationId: b.org.id, code: 'HR_OFFICER' } });
  const assignment = await UserRoleAssignment.findOne({ where: { userId: linked.id, roleId: role.id } });
  await UserRoleBranch.destroy({ where: { userRoleAssignmentId: assignment.id } });
  assert.ok((await accessReadiness(b.org.id)).blockers.some(b => b.reason === 'LEGACY_ROLE_SCOPE_REQUIRED'));
});

test('link writes record the one-time bootstrap exit', async () => {
  const b = await bank();
  const e = await employee(b);
  const admin = await user(b, 'ORG_ADMIN');
  await bootstrapOrganizationAccess({ organizationId: b.org.id });
  await userAdmin.withEmployeeLink(b.org.id, e.id, admin.id, async transaction => {
    await admin.update({ employeeId: e.id }, { transaction });
  });
  await admin.update({ employeeId: null });
  assert.ok((await accessReadiness(b.org.id)).blockers.some(b => b.userId === admin.id && b.reason === 'EMPLOYEE_LINK_REQUIRED'));
});

test('LEGACY hard-delete cleans only user access rows and preserves employee and audit history', async () => {
  const b = await bank();
  const e = await employee(b);
  const officer = await user(b, 'HR_OFFICER', e.id);
  await bootstrapOrganizationAccess({ organizationId: b.org.id });
  const assignmentIds = (await UserRoleAssignment.findAll({ where: { userId: officer.id } })).map(a => a.id);
  assert.equal(assignmentIds.length, 2);
  await userAdmin.setStatus({}, officer, 'INACTIVE');
  await userAdmin.hardDelete({}, officer);
  assert.equal(await User.findByPk(officer.id), null);
  assert.equal(await UserRoleAssignment.count({ where: { userId: officer.id } }), 0);
  assert.equal(await UserRoleBranch.count({ where: { userRoleAssignmentId: assignmentIds } }), 0);
  assert.ok(await Employee.findByPk(e.id));
  assert.ok(await EmployeeOrganizationAssignment.findOne({ where: { employeeId: e.id } }));
  assert.ok(await models.AuditLog.findOne({ where: { action: 'user.delete', targetId: String(officer.id) } }));
  assert.equal(await OrganizationRole.count({ where: { organizationId: b.org.id } }), 11);
});

test('an inactive bootstrap admin permanently exits bootstrap when linked before unlinking and reactivation', async () => {
  const b = await bank();
  const e = await employee(b);
  const admin = await user(b, 'ORG_ADMIN');
  await bootstrapOrganizationAccess({ organizationId: b.org.id });
  await userAdmin.setStatus({}, admin, 'INACTIVE');
  const link = () => userAdmin.withEmployeeLink(b.org.id, e.id, admin.id, transaction => admin.update({ employeeId: e.id }, { transaction }));
  await link();
  await link();
  const baselineRole = await OrganizationRole.findOne({ where: { organizationId: b.org.id, code: 'EMPLOYEE' } });
  const baseline = await UserRoleAssignment.findAll({ where: { organizationId: b.org.id, userId: admin.id, roleId: baselineRole.id } });
  assert.equal(baseline.length, 1, 'inactive linking must persist one idempotent bootstrap-exit marker');
  assert.equal(baseline[0].status, 'INACTIVE', 'the marker must not grant access to an inactive account');
  await admin.update({ employeeId: null });
  await userAdmin.setStatus({}, admin, 'ACTIVE');
  const readiness = await accessReadiness(b.org.id);
  assert.equal(readiness.bootstrapUserId, null);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.blockers.some(b => b.userId === admin.id && b.reason === 'EMPLOYEE_LINK_REQUIRED'));
  assert.equal((await b.org.reload()).accessControlMode, 'LEGACY');
});
