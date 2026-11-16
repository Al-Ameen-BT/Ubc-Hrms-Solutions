'use strict';
process.env.DB_DIALECT = 'sqlite'; process.env.DB_STORAGE = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../src/models');
const leave = require('../src/services/leave');
let n = 0;
before(() => m.sequelize.sync()); after(() => m.sequelize.close());
async function fixture(requesterResponsibility) {
  const org = await m.Organization.create({ code: `LR${++n}`, name: 'Leave bank', accessControlMode: 'PERMISSIONS' });
  const branch = await m.OrganizationBranch.create({ organizationId: org.id, code: 'A', name: 'A' });
  const other = await m.OrganizationBranch.create({ organizationId: org.id, code: 'B', name: 'B' });
  const post = await m.PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });
  async function person(name, responsibility, scopeBranch = branch) {
    const employee = await m.Employee.create({ organizationId: org.id, empCode: name, name, postCadreId: post.id, doj: '2020-01-01', branchId: scopeBranch.id });
    await m.EmployeeOrganizationAssignment.create({ organizationId: org.id, employeeId: employee.id, branchId: scopeBranch.id, effectiveFrom: '2026-01-01' });
    const user = await m.User.create({ organizationId: org.id, employeeId: employee.id, name, email: `${name}${n}@leave.invalid`, role: 'EMPLOYEE', passwordHash: 'unused' });
    if (responsibility) {
      const role = await m.OrganizationRole.create({ organizationId: org.id, code: `R${name}`, name, templateCode: 'HR_ADMIN' });
      await m.OrganizationRolePermission.create({ organizationId: org.id, roleId: role.id, permissionCode: 'leave.approve' });
      await m.UserRoleAssignment.create({ organizationId: org.id, userId: user.id, roleId: role.id, scopeType: 'ORGANISATION', effectiveFrom: '2026-01-01' });
      await m.OrganizationResponsibilityAssignment.create({ organizationId: org.id, employeeId: employee.id, userId: user.id, responsibility, scopeType: responsibility === 'BRANCH_MANAGER' ? 'BRANCH' : 'ORGANISATION', branchId: responsibility === 'BRANCH_MANAGER' ? scopeBranch.id : null, effectiveFrom: '2026-01-01' });
    }
    return { employee, user };
  }
  const requester = await person('Requester', requesterResponsibility);
  const manager = await person('Manager', 'BRANCH_MANAGER');
  const senior = await person('Senior', 'SENIOR_MANAGER');
  const general = await person('General', 'GENERAL_MANAGER');
  const type = await m.LeaveType.create({ organizationId: org.id, code: 'CL', name: 'Casual', accrualMethod: 'NONE', requiresApproval: true });
  const apply = () => leave.applyLeave(requester.employee, { leaveTypeId: type.id, fromDate: '2026-11-20', toDate: '2026-11-20' }, requester.user.id);
  return { org, branch, other, person, requester, manager, senior, general, type, apply };
}
test('default leave path stores manager, senior and general responsibility holders without designation matching', async () => {
  for (const [responsibility, selected] of [[null, 'manager'], ['BRANCH_MANAGER', 'senior'], ['SENIOR_MANAGER', 'general']]) {
    const f = await fixture(responsibility);
    const request = await f.apply();
    assert.equal(request.selectedApproverUserId, f[selected].user.id);
    assert.equal(request.status, 'PENDING');
    await leave.decideLeave(request, 'APPROVED', f[selected].user.id);
    assert.equal(request.decidedBy, f[selected].user.id);
  }
});
test('leave routing fails closed for missing, ambiguous and foreign-branch managers', async () => {
  const f = await fixture();
  await m.OrganizationResponsibilityAssignment.update({ branchId: f.other.id }, { where: { employeeId: f.manager.employee.id } });
  await assert.rejects(f.apply(), /approver/i);
  await m.OrganizationResponsibilityAssignment.update({ branchId: f.branch.id }, { where: { employeeId: f.manager.employee.id } });
  await f.person('SecondManager', 'BRANCH_MANAGER');
  await assert.rejects(f.apply(), /approver/i);
  assert.equal(await m.LeaveApplication.count({ where: { employeeId: f.requester.employee.id } }), 0);
});
test('only the stored holder can decide and responsibility changes never silently reroute pending leave', async () => {
  const f = await fixture(), request = await f.apply();
  await assert.rejects(leave.decideLeave(request, 'APPROVED', f.senior.user.id), { status: 403 });
  await assert.rejects(leave.decideLeave(request, 'APPROVED', f.requester.user.id), { status: 403 });
  await m.OrganizationResponsibilityAssignment.update({ status: 'INACTIVE' }, { where: { employeeId: f.manager.employee.id } });
  const replacement = await f.person('Replacement', 'BRANCH_MANAGER');
  await assert.rejects(leave.decideLeave(request, 'APPROVED', replacement.user.id), { status: 403 });
  await leave.decideLeave(request, 'APPROVED', f.manager.user.id);
  assert.equal(request.selectedApproverUserId, f.manager.user.id);
  assert.equal(request.decidedBy, f.manager.user.id);
});
test('inactive selected holders fail closed without rerouting', async () => {
  const f = await fixture(), request = await f.apply();
  await f.manager.user.update({ status: 'INACTIVE' });
  await assert.rejects(leave.decideLeave(request, 'APPROVED', f.manager.user.id), { status: 403 });
  await request.reload(); assert.equal(request.status, 'PENDING');
});
