'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'access-engine-test-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const { sequelize, Organization, OrganizationBranch: Branch, OrganizationDepartment: Department, Employee, PostCadre, User, OrganizationRole: Role, OrganizationRolePermission: RolePermission, UserRoleAssignment: Assignment, UserRoleBranch, UserRoleDepartment, PayrollRun } = models;
const { effectiveAccess, can, scopedWhere } = require('../src/services/accessControl');
const { requirePermission, requireAnyPermission } = require('../src/middleware/permissions');
const { authenticate } = require('../src/middleware/auth');
const { signToken } = require('../src/services/authService');
const { bootstrapOrganizationAccess } = require('../src/services/accessBootstrap');
const at = new Date().toISOString().slice(0, 10);
const shiftDate = days => { const date = new Date(`${at}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
let serial = 0;
before(() => sequelize.sync());
after(() => sequelize.close());
async function fixture(mode = 'PERMISSIONS', legacyRole = 'EMPLOYEE') {
  const org = await Organization.create({ code: `ACCESS${++serial}`, name: 'Access bank', accessControlMode: mode });
  const post = await PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });
  const branch = await Branch.create({ organizationId: org.id, code: 'HO', name: 'Head Office', unitType: 'HEAD_OFFICE' });
  const second = await Branch.create({ organizationId: org.id, code: 'B2', name: 'Second' });
  const department = await Department.create({ organizationId: org.id, branchId: branch.id, code: 'HR', name: 'HR' });
  const employees = [];
  for (const [i, branchId, departmentId] of [[1, branch.id, department.id], [2, branch.id, department.id], [3, second.id, null]]) {
    const employee = await Employee.create({ organizationId: org.id, empCode: `E${i}`, name: `Employee ${i}`, doj: '2020-01-01', postCadreId: post.id, branchId, departmentId });
    await models.EmployeeOrganizationAssignment.create({ organizationId: org.id, employeeId: employee.id, branchId, departmentId, effectiveFrom: at });
    employees.push(employee);
  }
  const user = await User.create({ organizationId: org.id, employeeId: employees[0].id, email: `access${++serial}@example.invalid`, name: 'User', passwordHash: 'unused', role: legacyRole });
  return { org, branch, second, department, employees, user };
}
async function assign(b, templateCode, permissionCodes, scopeType, extra = {}) {
  const role = await Role.create({ organizationId: b.org.id, code: `R${++serial}`, name: `Role ${serial}`, templateCode });
  for (const permissionCode of permissionCodes) await RolePermission.create({ organizationId: b.org.id, roleId: role.id, permissionCode });
  const assignment = await Assignment.create({ organizationId: b.org.id, userId: b.user.id, roleId: role.id, scopeType, effectiveFrom: at, ...extra });
  return { role, assignment };
}
const resource = employee => ({ ...employee.get({ plain: true }), resourceType: 'Employee' });
const ids = async (access, code, type = 'Employee') => (await models[type].findAll({ where: scopedWhere(access, code, type), order: [['id', 'ASC']] })).map(row => row.id);
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
async function run(middleware, req) {
  const res = response(); let nextCalled = false;
  await middleware(req, res, error => { if (error) throw error; nextCalled = true; });
  return { res, nextCalled };
}

test('union combines scoped roles but never permissions or scopes beyond source ceilings', async () => {
  const b = await fixture();
  const hr = await assign(b, 'HR_OFFICER', ['people.view', 'payroll.approve', 'invented.permission'], 'SELECTED_BRANCHES');
  await UserRoleBranch.create({ organizationId: b.org.id, userRoleAssignmentId: hr.assignment.id, branchId: b.branch.id });
  await assign(b, 'PAYROLL_OFFICER', ['payroll.prepare'], 'ORGANISATION');
  await assign(b, 'HR_OFFICER', ['people.edit'], 'ORGANISATION');
  const access = await effectiveAccess(b.user.id, at);
  assert.equal(can(access, 'people.view', resource(b.employees[1])), true);
  assert.equal(can(access, 'people.view', resource(b.employees[2])), false);
  assert.equal(can(access, 'payroll.prepare'), true);
  assert.equal(can(access, 'payroll.approve'), false);
  assert.equal(can(access, 'invented.permission'), false);
  assert.equal(can(access, 'people.edit'), false);
  assert.equal(can(access, 'self.payslips', resource(b.employees[0])), true);
  assert.equal(can(access, 'self.payslips', resource(b.employees[1])), false);
  assert.deepEqual(await ids(access, 'people.view'), [b.employees[0].id, b.employees[1].id]);
  assert.deepEqual(await ids(access, 'self.payslips'), [b.employees[0].id]);
  assert.deepEqual(await ids(access, 'people.edit'), []);
  assert.deepEqual(Object.keys(access.scopeSummary).sort(), ['branchIds', 'departmentIds', 'organization', 'own']);
  assert.equal(JSON.stringify(access.scopeSummary).includes('Employee'), false);
  assert.deepEqual(access.homeAssignment, { branchId: b.branch.id, departmentId: b.department.id, positionId: null, effectiveFrom: at });
  assert.deepEqual(access.scopeSummary.branchIds, [b.branch.id]);
});

test('department predicates require active tenant-owned departments and their active branches', async () => {
  const b = await fixture(); const foreign = await fixture();
  const { assignment } = await assign(b, 'DEPARTMENT_HEAD', ['people.view'], 'DEPARTMENT');
  await UserRoleDepartment.create({ organizationId: b.org.id, userRoleAssignmentId: assignment.id, departmentId: b.department.id });
  await UserRoleDepartment.create({ organizationId: b.org.id, userRoleAssignmentId: assignment.id, departmentId: foreign.department.id });
  let access = await effectiveAccess(b.user.id, at);
  assert.deepEqual(await ids(access, 'people.view'), [b.employees[0].id, b.employees[1].id]);
  assert.equal(can(access, 'people.view', resource(foreign.employees[0])), false);
  assert.deepEqual(access.scopeSummary.departmentIds, [b.department.id]);
  await b.department.update({ status: 'INACTIVE' });
  assert.deepEqual(await ids(await effectiveAccess(b.user.id, at), 'people.view'), []);
  await b.department.update({ status: 'ACTIVE' });
  await b.branch.update({ status: 'INACTIVE' });
  assert.deepEqual(await ids(await effectiveAccess(b.user.id, at), 'people.view'), []);
});

test('expired, future and inactive assignments or roles contribute nothing; end dates are inclusive', async () => {
  const b = await fixture();
  for (const extra of [{ effectiveTo: shiftDate(-1) }, { effectiveFrom: shiftDate(100) }, { status: 'INACTIVE' }]) await assign(b, 'PAYROLL_OFFICER', ['payroll.prepare'], 'ORGANISATION', extra);
  const inactive = await assign(b, 'PAYROLL_OFFICER', ['payroll.prepare'], 'ORGANISATION');
  await inactive.role.update({ status: 'INACTIVE' });
  assert.equal(can(await effectiveAccess(b.user.id, at), 'payroll.prepare'), false);
  await assign(b, 'PAYROLL_OFFICER', ['payroll.prepare'], 'ORGANISATION', { effectiveFrom: at, effectiveTo: at });
  assert.equal(can(await effectiveAccess(b.user.id, at), 'payroll.prepare'), true);
  assert.equal(can(await effectiveAccess(b.user.id, shiftDate(1)), 'payroll.prepare'), false);
});

test('selected branches reject inactive and foreign resources and query scopes cannot escape the tenant', async () => {
  const b = await fixture(); const foreign = await fixture();
  const { assignment } = await assign(b, 'HR_OFFICER', ['people.view'], 'SELECTED_BRANCHES');
  for (const branch of [b.branch, foreign.branch]) await UserRoleBranch.create({ organizationId: b.org.id, userRoleAssignmentId: assignment.id, branchId: branch.id });
  let access = await effectiveAccess(b.user.id, at);
  assert.deepEqual(access.scopeSummary.branchIds, [b.branch.id]);
  assert.equal(can(access, 'people.view', resource(foreign.employees[0])), false);
  assert.deepEqual(await ids(access, 'people.view'), [b.employees[0].id, b.employees[1].id]);
  await b.branch.update({ status: 'INACTIVE' });
  access = await effectiveAccess(b.user.id, at);
  assert.equal(can(access, 'people.view', resource(b.employees[0])), false);
  assert.deepEqual(await ids(access, 'people.view'), []);
});

test('LEGACY mapping works without assignments and preserves management organisation scope', async () => {
  for (const role of ['HR_OFFICER', 'DEPARTMENT_HEAD']) {
    const b = await fixture('LEGACY', role);
    const access = await effectiveAccess(b.user.id, at);
    assert.equal(can(access, 'people.view', resource(b.employees[2])), true);
    assert.deepEqual(await ids(access, 'people.view'), b.employees.map(e => e.id));
    assert.equal(can(access, 'payroll.approve'), false);
    assert.equal(await Assignment.count({ where: { userId: b.user.id } }), 0);
  }
});

test('unlinked protected bootstrap gets only onboarding administration, even after role union', async () => {
  const b = await fixture('LEGACY', 'ORG_ADMIN');
  await b.user.update({ employeeId: null });
  await bootstrapOrganizationAccess({ organizationId: b.org.id });
  await b.org.update({ accessControlMode: 'PERMISSIONS' });
  await assign(b, 'PAYROLL_OFFICER', ['payroll.prepare'], 'ORGANISATION');
  const access = await effectiveAccess(b.user.id, at);
  for (const code of ['roles.manage', 'structure.manage', 'people.create', 'people.edit']) assert.equal(can(access, code), true, code);
  for (const code of ['payroll.prepare', 'people.export', 'transfers.manage', 'hr.manage', 'leave.manage', 'payments.view', 'self.profile', 'chart.view']) assert.equal(can(access, code), false, code);
  const another = await User.create({ organizationId: b.org.id, email: `extra${++serial}@example.invalid`, name: 'Other', role: 'ORG_ADMIN', passwordHash: 'unused' });
  assert.equal(can(await effectiveAccess(another.id, at), 'roles.manage'), false);
  // A protected baseline records that this account was linked previously.
  await assign(b, 'EMPLOYEE', ['self.profile'], 'OWN');
  assert.equal(can(await effectiveAccess(b.user.id, at), 'roles.manage'), false);
});

test('invalid, duplicate and inactive employee links fail closed in permission mode', async () => {
  const b = await fixture();
  await assign(b, 'HR_ADMIN', ['people.view'], 'ORGANISATION');
  await b.employees[0].update({ status: 'INACTIVE' });
  assert.equal(can(await effectiveAccess(b.user.id, at), 'people.view'), false);
  await b.employees[0].update({ status: 'ACTIVE' });
  await User.create({ organizationId: b.org.id, employeeId: b.employees[0].id, email: `duplicate${++serial}@example.invalid`, name: 'Duplicate', role: 'EMPLOYEE', passwordHash: 'unused' });
  assert.equal(can(await effectiveAccess(b.user.id, at), 'people.view'), false);
  assert.equal(can(await effectiveAccess(999999, at), 'people.view'), false);
  const platform = await User.create({ email: `platform${++serial}@example.invalid`, name: 'Platform', role: 'SUPER_ADMIN', passwordHash: 'unused' });
  assert.equal(can(await effectiveAccess(platform.id, at), 'people.view'), false);
});

test('protected maker-checker denial wins after union in both resource checks and database queries', async () => {
  const b = await fixture();
  await assign(b, 'PAYROLL_OFFICER', ['payroll.prepare'], 'ORGANISATION');
  await assign(b, 'APPROVING_AUTHORITY', ['payroll.approve'], 'ORGANISATION');
  const own = await PayrollRun.create({ organizationId: b.org.id, year: 2026, month: 10, processedByUserId: b.user.id });
  const other = await PayrollRun.create({ organizationId: b.org.id, year: 2026, month: 11, processedByUserId: 999 });
  const access = await effectiveAccess(b.user.id, at);
  assert.equal(can(access, 'payroll.approve', own), false);
  assert.equal(can(access, 'payroll.approve', other), true);
  assert.deepEqual(await ids(access, 'payroll.approve', 'PayrollRun'), [other.id]);
  assert.deepEqual(await ids(access, 'people.view', 'PayrollRun'), []);
});

test('permission middleware tenant-loads resources and uses uniform missing/foreign responses', async () => {
  const b = await fixture(); const foreign = await fixture();
  const { assignment } = await assign(b, 'HR_OFFICER', ['people.view'], 'SELECTED_BRANCHES');
  await UserRoleBranch.create({ organizationId: b.org.id, userRoleAssignmentId: assignment.id, branchId: b.branch.id });
  const guard = requirePermission('people.view', req => ({ resourceType: 'Employee', id: req.params.id }));
  const req = id => ({ user: { id: b.user.id, organizationId: b.org.id }, params: { id } });
  assert.equal((await run(guard, req(b.employees[1].id))).nextCalled, true);
  assert.equal((await run(guard, req(b.employees[2].id))).res.statusCode, 403);
  const missing = await run(guard, req(999999)); const outside = await run(guard, req(foreign.employees[0].id));
  assert.equal(missing.res.statusCode, 404); assert.equal(outside.res.statusCode, 404); assert.deepEqual(outside.res.body, missing.res.body);
  assert.equal((await run(requirePermission('people.view'), {})).res.statusCode, 401);
  assert.equal((await run(requireAnyPermission('payroll.prepare', 'people.view'), req())).nextCalled, true);
  assert.equal((await run(requireAnyPermission('payroll.prepare', 'payroll.approve'), req())).res.statusCode, 403);
  const authReq = { headers: { authorization: `Bearer ${signToken(b.user)}` } };
  assert.equal((await run(authenticate, authReq)).nextCalled, true);
  assert.equal(authReq.user.accessControlMode, 'PERMISSIONS');
});

test('protected bootstrap restrictions also apply before permission-mode activation', async () => {
  const b = await fixture('LEGACY', 'ORG_ADMIN');
  await b.user.update({ employeeId: null });
  await bootstrapOrganizationAccess({ organizationId: b.org.id });
  const access = await effectiveAccess(b.user.id, at);
  assert.equal(can(access, 'people.create'), true);
  assert.equal(can(access, 'roles.manage'), true);
  assert.equal(can(access, 'people.export'), false);
  assert.equal(can(access, 'payroll.view'), false);
  assert.equal(can(access, 'chart.view'), false);
});

test('organisation-wide queries exclude inactive structures and permission evaluation sees caller transactions', async () => {
  const b = await fixture();
  await assign(b, 'HR_ADMIN', ['people.view'], 'ORGANISATION');
  await b.second.update({ status: 'INACTIVE' });
  let access = await effectiveAccess(b.user.id, at);
  assert.equal(can(access, 'people.view', resource(b.employees[2])), false);
  assert.deepEqual(await ids(access, 'people.view'), [b.employees[0].id, b.employees[1].id]);
  const transaction = await sequelize.transaction();
  try {
    await b.user.update({ status: 'INACTIVE' }, { transaction });
    access = await effectiveAccess(b.user.id, at, transaction);
    assert.equal(can(access, 'people.view'), false);
  } finally { await transaction.rollback(); }
  await b.org.update({ status: 'INACTIVE' });
  assert.equal(can(await effectiveAccess(b.user.id, at), 'people.view'), false);
  await assert.rejects(effectiveAccess(b.user.id, '2026-02-30'), /Invalid access date/);
});

test('payment guardrails deny preparer, approver and unapproved runs in SQL and resource checks', async () => {
  const b = await fixture();
  await assign(b, 'ACCOUNTS_OFFICER', ['payments.pay'], 'ORGANISATION');
  const runs = [];
  for (const [month, status, processedByUserId, approvedByUserId] of [[1, 'APPROVED', b.user.id, 99], [2, 'APPROVED', 99, b.user.id], [3, 'PROCESSED', 99, 98], [4, 'APPROVED', 99, 98]]) {
    runs.push(await PayrollRun.create({ organizationId: b.org.id, year: 2026, month, status, processedByUserId, approvedByUserId }));
  }
  const access = await effectiveAccess(b.user.id, at);
  assert.deepEqual(runs.map(row => can(access, 'payments.pay', row)), [false, false, false, true]);
  assert.deepEqual(await ids(access, 'payments.pay', 'PayrollRun'), [runs[3].id]);
});

test('self-approval guardrails block approving user own leave application', async () => {
  const b = await fixture();
  await assign(b, 'HR_ADMIN', ['leave.approve'], 'ORGANISATION');
  const access = await effectiveAccess(b.user.id, at);
  // b.employees[0] is linked to b.user
  const ownApp = { resourceType: 'LeaveApplication', organizationId: b.org.id, employeeId: b.employees[0].id, appliedBy: b.user.id };
  const otherApp = { resourceType: 'LeaveApplication', organizationId: b.org.id, employeeId: b.employees[1].id, appliedBy: 999 };
  assert.equal(can(access, 'leave.approve', ownApp), false);
  assert.equal(can(access, 'leave.approve', otherApp), true);
});

test('ending a legacy bootstrap assignment cannot restore unrestricted legacy admin access', async () => {
  const b = await fixture('LEGACY', 'ORG_ADMIN');
  await b.user.update({ employeeId: null });
  await bootstrapOrganizationAccess({ organizationId: b.org.id });
  await Assignment.update({ status: 'INACTIVE' }, { where: { organizationId: b.org.id, userId: b.user.id } });
  const access = await effectiveAccess(b.user.id, at);
  assert.equal(can(access, 'roles.manage'), false);
  assert.equal(can(access, 'payroll.view'), false);
  assert.equal(can(access, 'people.export'), false);
});
