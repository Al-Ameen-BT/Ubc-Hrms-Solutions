'use strict';
process.env.DB_DIALECT = 'sqlite'; process.env.DB_STORAGE = ':memory:'; process.env.JWT_SECRET = 'permission-onboarding-position-test-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../src/models');
const structure = require('../src/services/organizationStructure');
const { effectiveAccess } = require('../src/services/accessControl');

let serial = 0;
before(async () => { await m.sequelize.sync(); });
after(async () => { await m.sequelize.close(); });

async function fixture(templateCode = 'HR_OFFICER', scopeType = 'SELECTED_BRANCHES') {
  const n = ++serial;
  const org = await m.Organization.create({ code: `OP${n}`, name: 'Onboarding Bank', accessControlMode: 'PERMISSIONS' });
  const post = await m.PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });
  const branches = await Promise.all(['A', 'B'].map(code => m.OrganizationBranch.create({ organizationId: org.id, code, name: `Branch ${code}` })));
  const departments = await Promise.all(branches.map((branch, index) => m.OrganizationDepartment.create({ organizationId: org.id, branchId: branch.id, code: 'OPS', name: `Department ${index ? 'B' : 'A'}` })));
  const positions = await Promise.all(branches.map((branch, index) => m.OrganizationPosition.create({ organizationId: org.id, branchId: branch.id, departmentId: departments[index].id, code: 'CLERK', name: `Clerk ${index ? 'B' : 'A'}`, postCadreId: post.id })));
  const noPostPosition = await m.OrganizationPosition.create({ organizationId: org.id, branchId: branches[0].id, departmentId: departments[0].id, code: 'NOPOST', name: 'Unmapped post', postCadreId: null });
  const inactivePosition = await m.OrganizationPosition.create({ organizationId: org.id, branchId: branches[0].id, departmentId: departments[0].id, code: 'INACTIVE', name: 'Inactive position', postCadreId: post.id, status: 'INACTIVE' });
  const actorEmployee = await m.Employee.create({ organizationId: org.id, empCode: `ACTOR${n}`, name: 'HR actor', doj: '2020-01-01', postCadreId: post.id });
  const actor = await m.User.create({ organizationId: org.id, employeeId: actorEmployee.id, name: 'HR actor', email: `hr${n}@onboarding.invalid`, passwordHash: 'unused', role: templateCode });
  const role = await m.OrganizationRole.create({ organizationId: org.id, code: `PEOPLE${n}`, name: 'People creator', templateCode });
  await m.OrganizationRolePermission.create({ organizationId: org.id, roleId: role.id, permissionCode: 'people.create' });
  const assignment = await m.UserRoleAssignment.create({ organizationId: org.id, userId: actor.id, roleId: role.id, scopeType, effectiveFrom: '2020-01-01' });
  if (scopeType === 'SELECTED_BRANCHES') await m.UserRoleBranch.create({ organizationId: org.id, userRoleAssignmentId: assignment.id, branchId: branches[0].id });
  return { org, post, branches, departments, positions, noPostPosition, inactivePosition, actor };
}

async function exactHelperPayload(form, assignment) {
  const { buildEmployeeCreatePayload } = await import('../frontend/src/features/employees/employeeOnboarding.js');
  return buildEmployeeCreatePayload(form, { permissionMode: true, catalogueBank: false, organizationAssignment: assignment });
}

function employeeForm(empCode) {
  return {
    empCode, name: 'New employee', dob: '1990-01-02', doj: '2026-11-17', gender: 'FEMALE', category: 'GENERAL',
    panNumber: 'AAAAA1234A', aadhaarNumber: '123412341234', personalEmail: `${empCode.toLowerCase()}@staff.invalid`, directPay: false,
  };
}

async function onboard(f, empCode, assignment, overrides = {}) {
  const payload = await exactHelperPayload(employeeForm(empCode), assignment);
  const { organizationAssignment, ...data } = payload;
  return structure.onboardEmployee({ organizationId: f.org.id, actor: f.actor, data: { ...data, ...overrides }, organizationAssignment });
}

test('permissions onboarding derives required post and designation from the selected active position', async () => {
  const f = await fixture();
  const payload = await exactHelperPayload(employeeForm('NEW1'), { branchId: f.branches[0].id, departmentId: f.departments[0].id, positionId: f.positions[0].id, effectiveFrom: '2026-11-17' });
  assert.equal(Object.hasOwn(payload, 'postCadreId'), false);
  assert.equal(Object.hasOwn(payload, 'designation'), false);
  const { organizationAssignment, ...data } = payload;
  const created = await structure.onboardEmployee({ organizationId: f.org.id, actor: f.actor, data, organizationAssignment });
  assert.equal(created.postCadreId, f.post.id);
  assert.equal(created.designation, f.positions[0].name);
  const assignment = await m.EmployeeOrganizationAssignment.findOne({ where: { organizationId: f.org.id, employeeId: created.id } });
  assert.deepEqual([assignment.branchId, assignment.departmentId, assignment.positionId], [f.branches[0].id, f.departments[0].id, f.positions[0].id]);
});

test('permissions onboarding rejects missing or mismatched positions before creating an employee', async () => {
  const f = await fixture();
  const before = await m.Employee.count({ where: { organizationId: f.org.id } });
  await assert.rejects(onboard(f, 'NOPOS1', { branchId: f.branches[0].id, departmentId: f.departments[0].id, effectiveFrom: '2026-11-17' }), /position/i);
  await assert.rejects(onboard(f, 'MISMATCH1', { branchId: f.branches[0].id, departmentId: f.departments[0].id, positionId: f.positions[1].id, effectiveFrom: '2026-11-17' }), /position.*belong/i);
  assert.equal(await m.Employee.count({ where: { organizationId: f.org.id } }), before);
});

test('permissions onboarding rejects positions outside the caller branch scope', async () => {
  const f = await fixture();
  const before = await m.Employee.count({ where: { organizationId: f.org.id } });
  await assert.rejects(onboard(f, 'OUTSCOPE1', { branchId: f.branches[1].id, departmentId: f.departments[1].id, positionId: f.positions[1].id, effectiveFrom: '2026-11-17' }), error => error.status === 403);
  assert.equal(await m.Employee.count({ where: { organizationId: f.org.id } }), before);
});

test('permissions onboarding rejects inactive positions and positions without an authoritative post', async () => {
  const f = await fixture();
  const before = await m.Employee.count({ where: { organizationId: f.org.id } });
  const destination = { branchId: f.branches[0].id, departmentId: f.departments[0].id, effectiveFrom: '2026-11-17' };
  await assert.rejects(onboard(f, 'INACTIVE1', { ...destination, positionId: f.inactivePosition.id }), /must be active/i);
  await assert.rejects(onboard(f, 'NOPOST1', { ...destination, positionId: f.noPostPosition.id }), /post.*cadre/i);
  assert.equal(await m.Employee.count({ where: { organizationId: f.org.id } }), before);
});

test('permissions onboarding rejects client attempts to override position-derived fields', async () => {
  const f = await fixture();
  const destination = { branchId: f.branches[0].id, departmentId: f.departments[0].id, positionId: f.positions[0].id, effectiveFrom: '2026-11-17' };
  const before = await m.Employee.count({ where: { organizationId: f.org.id } });
  await assert.rejects(onboard(f, 'OVRDES1', destination, { designation: 'Client supplied title' }), /derived from the selected position/i);
  await assert.rejects(onboard(f, 'OVRPOST1', destination, { postCadreId: f.post.id }), /derived from the selected position/i);
  assert.equal(await m.Employee.count({ where: { organizationId: f.org.id } }), before);
});

test('people creators receive only active post-backed positions in their effective organization and branch scope', async () => {
  const officer = await fixture('HR_OFFICER', 'SELECTED_BRANCHES');
  assert.equal(typeof structure.onboardingPositionOptions, 'function', 'people.create position reader is available');
  const officerAccess = await effectiveAccess(officer.actor.id, '2026-11-17');
  assert.equal(officerAccess.permissionCodes.includes('positions.view'), false);
  const branchRows = await structure.onboardingPositionOptions(officerAccess, { branchId: officer.branches[0].id });
  assert.deepEqual(branchRows, [{ id: officer.positions[0].id, branchId: officer.branches[0].id, departmentId: officer.departments[0].id, postCadreId: officer.post.id, name: 'Clerk A', status: 'ACTIVE' }]);
  assert.deepEqual(await structure.onboardingPositionOptions(officerAccess, { branchId: officer.branches[1].id }), []);
  assert.deepEqual(await structure.onboardingPositionOptions(officerAccess, { branchId: officer.branches[0].id, departmentId: officer.departments[1].id }), []);

  const admin = await fixture('HR_ADMIN', 'ORGANISATION');
  const adminAccess = await effectiveAccess(admin.actor.id, '2026-11-17');
  assert.equal(adminAccess.permissionCodes.includes('positions.view'), false);
  assert.deepEqual((await structure.onboardingPositionOptions(adminAccess)).map(row => row.id), admin.positions.map(row => row.id));
});
