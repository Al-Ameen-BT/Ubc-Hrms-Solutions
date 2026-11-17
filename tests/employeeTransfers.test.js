'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = `/tmp/hrms-transfers-${process.pid}.sqlite`;
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const m = require('../src/models');
const s = require('../src/services/employeeTransfers');
const salary = require('../src/services/compensationAssignments');
const { todayIST } = require('../src/services/orgAccess');
const { sequelize, Organization, OrganizationBranch: Branch, OrganizationDepartment: Department, OrganizationPosition: Position,
  Employee, PostCadre, User, EmployeeOrganizationAssignment: Assignment, EmployeeCompensationAssignment: Compensation,
  OrganizationRole: Role, UserRoleAssignment: RoleAssignment, UserRoleBranch, AuditLog, EmployeeTransfer: Transfer } = m;
let serial = 0;
before(() => sequelize.sync());
after(async () => { await sequelize.close(); fs.rmSync(process.env.DB_STORAGE, { force: true }); });
async function fixture() {
  const n = ++serial;
  const org = await Organization.create({ code: `TR${n}`, name: 'Transfer Bank', bankClass: 'CLASS_I' });
  const admin = await User.create({ organizationId: org.id, name: 'Admin', email: `a${n}@transfer.invalid`, passwordHash: 'unused', role: 'ORG_ADMIN' });
  const approver = await User.create({ organizationId: org.id, name: 'Approver', email: `p${n}@transfer.invalid`, passwordHash: 'unused', role: 'APPROVING_AUTHORITY' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });
  const oldBranch = await Branch.create({ organizationId: org.id, code: 'OLD', name: 'Old', number: '01' });
  const branch = await Branch.create({ organizationId: org.id, code: 'NEW', name: 'New', number: '02' });
  const department = await Department.create({ organizationId: org.id, branchId: branch.id, code: 'OPS', name: 'Operations' });
  const position = await Position.create({ organizationId: org.id, branchId: branch.id, departmentId: department.id, code: 'CLERK', name: 'Clerk', capacity: 1 });
  const catalogue = await m.BankRuleCatalogue.create({ name: 'Published', bankClass: 'CLASS_I', status: 'PUBLISHED', effectiveDate: '2020-01-01', posts: [{ code: 'CLERK', name: 'Clerk', stages: [10000, 11000] }], rules: [], payrollDefaults: {}, createdByUserId: admin.id });
  await m.OrganizationCatalogueAdoption.create({ organizationId: org.id, catalogueId: catalogue.id, effectiveDate: '2020-01-01', preparedBy: admin.id, decidedBy: approver.id, status: 'APPROVED' });
  const role = await Role.create({ organizationId: org.id, code: 'BM', name: 'Manager', templateCode: 'BRANCH_MANAGER' });
  async function worker() {
    const i = ++serial;
    const employee = await Employee.create({ organizationId: org.id, postCadreId: post.id, empCode: `E${i}`, name: 'Employee', doj: '2020-01-01', currentBasicPay: 9000, branchId: oldBranch.id });
    const user = await User.create({ organizationId: org.id, employeeId: employee.id, name: 'Worker', email: `e${i}@transfer.invalid`, passwordHash: 'unused', role: 'EMPLOYEE' });
    const old = await Assignment.create({ organizationId: org.id, employeeId: employee.id, branchId: oldBranch.id, effectiveFrom: '2020-01-01', assignedBy: admin.id });
    const oldRole = await RoleAssignment.create({ organizationId: org.id, userId: user.id, roleId: role.id, scopeType: 'SELECTED_BRANCHES', effectiveFrom: '2020-01-01' });
    await UserRoleBranch.create({ organizationId: org.id, userRoleAssignmentId: oldRole.id, branchId: oldBranch.id });
    const device = await m.EmployeeMobileDevice.create({ organizationId: org.id, userId: user.id, name: 'Phone', platform: 'android', refreshHash: 'unused', lastUsedAt: new Date() });
    const link = await m.EmployeeDeviceLink.create({ organizationId: org.id, userId: user.id, challengeHash: `link-${i}`, expiresAt: new Date(Date.now() + 60000) });
    const input = { organizationId: org.id, employeeId: employee.id, branchId: branch.id, departmentId: department.id, positionId: position.id, effectiveDate: todayIST(), reason: 'Transfer', compensation: { catalogueId: catalogue.id, postCode: 'CLERK', stageNo: 1 }, roleChanges: { start: [{ roleId: role.id, scopeType: 'SELECTED_BRANCHES', branchIds: [branch.id] }] } };
    return { employee, user, old, oldRole, device, link, input };
  }
  return { org, admin, approver, post, oldBranch, branch, department, position, catalogue, role, worker };
}
async function unchanged(f, w) {
  await w.employee.reload(); await w.old.reload(); await w.user.reload(); await w.oldRole.reload();
  assert.equal(w.employee.branchId, f.oldBranch.id); assert.equal(Number(w.employee.currentBasicPay), 9000);
  assert.equal(w.old.effectiveTo, null); assert.equal(w.oldRole.effectiveTo, null); assert.equal(w.user.accessVersion, 0);
  assert.equal(await Assignment.count({ where: { employeeId: w.employee.id } }), 1);
  assert.equal((await w.device.reload()).revokedAt, null); assert.equal((await w.link.reload()).status, 'PENDING');
}

test('pending financial bundle and rejection preserve structure, salary and access; proposal cannot be decided independently', async () => {
  const f = await fixture(), w = await f.worker();
  const transfer = await s.proposeTransfer(w.input, f.admin);
  await unchanged(f, w);
  const proposal = await Compensation.findByPk(transfer.compensationProposalId);
  assert.equal(proposal.status, 'PENDING'); assert.equal(Number(proposal.amount), 11000);
  await assert.rejects(salary.decideAssignment({ organizationId: f.org.id, proposalId: proposal.id, decision: 'APPROVED', actorId: f.approver.id }), /transfer/i);
  await assert.rejects(s.approveTransfer(transfer.id, f.admin), /different|approv|permission/i);
  const rejected = await s.rejectTransfer(transfer.id, f.approver);
  assert.equal(rejected.status, 'REJECTED'); await unchanged(f, w);
  assert.equal((await proposal.reload()).status, 'REJECTED');
  await assert.rejects(s.approveTransfer(transfer.id, f.approver), /changed|pending|already/i);
});

test('late approval atomically closes history, starts roles and catalogue pay, synchronizes pointers and invalidates once', async () => {
  const f = await fixture(), w = await f.worker();
  w.input.effectiveDate = '2026-04-16';
  const transfer = await s.proposeTransfer(w.input, f.admin);
  const result = await s.approveTransfer(transfer.id, f.approver);
  assert.equal(result.status, 'ACTIVATED'); assert.equal(result.preparedBy, f.admin.id); assert.equal(result.decidedBy, f.approver.id);
  await w.employee.reload(); await w.old.reload(); await w.oldRole.reload(); await w.user.reload();
  assert.equal(w.old.effectiveTo, '2026-04-15'); assert.equal(w.oldRole.effectiveTo, '2026-04-15');
  assert.equal(w.employee.branchId, f.branch.id); assert.equal(w.employee.departmentId, f.department.id); assert.equal(w.employee.positionId, f.position.id);
  assert.equal(w.employee.branchName, f.branch.name); assert.equal(Number(w.employee.currentBasicPay), 11000); assert.equal(w.user.accessVersion, 1);
  assert.ok((await w.device.reload()).revokedAt); assert.equal((await w.link.reload()).status, 'CANCELLED');
  const current = await Assignment.findOne({ where: { transferId: transfer.id } });
  assert.equal(current.effectiveFrom, '2026-04-16'); assert.equal(current.assignedBy, f.admin.id);
  const newRole = await RoleAssignment.findOne({ where: { userId: w.user.id, effectiveFrom: '2026-04-16' } });
  assert.ok(newRole); assert.equal((await UserRoleBranch.findOne({ where: { userRoleAssignmentId: newRole.id } })).branchId, f.branch.id);
  assert.equal((await salary.assignmentForDate(w.employee.id, '2026-04-16')).stageNo, 1);
  assert.equal(await AuditLog.count({ where: { targetId: String(w.user.id), action: 'user.access.invalidate' } }), 1);
  await s.activateApprovedTransfers(todayIST()); assert.equal((await w.user.reload()).accessVersion, 1);
  await assert.rejects(result.update({ preparedBy: f.approver.id }), /immutable/i);
});

test('future approved bundle waits completely until reconciliation and is idempotent', async () => {
  const f = await fixture(), w = await f.worker(); w.input.effectiveDate = '2040-01-02';
  const transfer = await s.proposeTransfer(w.input, f.admin);
  assert.equal((await s.approveTransfer(transfer.id, f.approver)).status, 'APPROVED'); await unchanged(f, w);
  assert.equal((await Compensation.findByPk(transfer.compensationProposalId)).status, 'PENDING');
  await s.activateApprovedTransfers('2040-01-01'); await unchanged(f, w);
  await s.activateApprovedTransfers('2040-01-02');
  assert.equal((await w.employee.reload()).branchId, f.branch.id); assert.equal(Number(w.employee.currentBasicPay), 11000); assert.equal((await w.user.reload()).accessVersion, 1);
});

test('rejects foreign ownership, inactive hierarchy, invalid roles, dates, amount copies and catalogue stages', async () => {
  const f = await fixture(), w = await f.worker(), other = await fixture();
  for (const patch of [ { employeeId: (await other.worker()).employee.id }, { branchId: other.branch.id }, { departmentId: other.department.id }, { positionId: other.position.id }, { effectiveDate: '2026-02-30' }, { amount: 1 }, { compensation: { ...w.input.compensation, amount: 1 } }, { compensation: { ...w.input.compensation, stageNo: 99 } }, { roleChanges: { start: [{ roleId: other.role.id, scopeType: 'SELECTED_BRANCHES', branchIds: [f.branch.id] }] } }, { roleChanges: { start: [{ roleId: f.role.id, scopeType: 'ORGANISATION' }] } } ]) {
    await assert.rejects(s.proposeTransfer({ ...w.input, ...patch }, f.admin));
  }
  await f.branch.update({ status: 'INACTIVE' }); await assert.rejects(s.proposeTransfer(w.input, f.admin), /active/i);
  await unchanged(f, w); assert.equal(await Transfer.count({ where: { organizationId: f.org.id } }), 0);
});

test('revalidates capacity and hierarchy at activation and rolls back every component on failure', async () => {
  const f = await fixture(), w = await f.worker(), occupant = await f.worker();
  const transfer = await s.proposeTransfer(w.input, f.admin);
  await Assignment.create({ organizationId: f.org.id, employeeId: occupant.employee.id, branchId: f.branch.id, departmentId: f.department.id, positionId: f.position.id, effectiveFrom: '2026-01-01' });
  await assert.rejects(s.approveTransfer(transfer.id, f.approver), /capacity/i);
  await unchanged(f, w); assert.equal((await transfer.reload()).status, 'PENDING');
  assert.equal((await Compensation.findByPk(transfer.compensationProposalId)).status, 'PENDING');
});

test('competing concurrent last-seat approvals activate at most one transfer', async () => {
  const f = await fixture(), a = await f.worker(), b = await f.worker();
  const one = await s.proposeTransfer(a.input, f.admin), two = await s.proposeTransfer(b.input, f.admin);
  const results = await Promise.allSettled([s.approveTransfer(one.id, f.approver), s.approveTransfer(two.id, f.approver)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.match(results.find(r => r.status === 'rejected').reason.message, /capacity/i);
  assert.equal(await Assignment.count({ where: { positionId: f.position.id } }), 1);
});

test('activation refuses conflicting future primary history and stale compensation without closing current assignment', async () => {
  const f = await fixture(), w = await f.worker();
  const transfer = await s.proposeTransfer(w.input, f.admin);
  await w.old.update({ effectiveTo: '2039-12-31' });
  await Assignment.create({ organizationId: f.org.id, employeeId: w.employee.id, branchId: f.oldBranch.id, effectiveFrom: '2040-01-01' });
  await assert.rejects(s.approveTransfer(transfer.id, f.approver), /overlap|future|assignment/i);
  assert.equal((await w.old.reload()).effectiveTo, '2039-12-31'); assert.equal((await transfer.reload()).status, 'PENDING');
});

test('existing compensation reference is tenant-bound and its original preparer cannot approve', async () => {
  const f = await fixture(), w = await f.worker();
  const proposal = await salary.proposeAssignment({ ...w.input.compensation, organizationId: f.org.id, employeeId: w.employee.id, effectiveDate: w.input.effectiveDate, actorId: f.approver.id, reason: 'Prepared separately' });
  const transfer = await s.proposeTransfer({ ...w.input, compensation: undefined, compensationProposalId: proposal.id }, f.admin);
  await assert.rejects(s.approveTransfer(transfer.id, f.approver), /different|preparer/i);
  await unchanged(f, w);
});

test('failure during final access invalidation rolls salary, role history and structure back', async () => {
  const f = await fixture(), w = await f.worker();
  const transfer = await s.proposeTransfer(w.input, f.admin);
  const hook = () => { throw new Error('invalidation failed'); };
  // Fail after the access version and devices have changed, inside their transaction.
  AuditLog.addHook('beforeBulkCreate', 'fail-transfer', hook);
  try { await assert.rejects(s.approveTransfer(transfer.id, f.approver), /invalidation failed/); }
  finally { AuditLog.removeHook('beforeBulkCreate', 'fail-transfer'); }
  await unchanged(f, w); assert.equal((await transfer.reload()).status, 'PENDING');
  assert.equal((await Compensation.findByPk(transfer.compensationProposalId)).status, 'PENDING');
});

test('additive migration creates transfer storage idempotently without changing legacy employee history', async () => {
  const { migrate } = require('../src/scripts/migrate');
  await migrate(); await migrate();
  const columns = await sequelize.getQueryInterface().describeTable('employee_transfer');
  assert.ok(columns.compensation_proposal_id); assert.equal(columns.amount, undefined);
});


test('a stale destination can still be rejected without validating activation capacity or hierarchy', async () => {
  const f = await fixture(), w = await f.worker();
  const transfer = await s.proposeTransfer(w.input, f.admin);
  await f.position.update({ status: 'INACTIVE' });
  assert.equal((await s.rejectTransfer(transfer.id, f.approver)).status, 'REJECTED');
  await unchanged(f, w);
});

test('scheduled activation revalidates its role plan and a failed attempt preserves the approved pending bundle', async () => {
  const f = await fixture(), w = await f.worker(); w.input.effectiveDate = '2040-01-02';
  const transfer = await s.proposeTransfer(w.input, f.admin);
  await s.approveTransfer(transfer.id, f.approver);
  await f.role.update({ status: 'INACTIVE' });
  await assert.rejects(s.activateApprovedTransfers('2040-01-02'), /active/i);
  await unchanged(f, w); assert.equal((await transfer.reload()).status, 'APPROVED');
  assert.equal((await Compensation.findByPk(transfer.compensationProposalId)).status, 'PENDING');
  await f.role.update({ status: 'ACTIVE' });
  await s.activateApprovedTransfers('2040-01-02');
});

test('explicitly retained old scopes remain active and an already approved direct-pay arrangement is referenced without a copy', async () => {
  const f = await fixture(), w = await f.worker();
  await w.employee.update({ directPay: true });
  const pay = await salary.proposeAssignment({ organizationId: f.org.id, employeeId: w.employee.id, effectiveDate: '2020-01-01', actorId: f.admin.id, amount: 9000, reason: 'Bank arrangement' });
  await salary.decideAssignment({ organizationId: f.org.id, proposalId: pay.id, decision: 'APPROVED', actorId: f.approver.id });
  const transfer = await s.proposeTransfer({ ...w.input, compensation: undefined, compensationProposalId: pay.id, roleChanges: { retainAssignmentIds: [w.oldRole.id], start: [] } }, f.admin);
  const otherAdmin = await User.create({ organizationId: f.org.id, name: 'Second admin', email: `second${++serial}@transfer.invalid`, passwordHash: 'unused', role: 'ORG_ADMIN' });
  await s.approveTransfer(transfer.id, otherAdmin);
  assert.equal((await w.oldRole.reload()).effectiveTo, null);
  assert.equal(await Compensation.count({ where: { employeeId: w.employee.id } }), 1);
  assert.equal((await w.employee.reload()).branchId, f.branch.id);
});

test('concurrent effective-date reconciliation activates a scheduled bundle exactly once', async () => {
  const f = await fixture(), w = await f.worker(); w.input.effectiveDate = '2040-01-02';
  const transfer = await s.proposeTransfer(w.input, f.admin); await s.approveTransfer(transfer.id, f.approver);
  await Promise.all([s.activateApprovedTransfers('2040-01-02'), s.activateApprovedTransfers('2040-01-02')]);
  assert.equal((await w.user.reload()).accessVersion, 1);
  assert.equal(await Assignment.count({ where: { transferId: transfer.id } }), 1);
});

test('an unchanged approved direct-pay arrangement can be retained across successive transfers', async () => {
  const f = await fixture(), w = await f.worker(); await w.employee.update({ directPay: true });
  const pay = await salary.proposeAssignment({ organizationId: f.org.id, employeeId: w.employee.id, effectiveDate: '2020-01-01', actorId: f.admin.id, amount: 9000, reason: 'Bank arrangement' });
  await salary.decideAssignment({ organizationId: f.org.id, proposalId: pay.id, decision: 'APPROVED', actorId: f.approver.id });
  const otherAdmin = await User.create({ organizationId: f.org.id, name: 'Second admin', email: `second${++serial}@transfer.invalid`, passwordHash: 'unused', role: 'ORG_ADMIN' });
  const input = { ...w.input, compensation: undefined, compensationProposalId: pay.id, roleChanges: {}, effectiveDate: '2026-04-01' };
  await s.approveTransfer((await s.proposeTransfer(input, f.admin)).id, otherAdmin);
  await s.approveTransfer((await s.proposeTransfer({ ...input, branchId: f.oldBranch.id, departmentId: null, positionId: null, effectiveDate: '2026-05-01' }, f.admin)).id, otherAdmin);
  assert.equal((await w.employee.reload()).branchId, f.oldBranch.id); assert.equal(await Compensation.count({ where: { employeeId: w.employee.id } }), 1);
});

test('destination post-cadre eligibility is checked at proposal and again at activation', async () => {
  const f = await fixture(), w = await f.worker();
  const other = await PostCadre.create({ organizationId: f.org.id, code: 'MANAGER', name: 'Manager' });
  await f.position.update({ postCadreId: other.id });
  await assert.rejects(s.proposeTransfer(w.input, f.admin), /eligible|cadre/i);
  await f.position.update({ postCadreId: f.post.id });
  const transfer = await s.proposeTransfer(w.input, f.admin);
  await f.position.update({ postCadreId: other.id });
  await assert.rejects(s.approveTransfer(transfer.id, f.approver), /eligible|cadre/i);
  await unchanged(f, w);
});

test('financial activation revalidates the current bank class and published catalogue revision', async () => {
  const f = await fixture(), w = await f.worker();
  const transfer = await s.proposeTransfer(w.input, f.admin);
  await f.org.update({ bankClass: 'CLASS_II' });
  await assert.rejects(s.approveTransfer(transfer.id, f.approver), /class/i);
  await unchanged(f, w);
});

test('a custom role with transfers.manage alone cannot grant system roles', async () => {
  const f = await fixture(), w = await f.worker(), manager = await f.worker();
  await manager.user.update({ role: 'ORG_ADMIN' });
  await f.org.update({ accessControlMode: 'PERMISSIONS' });
  const limited = await Role.create({ organizationId: f.org.id, code: 'LIMITED', name: 'Transfers only', templateCode: 'ORGANISATION_ADMIN' });
  await m.OrganizationRolePermission.create({ organizationId: f.org.id, roleId: limited.id, permissionCode: 'transfers.manage' });
  await RoleAssignment.create({ organizationId: f.org.id, userId: manager.user.id, roleId: limited.id, scopeType: 'ORGANISATION', effectiveFrom: '2020-01-01' });
  await assert.rejects(s.proposeTransfer(w.input, manager.user), /roles.manage|permission/i);
  await unchanged(f, w);
});

test('the approving employee cannot approve new system roles for themselves', async () => {
  const f = await fixture(), w = await f.worker(); await w.user.update({ role: 'APPROVING_AUTHORITY' });
  const transfer = await s.proposeTransfer(w.input, f.admin);
  await assert.rejects(s.approveTransfer(transfer.id, w.user), /yourself|own role/i);
  await unchanged(f, w);
});

test('an empty custom admin copy cannot replace the last protected Organisation Admin', async () => {
  const f = await fixture(), w = await f.worker(), other = await f.worker();
  const protectedRole = await Role.create({ organizationId: f.org.id, code: 'ORGANISATION_ADMIN', name: 'Organisation Admin', templateCode: 'ORGANISATION_ADMIN', isProtected: true });
  const empty = await Role.create({ organizationId: f.org.id, code: 'EMPTY_ADMIN', name: 'Empty admin', templateCode: 'ORGANISATION_ADMIN' });
  const last = await RoleAssignment.create({ organizationId: f.org.id, userId: w.user.id, roleId: protectedRole.id, scopeType: 'ORGANISATION', effectiveFrom: '2020-01-01' });
  await RoleAssignment.create({ organizationId: f.org.id, userId: other.user.id, roleId: empty.id, scopeType: 'ORGANISATION', effectiveFrom: '2020-01-01' });
  await assert.rejects(s.proposeTransfer({ ...w.input, roleChanges: { closeAssignmentIds: [last.id] } }, f.admin), /last Organisation Admin/i);
  await unchanged(f, w);
});

test('automatic scoped-role closures require roles.manage before creating a transfer or salary proposal', async () => {
  const f = await fixture(), w = await f.worker(), manager = await f.worker();
  await f.org.update({ accessControlMode: 'PERMISSIONS' });
  const limited = await Role.create({ organizationId: f.org.id, code: 'LIMITED', name: 'Transfers only', templateCode: 'ORGANISATION_ADMIN' });
  await m.OrganizationRolePermission.create({ organizationId: f.org.id, roleId: limited.id, permissionCode: 'transfers.manage' });
  await RoleAssignment.create({ organizationId: f.org.id, userId: manager.user.id, roleId: limited.id, scopeType: 'ORGANISATION', effectiveFrom: '2020-01-01' });
  let salaryWrites = 0;
  Compensation.addHook('beforeCreate', 'track-transfer-salary', () => { salaryWrites++; });
  try { await assert.rejects(s.proposeTransfer({ ...w.input, roleChanges: {} }, manager.user), /roles.manage|permission/i); }
  finally { Compensation.removeHook('beforeCreate', 'track-transfer-salary'); }
  assert.equal(salaryWrites, 0);
  assert.equal(await Transfer.count({ where: { employeeId: w.employee.id } }), 0);
  assert.equal(await Compensation.count({ where: { employeeId: w.employee.id } }), 0);
  await unchanged(f, w);
  await w.oldRole.update({ status: 'INACTIVE' });
  const proposal = await s.proposeTransfer({ ...w.input, roleChanges: {} }, manager.user);
  assert.equal(proposal.status, 'PENDING');
  assert.equal(await Transfer.count({ where: { employeeId: w.employee.id } }), 1);
  assert.equal(await Compensation.count({ where: { employeeId: w.employee.id } }), 1);
  await unchanged(f, w);
});
