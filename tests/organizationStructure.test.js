'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../src/models');
const s = require('../src/services/organizationStructure');
const { todayIST } = require('../src/services/orgAccess');
const { sequelize, Organization, OrganizationBranch, OrganizationDepartment, OrganizationPosition, Employee, EmployeeOrganizationAssignment, User, PostCadre, AuditLog } = m;
let serial = 0;
before(() => sequelize.sync());
after(() => sequelize.close());
async function fixture() {
  const n = ++serial;
  const org = await Organization.create({ code: `STRUCT${n}`, name: 'Bank' });
  const actor = await User.create({ organizationId: org.id, email: `admin${n}@structure.invalid`, name: 'Admin', role: 'ORG_ADMIN', passwordHash: 'unused' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });
  const args = { organizationId: org.id, actor };
  const ho = await s.configureHeadOffice({ ...args, data: { number: '000', code: 'HO', name: 'Head Office' } });
  const branch = await s.createBranch({ ...args, data: { number: '001', branchCode: 'BR1', name: 'Branch' } });
  const department = await s.createDepartment({ ...args, data: { branchId: branch.id, code: 'OPS', name: 'Operations' } });
  const position = await s.createPosition({ ...args, data: { branchId: branch.id, departmentId: department.id, code: 'CLERK', name: 'Clerk' } });
  async function employee() {
    const e = await Employee.create({ organizationId: org.id, postCadreId: post.id, empCode: `E${++serial}`, name: 'Employee', doj: '2020-01-01' });
    const user = await User.create({ organizationId: org.id, employeeId: e.id, email: `employee${serial}@structure.invalid`, name: 'User', role: 'EMPLOYEE', passwordHash: 'unused' });
    return { e, user };
  }
  return { org, actor, args, ho, branch, department, position, employee };
}
const assign = (f, employeeId, data = {}) => s.assignEmployeeOrganization({ ...f.args, data: { employeeId, branchId: f.branch.id, departmentId: f.department.id, positionId: f.position.id, effectiveFrom: todayIST(), ...data } });

test('Head Office requires its explicit initial workflow and cannot be replaced, converted or deactivated', async () => {
  const f = await fixture();
  for (const data of [{ unitType: 'HEAD_OFFICE' }, { isHeadOffice: true }]) await assert.rejects(s.createBranch({ ...f.args, data: { name: 'Accidental HO', code: 'X', number: '002', ...data } }), /Head Office/i);
  await assert.rejects(s.configureHeadOffice({ ...f.args, data: { name: 'Second HO', code: 'X', number: '002' } }), /Head Office/i);
  await assert.rejects(s.updateBranch({ ...f.args, id: f.ho.id, data: { unitType: 'BRANCH' } }), /Head Office/i);
  await assert.rejects(s.deactivateBranch({ ...f.args, id: f.ho.id }), /Head Office/i);
  assert.equal(await OrganizationBranch.count({ where: { organizationId: f.org.id, unitType: 'HEAD_OFFICE', status: 'ACTIVE' } }), 1);
});

test('branch identities are normalized, tenant-local unique, and never authorized by employee text', async () => {
  const f = await fixture();
  await assert.rejects(s.createBranch({ ...f.args, data: { name: 'Duplicate', code: ' br1 ', number: '003' } }), /unique|already|duplicate/i);
  await assert.rejects(s.createBranch({ ...f.args, data: { name: 'Duplicate', code: 'NEW', number: '001' } }), /unique|already|duplicate/i);
  const other = await fixture();
  await assert.rejects(s.updateBranch({ ...f.args, id: other.branch.id, data: { name: 'Cross tenant' } }), /not found/i);
  const { e, user } = await f.employee();
  await e.update({ branchName: f.ho.name, branchCode: f.ho.code });
  await assert.rejects(s.createBranch({ organizationId: f.org.id, actor: user, data: { name: 'Forbidden', code: 'NO', number: '003' } }), /permission|authoriz/i);
});

test('department and position ownership validate active same-tenant identifiers and local uniqueness', async () => {
  const f = await fixture(), other = await fixture();
  await assert.rejects(s.createDepartment({ ...f.args, data: { branchId: other.branch.id, code: 'OPS', name: 'Foreign' } }), /not found/i);
  await assert.rejects(s.createDepartment({ ...f.args, data: { branchId: f.branch.id, code: 'OTHER', name: 'Operations' } }), /unique|already|duplicate/i);
  const hoDept = await s.createDepartment({ ...f.args, data: { branchId: f.ho.id, code: 'OPS', name: 'Operations' } });
  await assert.rejects(s.createPosition({ ...f.args, data: { branchId: f.branch.id, departmentId: hoDept.id, code: 'BAD', name: 'Bad' } }), /department|belong/i);
  const inactive = await s.createBranch({ ...f.args, data: { code: 'OLD', number: '009', name: 'Old' } });
  await s.deactivateBranch({ ...f.args, id: inactive.id });
  await assert.rejects(s.createDepartment({ ...f.args, data: { branchId: inactive.id, code: 'OPS', name: 'Operations' } }), /active/i);
});

test('positions reject cycles, invalid capacity and non-Head-Office leadership', async () => {
  const f = await fixture();
  const child = await s.createPosition({ ...f.args, data: { branchId: f.branch.id, departmentId: f.department.id, code: 'CHILD', name: 'Child', reportsToPositionId: f.position.id } });
  await assert.rejects(s.updatePosition({ ...f.args, id: f.position.id, data: { reportsToPositionId: child.id } }), /cycle/i);
  await assert.rejects(s.updatePosition({ ...f.args, id: f.position.id, data: { reportsToPositionId: f.position.id } }), /cycle/i);
  for (const capacity of [0, -1, 1.5, '2', true]) await assert.rejects(s.updatePosition({ ...f.args, id: f.position.id, data: { capacity } }), /capacity/i);
  await assert.rejects(s.updatePosition({ ...f.args, id: f.position.id, data: { leadershipVisible: true } }), /Head Office/i);
});

test('cross-unit reporting is allowed only to active Head Office leadership and stays valid on updates', async () => {
  const f = await fixture();
  const d = await s.createDepartment({ ...f.args, data: { branchId: f.ho.id, code: 'LEAD', name: 'Leadership' } });
  const p = await s.createPosition({ ...f.args, data: { branchId: f.ho.id, departmentId: d.id, code: 'GM', name: 'GM' } });
  await assert.rejects(s.updatePosition({ ...f.args, id: f.position.id, data: { reportsToPositionId: p.id } }), /Head Office|leadership/i);
  await s.updatePosition({ ...f.args, id: p.id, data: { leadershipVisible: true } });
  await s.updatePosition({ ...f.args, id: f.position.id, data: { reportsToPositionId: p.id } });
  await assert.rejects(s.updatePosition({ ...f.args, id: p.id, data: { leadershipVisible: false } }), /leadership|report/i);
  await assert.rejects(s.deactivatePosition({ ...f.args, id: p.id }), /dependent|report/i);
});

test('assignments enforce inclusive date non-overlap, capacity and identifier ownership', async () => {
  const f = await fixture(); const a = await f.employee(), b = await f.employee();
  await assign(f, a.e.id);
  await assert.rejects(assign(f, b.e.id), /capacity/i);
  await assert.rejects(assign(f, a.e.id), /overlap/i);
  await assert.rejects(assign(f, b.e.id, { effectiveFrom: '2027-02-30' }), /date/i);
  await assert.rejects(assign(f, b.e.id, { effectiveFrom: '2030-01-02', effectiveTo: '2030-01-01' }), /date/i);
  await assert.rejects(assign(f, b.e.id, { branchId: f.ho.id }), /department|belong/i);
  await assert.rejects(s.updatePosition({ ...f.args, id: f.position.id, data: { capacity: 0 } }), /capacity/i);
});

test('deactivation and structural moves refuse current or future active dependents', async () => {
  const f = await fixture(); const { e } = await f.employee();
  await assign(f, e.id, { effectiveFrom: '2040-01-01' });
  await assert.rejects(s.deactivatePosition({ ...f.args, id: f.position.id }), /assignment|dependent/i);
  await assert.rejects(s.deactivateDepartment({ ...f.args, id: f.department.id }), /position|dependent/i);
  await assert.rejects(s.deactivateBranch({ ...f.args, id: f.branch.id }), /department|dependent/i);
  await assert.rejects(s.updateDepartment({ ...f.args, id: f.department.id, data: { branchId: f.ho.id } }), /dependent|position/i);
});

test('responsibilities use controlled codes, explicit scope and linked same-tenant employee/user', async () => {
  const f = await fixture(); const a = await f.employee(), b = await f.employee();
  const data = { employeeId: a.e.id, userId: a.user.id, responsibility: 'BRANCH_MANAGER', scopeType: 'BRANCH', branchId: f.branch.id, effectiveFrom: todayIST() };
  for (const patch of [{ responsibility: 'GM' }, { scopeType: 'ORGANISATION', branchId: null }, { branchId: null }, { userId: b.user.id }]) await assert.rejects(s.assignResponsibility({ ...f.args, data: { ...data, ...patch } }), /responsibility|scope|branch|employee|link/i);
  await s.assignResponsibility({ ...f.args, data });
  assert.equal((await s.currentResponsibility({ organizationId: f.org.id, employeeId: a.e.id, responsibility: 'BRANCH_MANAGER' })).id != null, true);
  await assert.rejects(s.assignResponsibility({ ...f.args, data: { ...data, employeeId: b.e.id, userId: b.user.id } }), /overlap|already/i);
  await s.assignResponsibility({ ...f.args, data: { employeeId: b.e.id, userId: b.user.id, responsibility: 'GENERAL_MANAGER', scopeType: 'ORGANISATION', effectiveFrom: todayIST() } });
});

test('current assignments synchronize compatibility fields and invalidate linked access exactly once', async () => {
  const f = await fixture(); const { e, user } = await f.employee();
  await assign(f, e.id);
  await e.reload(); await user.reload();
  assert.deepEqual([e.branchId, e.departmentId, e.positionId, e.branchName, e.branchCode, e.department, e.designation], [f.branch.id, f.department.id, f.position.id, f.branch.name, f.branch.code, f.department.name, f.position.name]);
  assert.equal(user.accessVersion, 1);
  await s.reconcileEffectiveAssignments({ organizationId: f.org.id });
  await s.reconcileEffectiveAssignments({ organizationId: f.org.id });
  assert.equal((await user.reload()).accessVersion, 1);
  assert.equal(await AuditLog.count({ where: { organizationId: f.org.id, action: 'user.access.invalidate', targetId: String(user.id) } }), 1);
  assert.equal((await f.org.reload()).accessControlMode, 'LEGACY');
});

test('scheduled assignments reconcile only when effective, close old current pointers, and rerun idempotently', async () => {
  const f = await fixture(); const { e, user } = await f.employee();
  await assign(f, e.id, { effectiveFrom: '2040-01-01', effectiveTo: '2040-12-31' });
  assert.equal((await e.reload()).branchId, null); assert.equal((await user.reload()).accessVersion, 0);
  await s.reconcileEffectiveAssignments({ organizationId: f.org.id, at: '2040-01-01' });
  assert.equal((await e.reload()).positionId, f.position.id); assert.equal((await user.reload()).accessVersion, 1);
  await s.reconcileEffectiveAssignments({ organizationId: f.org.id, at: '2040-01-01' });
  assert.equal((await user.reload()).accessVersion, 1);
  await s.reconcileEffectiveAssignments({ organizationId: f.org.id, at: '2041-01-01' });
  assert.equal((await e.reload()).branchId, null); assert.equal((await user.reload()).accessVersion, 2);
});

test('caller rollback restores structure, assignments, compatibility pointers, invalidation and audit', async () => {
  const f = await fixture(); const { e, user } = await f.employee(); const logs = await AuditLog.count();
  await assert.rejects(sequelize.transaction(async transaction => {
    await assign({ ...f, args: { ...f.args, transaction } }, e.id);
    throw new Error('abort structure');
  }), /abort structure/);
  assert.equal(await EmployeeOrganizationAssignment.count({ where: { employeeId: e.id } }), 0);
  assert.equal((await e.reload()).branchId, null); assert.equal((await user.reload()).accessVersion, 0); assert.equal(await AuditLog.count(), logs);
});

test('future and partially resolved assignments preserve unmapped legacy labels without guessing IDs', async () => {
  const f = await fixture(); const { e } = await f.employee();
  await e.update({ branchName: 'Legacy unit', branchCode: 'LEGACY', department: 'Unresolved department', designation: 'Unresolved title' });
  await assign(f, e.id, { departmentId: null, positionId: null, effectiveFrom: '2040-01-01' });
  await e.reload();
  assert.equal(e.branchName, 'Legacy unit'); assert.equal(e.department, 'Unresolved department'); assert.equal(e.designation, 'Unresolved title');
  await s.reconcileEffectiveAssignments({ organizationId: f.org.id, at: '2040-01-01' });
  await e.reload();
  assert.equal(e.branchName, f.branch.name); assert.equal(e.branchId, f.branch.id);
  assert.equal(e.departmentId, null); assert.equal(e.positionId, null);
  assert.equal(e.department, 'Unresolved department'); assert.equal(e.designation, 'Unresolved title');
});

test('responsibility dates are live and never imply a system-role grant or unnecessary invalidation', async () => {
  const f = await fixture(); const { e, user } = await f.employee();
  await s.assignResponsibility({ ...f.args, data: { employeeId: e.id, userId: user.id, responsibility: 'SENIOR_MANAGER', scopeType: 'ORGANISATION', effectiveFrom: '2040-01-01', effectiveTo: '2040-12-31' } });
  assert.equal(await s.currentResponsibility({ organizationId: f.org.id, employeeId: e.id, at: '2039-12-31' }), null);
  assert.ok(await s.currentResponsibility({ organizationId: f.org.id, employeeId: e.id, at: '2040-01-01' }));
  await s.reconcileEffectiveAssignments({ organizationId: f.org.id, at: '2040-01-01' });
  await s.reconcileEffectiveAssignments({ organizationId: f.org.id, at: '2040-01-01' });
  assert.equal((await user.reload()).accessVersion, 0);
  assert.equal(await m.UserRoleAssignment.count({ where: { userId: user.id } }), 0);
  assert.equal(await s.currentResponsibility({ organizationId: f.org.id, employeeId: e.id, at: '2041-01-01' }), null);
});

test('scheduled capacity counts inclusive boundaries and lowering capacity respects future occupants', async () => {
  const f = await fixture(); const a = await f.employee(), b = await f.employee();
  await assign(f, a.e.id, { effectiveFrom: '2040-01-01', effectiveTo: '2040-01-31' });
  await assert.rejects(assign(f, b.e.id, { effectiveFrom: '2040-01-31', effectiveTo: '2040-02-28' }), /capacity/i);
  await assign(f, b.e.id, { effectiveFrom: '2040-02-01', effectiveTo: '2040-02-28' });
  await s.updatePosition({ ...f.args, id: f.position.id, data: { capacity: 2 } });
  const c = await f.employee();
  await assign(f, c.e.id, { effectiveFrom: '2040-01-15', effectiveTo: '2040-02-15' });
  await assert.rejects(s.updatePosition({ ...f.args, id: f.position.id, data: { capacity: 1 } }), /capacity/i);
});

test('branch deactivation blocks responsibilities and an empty structure can deactivate safely', async () => {
  const f = await fixture(); const { e } = await f.employee();
  const empty = await s.createBranch({ ...f.args, data: { code: 'EMPTY', number: '007', name: 'Empty' } });
  await s.assignResponsibility({ ...f.args, data: { employeeId: e.id, responsibility: 'BRANCH_MANAGER', scopeType: 'BRANCH', branchId: empty.id, effectiveFrom: '2040-01-01' } });
  await assert.rejects(s.deactivateBranch({ ...f.args, id: empty.id }), /responsibilit/i);
  await s.deactivatePosition({ ...f.args, id: f.position.id });
  await s.deactivateDepartment({ ...f.args, id: f.department.id });
  await s.deactivateBranch({ ...f.args, id: f.branch.id });
  assert.equal((await f.branch.reload()).status, 'INACTIVE');
});

test('deactivating a selected branch invalidates only users whose effective access changed', async () => {
  const f = await fixture(); const { user } = await f.employee();
  const empty = await s.createBranch({ ...f.args, data: { code: 'EMPTY', number: '007', name: 'Empty' } });
  await require('../src/services/accessBootstrap').bootstrapOrganizationAccess({ organizationId: f.org.id });
  const role = await m.OrganizationRole.create({ organizationId: f.org.id, code: 'SCOPED_HR', name: 'Scoped HR', templateCode: 'HR_OFFICER' });
  await m.OrganizationRolePermission.create({ organizationId: f.org.id, roleId: role.id, permissionCode: 'people.view' });
  const assignment = await m.UserRoleAssignment.create({ organizationId: f.org.id, userId: user.id, roleId: role.id, scopeType: 'SELECTED_BRANCHES', effectiveFrom: todayIST() });
  await m.UserRoleBranch.create({ organizationId: f.org.id, userRoleAssignmentId: assignment.id, branchId: empty.id });
  await f.org.update({ accessControlMode: 'PERMISSIONS' });
  await s.deactivateBranch({ ...f.args, id: empty.id });
  assert.equal((await user.reload()).accessVersion, 1);
  assert.equal((await f.actor.reload()).accessVersion, 0);
  await s.deactivateBranch({ ...f.args, id: empty.id });
  assert.equal((await user.reload()).accessVersion, 1);
});

test('ended occupancy peaks do not block later assignments after a capacity reduction', async () => {
  const f = await fixture();
  const a = await f.employee(), b = await f.employee(), current = await f.employee(), extra = await f.employee();
  await s.updatePosition({ ...f.args, id: f.position.id, data: { capacity: 2 } });
  const history = { effectiveFrom: '2020-01-01', effectiveTo: '2020-12-31' };
  await assign(f, a.e.id, history);
  await assign(f, b.e.id, history);
  await s.updatePosition({ ...f.args, id: f.position.id, data: { capacity: 1 } });
  await assign(f, current.e.id);
  assert.equal((await current.e.reload()).positionId, f.position.id);
  await assert.rejects(assign(f, extra.e.id), /capacity/i);
  assert.equal(await EmployeeOrganizationAssignment.count({ where: { organizationId: f.org.id, positionId: f.position.id, status: 'ACTIVE' } }), 3);
});
