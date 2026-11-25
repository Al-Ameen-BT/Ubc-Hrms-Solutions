'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');

let lifecycle;

before(async () => {
  lifecycle = require('../src/services/organizationLifecycle');
  await models.sequelize.sync();
});

beforeEach(async () => {
  await models.sequelize.truncate({ cascade: true });
});

after(async () => {
  await models.sequelize.close();
});

async function fixture() {
  const organization = await models.Organization.create({ code: 'LIFE', name: 'Lifecycle Bank' });
  const post = await models.PostCadre.create({ organizationId: organization.id, code: 'CLERK', name: 'Clerk' });
  const source = await models.OrganizationBranch.create({ organizationId: organization.id, number: '001', code: 'SRC', name: 'Source Branch', unitType: 'BRANCH' });
  const target = await models.OrganizationBranch.create({ organizationId: organization.id, number: '002', code: 'DST', name: 'Destination Branch', unitType: 'BRANCH' });
  const department = await models.OrganizationDepartment.create({ organizationId: organization.id, branchId: source.id, code: 'OPS', name: 'Operations' });
  const position = await models.OrganizationPosition.create({ organizationId: organization.id, branchId: source.id, departmentId: department.id, code: 'CLERK', name: 'Clerk', postCadreId: post.id });
  const employee = await models.Employee.create({ organizationId: organization.id, empCode: 'E001', name: 'Employee One', doj: '2020-01-01', postCadreId: post.id, branchId: source.id, departmentId: department.id, positionId: position.id });
  const actor = await models.User.create({ organizationId: organization.id, employeeId: employee.id, email: 'admin@life.invalid', name: 'Admin', role: 'ORG_ADMIN', passwordHash: 'unused' });
  const worker = await models.Employee.create({ organizationId: organization.id, empCode: 'E002', name: 'Employee Two', doj: '2021-01-01', postCadreId: post.id, branchId: source.id, departmentId: department.id, positionId: position.id });
  const user = await models.User.create({ organizationId: organization.id, employeeId: worker.id, email: 'employee@life.invalid', name: 'Employee Account', role: 'EMPLOYEE', passwordHash: 'unused' });
  const role = await models.OrganizationRole.create({ organizationId: organization.id, code: 'EMPLOYEE', name: 'Employee', templateCode: 'EMPLOYEE', isProtected: true });
  const assignment = await models.UserRoleAssignment.create({ organizationId: organization.id, userId: user.id, roleId: role.id, scopeType: 'OWN', effectiveFrom: '2026-01-01', assignedBy: actor.id });
  await models.EmployeeOrganizationAssignment.create({ organizationId: organization.id, employeeId: worker.id, branchId: source.id, departmentId: department.id, positionId: position.id, effectiveFrom: '2026-01-01', assignedBy: actor.id });
  return { organization, post, source, target, department, position, employee, actor, worker, user, role, assignment };
}

test('archiveEmployee keeps identity and audit history while ending linked access', async () => {
  const f = await fixture();
  await lifecycle.archiveEmployee({ organizationId: f.organization.id, actor: f.actor, employeeId: f.worker.id });

  assert.equal((await f.worker.reload()).status, 'INACTIVE');
  assert.equal((await f.user.reload()).status, 'INACTIVE');
  assert.equal((await f.assignment.reload()).status, 'INACTIVE');
  assert.ok(await models.Employee.findByPk(f.worker.id), 'employee identity must remain addressable');
  assert.ok(await models.User.findByPk(f.user.id), 'user identity must remain addressable');
  assert.equal(await models.AuditLog.count({ where: { organizationId: f.organization.id, action: 'employee.archive', targetId: String(f.worker.id) } }), 1);
});

test('archiveDepartment clears current placement but preserves branch and assignment history', async () => {
  const f = await fixture();
  const result = await lifecycle.archiveDepartment({ organizationId: f.organization.id, actor: f.actor, departmentId: f.department.id, effectiveDate: '2026-11-25' });

  const employee = await f.worker.reload();
  assert.equal(employee.branchId, f.source.id);
  assert.equal(employee.departmentId, null);
  assert.equal(employee.positionId, null);
  assert.equal((await f.department.reload()).status, 'INACTIVE');
  assert.equal((await f.position.reload()).status, 'INACTIVE');
  assert.equal(result.movedEmployees, 1);
  assert.equal(await models.EmployeeOrganizationAssignment.count({ where: { employeeId: f.worker.id } }), 2);
});

test('mergeBranch moves people and explicit role scope, then archives the source branch', async () => {
  const f = await fixture();
  const supervisor = await models.OrganizationPosition.create({ organizationId: f.organization.id, branchId: f.source.id, departmentId: f.department.id, code: 'SUP', name: 'Supervisor', postCadreId: f.post.id, capacity: 2 });
  await f.position.update({ reportsToPositionId: supervisor.id });
  const scopedRole = await models.OrganizationRole.create({ organizationId: f.organization.id, code: 'BRANCH_MANAGER', name: 'Branch Manager', templateCode: 'BRANCH_MANAGER' });
  const scopedAssignment = await models.UserRoleAssignment.create({ organizationId: f.organization.id, userId: f.user.id, roleId: scopedRole.id, scopeType: 'SELECTED_BRANCHES', effectiveFrom: '2026-01-01', assignedBy: f.actor.id });
  const scope = await models.UserRoleBranch.create({ organizationId: f.organization.id, userRoleAssignmentId: scopedAssignment.id, branchId: f.source.id });

  const preview = await lifecycle.previewBranchMerge({ organizationId: f.organization.id, actor: f.actor, sourceBranchId: f.source.id, destinationBranchId: f.target.id });
  assert.equal(preview.counts.employees, 1);
  assert.equal(preview.conflicts.departments.length, 0);

  await lifecycle.mergeBranch({ organizationId: f.organization.id, actor: f.actor, sourceBranchId: f.source.id, destinationBranchId: f.target.id, departmentMappings: {}, positionMappings: {}, geofenceAction: 'ARCHIVE', effectiveDate: '2026-11-25' });

  assert.equal((await f.source.reload()).status, 'INACTIVE');
  assert.equal((await f.worker.reload()).branchId, f.target.id);
  assert.equal((await scope.reload()).branchId, f.target.id);
  const movedClerk = await models.OrganizationPosition.findOne({ where: { organizationId: f.organization.id, branchId: f.target.id, code: 'CLERK' } });
  const movedSupervisor = await models.OrganizationPosition.findOne({ where: { organizationId: f.organization.id, branchId: f.target.id, code: 'SUP' } });
  assert.equal(movedClerk.reportsToPositionId, movedSupervisor.id, 'merged positions must retain their reporting line');
  const audit = await models.AuditLog.findOne({ where: { action: 'org.branch.merge', targetId: String(f.source.id) } });
  assert.equal(audit.details.roleScopeChanges[0].fromId, f.source.id);
  assert.equal(audit.details.roleScopeChanges[0].toId, f.target.id);
});

test('retiring to standalone creates a protected holding placement', async () => {
  const f = await fixture();
  await lifecycle.retireBranch({ organizationId: f.organization.id, actor: f.actor, branchId: f.source.id, useStandalone: true, effectiveDate: '2026-11-25' });
  const holding = await models.OrganizationBranch.findOne({ where: { organizationId: f.organization.id, code: '__STANDALONE__' } });
  assert.ok(holding);
  const employee = await f.worker.reload();
  assert.equal(employee.branchId, holding.id);
  assert.equal(employee.departmentId, null);
});

test('archiveUser is idempotent and never physically deletes the account', async () => {
  const f = await fixture();
  await lifecycle.archiveUser({ organizationId: f.organization.id, actor: f.actor, userId: f.user.id });
  await lifecycle.archiveUser({ organizationId: f.organization.id, actor: f.actor, userId: f.user.id });
  assert.ok(await models.User.findByPk(f.user.id));
  assert.equal((await f.user.reload()).status, 'INACTIVE');
  assert.equal(await models.AuditLog.count({ where: { action: 'user.archive', targetId: String(f.user.id) } }), 1);
});

test('archiving a previously disabled user also ends any remaining role assignments', async () => {
  const f = await fixture();
  await f.user.update({ status: 'INACTIVE' });
  await lifecycle.archiveUser({ organizationId: f.organization.id, actor: f.actor, userId: f.user.id });
  assert.equal((await f.assignment.reload()).status, 'INACTIVE');
  assert.equal(await models.AuditLog.count({ where: { action: 'user.archive', targetId: String(f.user.id) } }), 1);
});

test('a platform administrator can archive an organisation user through the guarded tenant route', async () => {
  const f = await fixture();
  const platform = await models.User.create({ email: 'platform@life.invalid', name: 'Platform Admin', role: 'SUPER_ADMIN', passwordHash: 'unused' });
  await lifecycle.archiveUser({ organizationId: f.organization.id, actor: platform, userId: f.user.id });
  assert.equal((await f.user.reload()).status, 'INACTIVE');
});

test('bootstrap handover archives the bootstrap account only after successor acceptance', async () => {
  const organization = await models.Organization.create({ code: 'HAND', name: 'Handover Bank' });
  const post = await models.PostCadre.create({ organizationId: organization.id, code: 'CLERK', name: 'Clerk' });
  const bootstrap = await models.User.create({ organizationId: organization.id, email: 'bootstrap@hand.invalid', name: 'Bootstrap', role: 'ORG_ADMIN', passwordHash: 'unused' });
  const employee = await models.Employee.create({ organizationId: organization.id, empCode: 'H001', name: 'Successor', doj: '2020-01-01', postCadreId: post.id });
  const successor = await models.User.create({ organizationId: organization.id, employeeId: employee.id, email: 'successor@hand.invalid', name: 'Successor', role: 'EMPLOYEE', passwordHash: 'unused' });
  const adminRole = await models.OrganizationRole.create({ organizationId: organization.id, code: 'ORGANISATION_ADMIN', name: 'Organisation Admin', templateCode: 'ORGANISATION_ADMIN', isProtected: true });
  await models.UserRoleAssignment.create({ organizationId: organization.id, userId: bootstrap.id, roleId: adminRole.id, scopeType: 'ORGANISATION', effectiveFrom: '2026-01-01', assignedBy: bootstrap.id });

  const pending = await lifecycle.beginBootstrapHandover({ organizationId: organization.id, actor: bootstrap, successorUserId: successor.id });
  assert.equal(pending.status, 'PENDING');
  assert.equal((await bootstrap.reload()).status, 'ACTIVE');

  await lifecycle.acceptBootstrapHandover({ organizationId: organization.id, actor: successor, handoverId: pending.id });
  assert.equal((await bootstrap.reload()).status, 'INACTIVE');
  assert.equal((await successor.reload()).role, 'ORG_ADMIN');
  assert.equal(await models.UserRoleAssignment.count({ where: { organizationId: organization.id, userId: successor.id, roleId: adminRole.id, status: 'ACTIVE' } }), 1);
});
