'use strict';
const { Op, Transaction } = require('sequelize');
const {
  sequelize, Organization, PostCadre, Employee, EmployeeTransfer: Transfer, EmployeeOrganizationAssignment: Assignment,
  OrganizationBranch: Branch, OrganizationDepartment: Department, OrganizationPosition: Position,
  EmployeeCompensationAssignment: Compensation, User, OrganizationRole: Role, OrganizationRolePermission,
  UserRoleAssignment: RoleAssignment, UserRoleBranch, UserRoleDepartment, EmployeeServiceHistory, AuditLog,
} = require('../models');
const salary = require('./compensationAssignments');
const { todayIST } = require('./orgAccess');
const { isDateOnly } = require('./dateUtils');
const { sameId } = require('./organizationAccessPolicy');
const { effectiveAccess, can } = require('./accessControl');
const { template, permission } = require('./permissionCatalog');
const { invalidateUserAccess } = require('./userAdmin');
class TransferError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const fail = (message, status) => { throw new TransferError(message, status); };
const before = date => new Date(Date.parse(date) - 86400000).toISOString().slice(0, 10);
const activeAt = (row, at) => row.status === 'ACTIVE' && row.effectiveFrom <= at && (!row.effectiveTo || row.effectiveTo >= at);
function id(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail('Invalid identifier');
  return Number(value);
}
function keys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('Unsupported transfer fields; copied salary amounts are not accepted');
}
const inTransaction = (transaction, work) => transaction ? work(transaction) : sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE }, work);
async function owned(Model, value, organizationId, transaction, active = false) {
  const row = await Model.findOne({ where: { id: id(value), organizationId }, transaction, lock: transaction.LOCK.UPDATE });
  if (!row) fail(`${Model.name} not found in this organisation`, 404);
  if (active && row.status !== 'ACTIVE') fail(`${Model.name} must be active`, 409);
  return row;
}
async function organizationLock(organizationId, transaction) {
  if (!await Organization.findByPk(id(organizationId), { transaction, lock: transaction.LOCK.UPDATE })) fail('Organisation not found', 404);
}
async function authorize(actor, organizationId, code, transaction) {
  const user = actor && await User.findOne({ where: { id: id(actor.id), organizationId, status: 'ACTIVE' }, transaction });
  if (!user || !can(await effectiveAccess(user.id, todayIST(), transaction), code)) fail(`Not authorized: ${code} permission required`, 403);
  return user;
}
async function destination(input, transaction) {
  const branch = await owned(Branch, input.branchId, input.organizationId, transaction, true);
  const department = input.departmentId == null ? null : await owned(Department, input.departmentId, input.organizationId, transaction, true);
  const position = input.positionId == null ? null : await owned(Position, input.positionId, input.organizationId, transaction, true);
  if (department && !sameId(department.branchId, branch.id)) fail('Department must belong to destination branch');
  if (position && (!sameId(position.branchId, branch.id) || !sameId(position.departmentId, department?.id))) fail('Position must belong to destination department and branch');
  return { branch, department, position };
}
async function capacity(input, position, transaction) {
  if (!position) return;
  const occupants = await Assignment.findAll({ where: { organizationId: input.organizationId, positionId: position.id, status: 'ACTIVE', employeeId: { [Op.ne]: input.employeeId }, [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: input.effectiveDate } }] }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
  const events = [[input.effectiveDate, 1]];
  for (const occupant of occupants) {
    events.push([occupant.effectiveFrom < input.effectiveDate ? input.effectiveDate : occupant.effectiveFrom, 1]);
    if (occupant.effectiveTo) events.push([occupant.effectiveTo, -1]);
  }
  events.sort((a, b) => a[0].localeCompare(b[0]) || b[1] - a[1]);
  let count = 0;
  for (const [, delta] of events) if ((count += delta) > position.capacity) fail('Destination position capacity exceeded', 409);
}
function rolePlan(value = {}) {
  keys(value, ['closeAssignmentIds', 'retainAssignmentIds', 'start']);
  const array = key => { if (value[key] != null && !Array.isArray(value[key])) fail('Invalid role-change plan'); return value[key] || []; };
  const plan = { closeAssignmentIds: [...new Set(array('closeAssignmentIds').map(id))], retainAssignmentIds: [...new Set(array('retainAssignmentIds').map(id))], start: array('start') };
  for (const start of plan.start) {
    keys(start, ['roleId', 'scopeType', 'branchIds', 'departmentIds']);
    start.roleId = id(start.roleId);
    for (const key of ['branchIds', 'departmentIds']) {
      if (start[key] != null && !Array.isArray(start[key])) fail('Invalid role scope identifiers');
      start[key] = [...new Set((start[key] || []).map(id))].sort((a, b) => a - b);
    }
  }
  if (plan.closeAssignmentIds.some(value => plan.retainAssignmentIds.includes(value))) fail('Cannot both retain and close a role assignment');
  return plan;
}
async function validateRole(start, organizationId, transaction) {
  const role = await owned(Role, start.roleId, organizationId, transaction, true), definition = template(role.templateCode);
  if (!definition || !definition.allowedScopes.includes(start.scopeType)) fail('Role template does not allow the selected scope');
  const grants = await OrganizationRolePermission.findAll({ where: { organizationId, roleId: role.id }, transaction });
  if (grants.some(grant => !definition.permissionCodes.includes(grant.permissionCode) || !permission(grant.permissionCode)?.allowedScopes.includes(start.scopeType))) fail('Role permissions exceed the template or selected scope');
  if (start.scopeType === 'SELECTED_BRANCHES' ? !start.branchIds.length || start.departmentIds.length : start.scopeType === 'DEPARTMENT' ? !start.departmentIds.length || start.branchIds.length : start.branchIds.length || start.departmentIds.length) fail('Role scope requires exactly its selected branch or department identifiers');
  for (const value of start.branchIds) await owned(Branch, value, organizationId, transaction, true);
  for (const value of start.departmentIds) {
    const department = await owned(Department, value, organizationId, transaction, true);
    await owned(Branch, department.branchId, organizationId, transaction, true);
  }
  return role;
}
async function roleState(input, actor, transaction) {
  const users = await User.findAll({ where: { organizationId: input.organizationId, employeeId: input.employeeId }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
  if (users.length > 1) fail('Ambiguous employee user link', 409);
  const user = users[0], plan = input.roleChanges;
  if (!user && (plan.start.length || plan.closeAssignmentIds.length || plan.retainAssignmentIds.length)) fail('Role changes require a linked user');
  const assignments = user ? await RoleAssignment.findAll({ where: { organizationId: input.organizationId, userId: user.id, status: 'ACTIVE' }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE }) : [];
  for (const value of [...plan.closeAssignmentIds, ...plan.retainAssignmentIds]) if (!assignments.some(row => sameId(row.id, value) && activeAt(row, input.effectiveDate))) fail('Role assignment is absent or not current for this employee');
  const closing = assignments.filter(row => activeAt(row, input.effectiveDate) && (plan.closeAssignmentIds.includes(row.id) || ['SELECTED_BRANCHES', 'DEPARTMENT'].includes(row.scopeType) && !plan.retainAssignmentIds.includes(row.id)));
  if (closing.some(row => row.effectiveFrom >= input.effectiveDate)) fail('Role closure must follow its effective start');
  if (assignments.some(row => row.effectiveFrom > input.effectiveDate && (!row.effectiveTo || row.effectiveTo >= input.effectiveDate))) fail('Future role assignments must be resolved before transfer', 409);
  for (const row of assignments.filter(row => plan.retainAssignmentIds.includes(row.id))) {
    const branches = await UserRoleBranch.findAll({ where: { organizationId: input.organizationId, userRoleAssignmentId: row.id }, transaction });
    const departments = await UserRoleDepartment.findAll({ where: { organizationId: input.organizationId, userRoleAssignmentId: row.id }, transaction });
    await validateRole({ ...row.toJSON(), branchIds: branches.map(scope => scope.branchId), departmentIds: departments.map(scope => scope.departmentId) }, input.organizationId, transaction);
  }
  const newRoles = [];
  for (const start of plan.start) newRoles.push(await validateRole(start, input.organizationId, transaction));
  if (user && (sameId(user.id, input.preparedBy || actor?.id) || sameId(user.id, actor?.id)) && plan.start.length) fail('Cannot grant yourself roles through a transfer', 403);
  const closingRoles = closing.length ? await Role.findAll({ where: { organizationId: input.organizationId, id: closing.map(row => row.roleId), templateCode: 'ORGANISATION_ADMIN' }, transaction }) : [];
  if (closingRoles.length && !newRoles.some(row => row.isProtected && row.code === 'ORGANISATION_ADMIN' && row.templateCode === 'ORGANISATION_ADMIN')) {
    const adminRoles = await Role.findAll({ where: { organizationId: input.organizationId, templateCode: 'ORGANISATION_ADMIN', code: 'ORGANISATION_ADMIN', isProtected: true, status: 'ACTIVE' }, transaction });
    const admins = await RoleAssignment.findAll({ where: { organizationId: input.organizationId, roleId: adminRoles.map(row => row.id), scopeType: 'ORGANISATION', status: 'ACTIVE' }, transaction });
    const others = admins.filter(row => !closing.some(close => sameId(close.id, row.id)) && activeAt(row, input.effectiveDate));
    if (!await User.count({ where: { organizationId: input.organizationId, id: others.map(row => row.userId), status: 'ACTIVE' }, transaction })) fail('Cannot remove the last Organisation Admin', 409);
  }
  return { user, closing };
}
async function compensation(input, employee, transaction) {
  if (!input.compensationProposalId) return null;
  const proposal = await owned(Compensation, input.compensationProposalId, input.organizationId, transaction);
  if (!sameId(proposal.employeeId, employee.id)) fail('Compensation proposal belongs to another employee');
  if (proposal.status === 'APPROVED' && employee.directPay && proposal.effectiveDate <= input.effectiveDate) {
    if (!sameId((await salary.assignmentForDate(employee.id, input.effectiveDate, transaction))?.id, proposal.id)) fail('Select the current approved direct-pay arrangement');
  } else if (proposal.status !== 'PENDING' || proposal.effectiveDate !== input.effectiveDate) fail('Transfer requires a pending compensation proposal for its effective date', 409);
  const clean = await salary.validateAssignment(proposal.toJSON(), transaction);
  if (clean.amount !== Number(proposal.amount)) fail('Catalogue stage changed after proposal', 409);
  return proposal;
}
async function lockedState(input, transaction) {
  const employee = await owned(Employee, input.employeeId, input.organizationId, transaction, true);
  const ledger = await Assignment.findAll({ where: { organizationId: input.organizationId, employeeId: employee.id, status: 'ACTIVE' }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
  const old = ledger.filter(row => activeAt(row, input.effectiveDate));
  if (old.length > 1 || ledger.some(row => row.effectiveFrom > input.effectiveDate)) fail('Primary assignment overlaps or conflicts with future history', 409);
  if (old.some(row => row.effectiveFrom >= input.effectiveDate)) fail('Transfer must follow the current primary assignment start');
  const ownedDestination = await destination(input, transaction);
  await capacity(input, ownedDestination.position, transaction);
  const proposal = await compensation(input, employee, transaction);
  if (ownedDestination.position?.postCadreId) {
    const cadre = await owned(PostCadre, ownedDestination.position.postCadreId, input.organizationId, transaction);
    const pay = input.compensation || proposal || await salary.assignmentForDate(employee.id, input.effectiveDate, transaction);
    if (pay?.postCode ? pay.postCode !== cadre.code : !sameId(employee.postCadreId, cadre.id)) fail('Selected compensation post is not eligible for the destination post cadre');
  }
  return { employee, old: old[0], proposal, ...ownedDestination };
}
async function audit(input, actor, action, transaction) {
  await AuditLog.create({ organizationId: input.organizationId, actorUserId: actor?.id || null, action, targetType: 'EmployeeTransfer', targetId: String(input.id), details: { employeeId: input.employeeId, effectiveDate: input.effectiveDate } }, { transaction });
}
async function proposeTransfer(input, actor) {
  keys(input, ['organizationId', 'employeeId', 'branchId', 'departmentId', 'positionId', 'effectiveDate', 'reason', 'compensation', 'compensationProposalId', 'roleChanges']);
  if (!isDateOnly(input.effectiveDate)) fail('Valid effective date required');
  if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 500) fail('A reason of at most 500 characters is required');
  if (input.compensation && input.compensationProposalId) fail('Select compensation or an existing proposal, not both');
  if (input.compensation) keys(input.compensation, ['catalogueId', 'postCode', 'stageNo']);
  return inTransaction(null, async transaction => {
    await organizationLock(input.organizationId, transaction);
    const preparer = await authorize(actor, input.organizationId, 'transfers.manage', transaction);
    const data = { ...input, employeeId: id(input.employeeId), roleChanges: rolePlan(input.roleChanges), preparedBy: preparer.id };
    const state = await lockedState(data, transaction);
    const roles = await roleState(data, preparer, transaction);
    if (roles.closing.length || data.roleChanges.start.length || data.roleChanges.closeAssignmentIds.length || data.roleChanges.retainAssignmentIds.length) await authorize(preparer, data.organizationId, 'roles.manage', transaction);
    if (data.compensation) {
      if (state.employee.directPay) fail('Select an approved direct-pay arrangement or an existing financial proposal');
      const proposal = await salary.proposeAssignment({ ...data.compensation, organizationId: data.organizationId, employeeId: data.employeeId, effectiveDate: data.effectiveDate, reason: data.reason, actorId: preparer.id }, transaction);
      data.compensationProposalId = proposal.id;
    }
    const pay = data.compensationProposalId && await Compensation.findByPk(data.compensationProposalId, { transaction });
    if (pay?.status === 'PENDING' && await Transfer.count({ where: { compensationProposalId: data.compensationProposalId }, transaction })) fail('Compensation proposal already belongs to a transfer', 409);
    const transfer = await Transfer.create({ organizationId: data.organizationId, employeeId: data.employeeId, branchId: state.branch.id, departmentId: state.department?.id || null, positionId: state.position?.id || null, compensationProposalId: data.compensationProposalId || null, roleChanges: data.roleChanges, effectiveDate: data.effectiveDate, reason: data.reason.trim(), preparedBy: preparer.id }, { transaction });
    await audit(transfer, preparer, 'org.transfer.propose', transaction);
    return transfer;
  });
}
async function activate(transfer, state, actor, at, transaction) {
  const roles = state.roles || await roleState(transfer, actor, transaction);
  if (state.proposal?.status === 'PENDING') await salary.decideAssignment({ organizationId: transfer.organizationId, proposalId: state.proposal.id, decision: 'APPROVED', actorId: transfer.decidedBy, reason: transfer.decisionReason }, { transaction, transferId: transfer.id, at });
  if (state.old) await state.old.update({ effectiveTo: before(transfer.effectiveDate) }, { transaction });
  await Assignment.create({ organizationId: transfer.organizationId, employeeId: transfer.employeeId, branchId: transfer.branchId, departmentId: transfer.departmentId, positionId: transfer.positionId, effectiveFrom: transfer.effectiveDate, transferId: transfer.id, assignedBy: transfer.preparedBy }, { transaction });
  for (const row of roles.closing) await row.update({ effectiveTo: before(transfer.effectiveDate) }, { transaction });
  for (const start of transfer.roleChanges.start) {
    const assignment = await RoleAssignment.create({ organizationId: transfer.organizationId, userId: roles.user.id, roleId: start.roleId, scopeType: start.scopeType, effectiveFrom: transfer.effectiveDate, assignedBy: transfer.preparedBy }, { transaction });
    for (const [Model, field, values] of [[UserRoleBranch, 'branchId', start.branchIds], [UserRoleDepartment, 'departmentId', start.departmentIds]]) {
      for (const value of values) await Model.create({ organizationId: transfer.organizationId, userRoleAssignmentId: assignment.id, [field]: value }, { transaction });
    }
  }
  await state.employee.update({ branchId: transfer.branchId, departmentId: transfer.departmentId, positionId: transfer.positionId, branchName: state.branch.name, branchCode: state.branch.code, department: state.department?.name || null, designation: state.position?.name || null }, { transaction });
  await EmployeeServiceHistory.create({ employeeId: transfer.employeeId, eventType: 'TRANSFER', eventDate: transfer.effectiveDate, remarks: `Transfer #${transfer.id}: ${transfer.reason}` }, { transaction });
  await transfer.update({ status: 'ACTIVATED', activatedAt: new Date() }, { transaction });
  if (roles.user) await invalidateUserAccess([roles.user.id], { transaction, reason: 'organisation.transfer.activated', actor });
  await audit(transfer, actor, 'org.transfer.activate', transaction);
  return transfer;
}
async function decide(idValue, actor, decision) {
  const snapshot = actor && await Transfer.findOne({ where: { id: id(idValue), organizationId: actor.organizationId } });
  if (!snapshot) fail('Transfer not found', 404);
  return inTransaction(null, async transaction => {
    // Same first lock as every Task 5 structure writer. Then employee, primary ledger,
    // hierarchy/position, compensation, transfer, linked user and roles, all ordered by id.
    await organizationLock(snapshot.organizationId, transaction);
    if ((await Transfer.findByPk(snapshot.id, { transaction })).status !== 'PENDING') fail('This transfer has already changed', 409);
    const state = decision === 'REJECTED' ? {
      employee: await owned(Employee, snapshot.employeeId, snapshot.organizationId, transaction),
      proposal: snapshot.compensationProposalId ? await owned(Compensation, snapshot.compensationProposalId, snapshot.organizationId, transaction) : null,
    } : await lockedState(snapshot, transaction);
    const transfer = await owned(Transfer, snapshot.id, snapshot.organizationId, transaction);
    if (transfer.status !== 'PENDING') fail('This transfer has already changed', 409);
    if (sameId(transfer.preparedBy, actor.id) || state.proposal && sameId(state.proposal.preparedBy, actor.id)) fail('A different approving authority must decide this transfer', 403);
    const decider = await authorize(actor, transfer.organizationId, state.proposal?.status === 'PENDING' ? 'compensation.approve' : 'transfers.manage', transaction);
    if (decision === 'APPROVED') state.roles = await roleState(transfer, decider, transaction);
    await transfer.update({ status: decision, decidedBy: decider.id, decidedAt: new Date(), decisionReason: actor.decisionReason ? String(actor.decisionReason).slice(0, 500) : null }, { transaction });
    if (decision === 'REJECTED') {
      if (state.proposal?.status === 'PENDING') await salary.decideAssignment({ organizationId: transfer.organizationId, proposalId: state.proposal.id, decision, actorId: decider.id, reason: transfer.decisionReason }, { transaction, transferId: transfer.id });
    } else if (transfer.effectiveDate <= todayIST()) await activate(transfer, state, decider, todayIST(), transaction);
    await audit(transfer, decider, `org.transfer.${decision.toLowerCase()}`, transaction);
    return transfer;
  });
}
const approveTransfer = (idValue, actor) => decide(idValue, actor, 'APPROVED');
const rejectTransfer = (idValue, actor) => decide(idValue, actor, 'REJECTED');
async function activateApprovedTransfers(at = todayIST(), transaction) {
  if (!isDateOnly(at)) fail('Valid activation date required');
  const due = await Transfer.findAll({ where: { status: 'APPROVED', effectiveDate: { [Op.lte]: at } }, order: [['organizationId', 'ASC'], ['employeeId', 'ASC'], ['effectiveDate', 'ASC'], ['id', 'ASC']], transaction });
  return inTransaction(transaction, async transaction => {
    const activated = [];
    for (const snapshot of due) {
      await organizationLock(snapshot.organizationId, transaction);
      if ((await Transfer.findByPk(snapshot.id, { transaction })).status !== 'APPROVED') continue;
      const state = await lockedState(snapshot, transaction);
      const transfer = await owned(Transfer, snapshot.id, snapshot.organizationId, transaction);
      if (transfer.status !== 'APPROVED') continue;
      const actor = await authorize({ id: transfer.decidedBy }, transfer.organizationId, state.proposal?.status === 'PENDING' ? 'compensation.approve' : 'transfers.manage', transaction);
      if (sameId(transfer.preparedBy, actor.id) || state.proposal && sameId(state.proposal.preparedBy, actor.id)) fail('A different approving authority is required', 403);
      activated.push(await activate(transfer, state, actor, at, transaction));
    }
    return activated;
  });
}
module.exports = { TransferError, proposeTransfer, approveTransfer, rejectTransfer, activateApprovedTransfers };
