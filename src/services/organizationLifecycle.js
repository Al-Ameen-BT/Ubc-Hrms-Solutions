'use strict';

const { Op } = require('sequelize');
const {
  sequelize, Organization, OrganizationBranch: Branch, OrganizationDepartment: Department,
  OrganizationPosition: Position, Employee, User, EmployeeOrganizationAssignment: Assignment,
  OrganizationResponsibilityAssignment: Responsibility, OrganizationRole: Role,
  UserRoleAssignment, UserRoleBranch, UserRoleDepartment, AuditLog,
  BootstrapAdminHandover,
} = require('../models');
const { todayIST } = require('./orgAccess');
const { invalidateUserAccess } = require('./userAdmin');

class LifecycleError extends Error {
  constructor(message, status = 400, code = 'LIFECYCLE_INVALID') {
    super(message); this.status = status; this.code = code;
  }
}

const same = (a, b) => a != null && b != null && String(a) === String(b);
const validId = (value, label) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new LifecycleError(`${label} must be a valid identifier`);
  return number;
};
const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new LifecycleError('Effective date must use YYYY-MM-DD');
  return value;
};
const previousDate = value => new Date(Date.parse(`${value}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
const currentWhere = at => ({ status: 'ACTIVE', effectiveFrom: { [Op.lte]: at }, [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: at } }] });

async function tenantRow(Model, value, organizationId, transaction, active = false) {
  const record = await Model.findOne({ where: { id: validId(value, Model.name), organizationId }, transaction, lock: transaction.LOCK.UPDATE });
  if (!record) throw new LifecycleError(`${Model.name} not found`, 404, 'NOT_FOUND');
  if (active && record.status !== 'ACTIVE') throw new LifecycleError(`${Model.name} must be active`, 409, 'RECORD_INACTIVE');
  return record;
}

async function locked(options, work) {
  if (!options.transaction) return sequelize.transaction(transaction => locked({ ...options, transaction }, work));
  const organizationId = validId(options.organizationId, 'Organisation');
  const organization = await Organization.findByPk(organizationId, { transaction: options.transaction, lock: options.transaction.LOCK.UPDATE });
  if (!organization) throw new LifecycleError('Organisation not found', 404, 'NOT_FOUND');
  if (!options.actor || options.actor.role !== 'SUPER_ADMIN' && !same(options.actor.organizationId, organizationId)) throw new LifecycleError('Organisation access denied', 403, 'FORBIDDEN');
  return work({ ...options, organizationId, organization });
}

async function log(o, action, targetType, targetId, details) {
  await AuditLog.create({ organizationId: o.organizationId, actorUserId: o.actor.id, actorEmail: o.actor.email || null, action, targetType, targetId: String(targetId), details }, { transaction: o.transaction });
}

async function assertNotLastAdministrator(o, user) {
  const protectedRoles = await Role.findAll({ where: { organizationId: o.organizationId, templateCode: 'ORGANISATION_ADMIN', isProtected: true, status: 'ACTIVE' }, attributes: ['id'], transaction: o.transaction });
  const protectedIds = protectedRoles.map(role => role.id);
  const hasProtectedAssignment = protectedIds.length && await UserRoleAssignment.count({ where: { organizationId: o.organizationId, userId: user.id, roleId: protectedIds, status: 'ACTIVE' }, transaction: o.transaction });
  if (hasProtectedAssignment) {
    const otherAssignments = await UserRoleAssignment.findAll({ where: { organizationId: o.organizationId, roleId: protectedIds, status: 'ACTIVE', userId: { [Op.ne]: user.id } }, attributes: ['userId'], transaction: o.transaction });
    const activeSuccessors = await User.count({ where: { organizationId: o.organizationId, id: [...new Set(otherAssignments.map(row => row.userId))], status: 'ACTIVE', employeeId: { [Op.not]: null } }, transaction: o.transaction });
    if (!activeSuccessors) throw new LifecycleError('Assign and activate another protected Organisation Admin before archiving this account', 409, 'LAST_ORGANISATION_ADMIN');
  }
  if (user.role === 'ORG_ADMIN') {
    const legacyAdmins = await User.count({ where: { organizationId: o.organizationId, role: 'ORG_ADMIN', status: 'ACTIVE', id: { [Op.ne]: user.id } }, transaction: o.transaction });
    if (!legacyAdmins && !hasProtectedAssignment) throw new LifecycleError('Assign another Organisation Admin before archiving this account', 409, 'LAST_ORGANISATION_ADMIN');
  }
}

async function archiveUserLocked(o, user, { allowActor = false, reason = 'administrative archive' } = {}) {
  if (!allowActor && same(user.id, o.actor.id)) throw new LifecycleError('You cannot archive your own account through the standard deletion action', 400, 'SELF_ARCHIVE_BLOCKED');
  const assignments = await UserRoleAssignment.findAll({ where: { organizationId: o.organizationId, userId: user.id, status: 'ACTIVE' }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
  if (user.status === 'INACTIVE' && !assignments.length) return { user, changed: false };
  await assertNotLastAdministrator(o, user);
  await UserRoleAssignment.update({ status: 'INACTIVE' }, { where: { id: assignments.map(row => row.id) }, transaction: o.transaction });
  if (user.status !== 'INACTIVE') await user.update({ status: 'INACTIVE' }, { transaction: o.transaction });
  await invalidateUserAccess([user.id], { transaction: o.transaction, actor: o.actor, reason: 'user.archived' });
  await log(o, 'user.archive', 'user', user.id, { email: user.email, employeeId: user.employeeId, reason, endedRoleAssignmentIds: assignments.map(row => row.id) });
  return { user, changed: true };
}

async function archiveUser(options) {
  return locked(options, async o => archiveUserLocked(o, await tenantRow(User, o.userId, o.organizationId, o.transaction), { reason: o.reason }));
}

async function archiveEmployee(options) {
  return locked(options, async o => {
    const employee = await tenantRow(Employee, o.employeeId, o.organizationId, o.transaction);
    if (employee.status === 'INACTIVE') return { employee, archivedUsers: 0, changed: false };
    const linkedUsers = await User.findAll({ where: { organizationId: o.organizationId, employeeId: employee.id }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
    for (const user of linkedUsers) await archiveUserLocked(o, user, { reason: 'linked employee archived' });
    const assignments = await Assignment.findAll({ where: { organizationId: o.organizationId, employeeId: employee.id, status: 'ACTIVE' }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
    await Assignment.update({ status: 'INACTIVE' }, { where: { id: assignments.map(row => row.id) }, transaction: o.transaction });
    await Responsibility.update({ status: 'INACTIVE' }, { where: { organizationId: o.organizationId, employeeId: employee.id, status: 'ACTIVE' }, transaction: o.transaction });
    await employee.update({ status: 'INACTIVE' }, { transaction: o.transaction });
    await log(o, 'employee.archive', 'employee', employee.id, { empCode: employee.empCode, linkedUserIds: linkedUsers.map(user => user.id), endedAssignmentIds: assignments.map(row => row.id) });
    return { employee, archivedUsers: linkedUsers.filter(user => user.status === 'INACTIVE').length, changed: true };
  });
}

async function closeAndReplaceAssignment(o, assignment, destination, effectiveDate) {
  if (assignment.effectiveFrom < effectiveDate) await assignment.update({ effectiveTo: previousDate(effectiveDate) }, { transaction: o.transaction });
  else await assignment.update({ status: 'INACTIVE' }, { transaction: o.transaction });
  return Assignment.create({
    organizationId: o.organizationId, employeeId: assignment.employeeId,
    branchId: destination.branchId, departmentId: destination.departmentId || null,
    positionId: destination.positionId || null, effectiveFrom: effectiveDate,
    effectiveTo: assignment.effectiveTo && assignment.effectiveTo >= effectiveDate ? assignment.effectiveTo : null,
    assignedBy: o.actor.id, status: 'ACTIVE',
  }, { transaction: o.transaction });
}

async function archiveDepartment(options) {
  return locked(options, async o => {
    const effectiveDate = validDate(o.effectiveDate || todayIST());
    const department = await tenantRow(Department, o.departmentId, o.organizationId, o.transaction);
    if (department.status === 'INACTIVE') return { department, movedEmployees: 0, changed: false };
    const assignments = await Assignment.findAll({ where: { organizationId: o.organizationId, departmentId: department.id, ...currentWhere(effectiveDate) }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
    for (const assignment of assignments) {
      await closeAndReplaceAssignment(o, assignment, { branchId: assignment.branchId }, effectiveDate);
      await Employee.update({ departmentId: null, department: null, positionId: null, designation: null }, { where: { id: assignment.employeeId, organizationId: o.organizationId }, transaction: o.transaction });
    }
    const positions = await Position.findAll({ where: { organizationId: o.organizationId, departmentId: department.id, status: 'ACTIVE' }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
    await Position.update({ reportsToPositionId: null }, { where: { organizationId: o.organizationId, reportsToPositionId: positions.map(row => row.id), status: 'ACTIVE' }, transaction: o.transaction });
    await Position.update({ status: 'INACTIVE' }, { where: { id: positions.map(row => row.id) }, transaction: o.transaction });
    const departmentScopes = await UserRoleDepartment.findAll({ where: { organizationId: o.organizationId, departmentId: department.id }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
    const affectedUsers = [];
    for (const scope of departmentScopes) {
      const assignment = await UserRoleAssignment.findByPk(scope.userRoleAssignmentId, { transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
      const remaining = await UserRoleDepartment.count({ where: { organizationId: o.organizationId, userRoleAssignmentId: scope.userRoleAssignmentId, id: { [Op.ne]: scope.id } }, transaction: o.transaction });
      if (!remaining && assignment?.status === 'ACTIVE') await assignment.update({ status: 'INACTIVE' }, { transaction: o.transaction });
      await scope.destroy({ transaction: o.transaction });
      if (assignment) affectedUsers.push(assignment.userId);
    }
    await department.update({ status: 'INACTIVE' }, { transaction: o.transaction });
    if (affectedUsers.length) await invalidateUserAccess(affectedUsers, { transaction: o.transaction, actor: o.actor, reason: 'department.archived' });
    await log(o, 'org.department.archive', 'organization_department', department.id, { effectiveDate, employeeIds: assignments.map(row => row.employeeId), positionIds: positions.map(row => row.id), endedDepartmentScopeIds: departmentScopes.map(row => row.id), affectedUserIds: [...new Set(affectedUsers)] });
    return { department, movedEmployees: assignments.length, deactivatedPositions: positions.length, changed: true };
  });
}

async function branchData(o, source, destination) {
  const [departments, destinationDepartments, positions, destinationPositions, assignments, scopes] = await Promise.all([
    Department.findAll({ where: { organizationId: o.organizationId, branchId: source.id, status: 'ACTIVE' }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE }),
    Department.findAll({ where: { organizationId: o.organizationId, branchId: destination.id, status: 'ACTIVE' }, transaction: o.transaction }),
    Position.findAll({ where: { organizationId: o.organizationId, branchId: source.id, status: 'ACTIVE' }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE }),
    Position.findAll({ where: { organizationId: o.organizationId, branchId: destination.id, status: 'ACTIVE' }, transaction: o.transaction }),
    Assignment.findAll({ where: { organizationId: o.organizationId, branchId: source.id, ...currentWhere(o.effectiveDate || todayIST()) }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE }),
    UserRoleBranch.findAll({ where: { organizationId: o.organizationId, branchId: source.id }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE }),
  ]);
  return { departments, destinationDepartments, positions, destinationPositions, assignments, scopes };
}

async function previewBranchMerge(options) {
  return locked(options, async o => {
    const source = await tenantRow(Branch, o.sourceBranchId, o.organizationId, o.transaction, true);
    const destination = await tenantRow(Branch, o.destinationBranchId, o.organizationId, o.transaction, true);
    if (same(source.id, destination.id)) throw new LifecycleError('Source and destination branches must be different');
    if (source.isHeadOffice || source.unitType === 'HEAD_OFFICE') throw new LifecycleError('Head Office cannot be merged or retired', 409, 'HEAD_OFFICE_PROTECTED');
    const data = await branchData(o, source, destination);
    return {
      source: { id: source.id, code: source.code, name: source.name }, destination: { id: destination.id, code: destination.code, name: destination.name },
      counts: { employees: data.assignments.length, departments: data.departments.length, positions: data.positions.length, roleScopes: data.scopes.length },
      conflicts: {
        departments: data.departments.filter(row => data.destinationDepartments.some(target => target.code === row.code || target.name.toLowerCase() === row.name.toLowerCase())).map(row => ({ id: row.id, code: row.code, name: row.name })),
        positions: data.positions.filter(row => data.destinationPositions.some(target => target.code === row.code)).map(row => ({ id: row.id, code: row.code, name: row.name })),
      },
    };
  });
}

function mappingId(map, id) {
  const value = map?.[String(id)] ?? map?.[id];
  return value == null || value === '' ? null : validId(value, 'Mapping');
}

async function mergeBranch(options) {
  return locked(options, async o => {
    const effectiveDate = validDate(o.effectiveDate || todayIST());
    if (!['ARCHIVE', 'RETAIN_AS_ADDITIONAL'].includes(o.geofenceAction || 'ARCHIVE')) throw new LifecycleError('Invalid geofence action');
    const source = await tenantRow(Branch, o.sourceBranchId, o.organizationId, o.transaction, true);
    const destination = await tenantRow(Branch, o.destinationBranchId, o.organizationId, o.transaction, true);
    if (same(source.id, destination.id)) throw new LifecycleError('Source and destination branches must be different');
    if (source.isHeadOffice || source.unitType === 'HEAD_OFFICE') throw new LifecycleError('Head Office cannot be merged or retired', 409, 'HEAD_OFFICE_PROTECTED');
    const data = await branchData({ ...o, effectiveDate }, source, destination);
    const deptMap = new Map();
    for (const department of data.departments) {
      let targetId = mappingId(o.departmentMappings, department.id);
      const conflict = data.destinationDepartments.find(target => target.code === department.code || target.name.toLowerCase() === department.name.toLowerCase());
      if (conflict && !targetId) throw new LifecycleError(`Map conflicting department ${department.code} before merging`, 409, 'MAPPING_REQUIRED');
      if (targetId) {
        const target = await tenantRow(Department, targetId, o.organizationId, o.transaction, true);
        if (!same(target.branchId, destination.id)) throw new LifecycleError('Mapped department must belong to the destination branch');
      } else {
        const created = await Department.create({ organizationId: o.organizationId, branchId: destination.id, code: department.code, name: department.name, displayOrder: department.displayOrder, status: 'ACTIVE' }, { transaction: o.transaction });
        targetId = created.id;
      }
      deptMap.set(String(department.id), targetId);
    }
    const positionMap = new Map();
    const clonedPositionIds = new Set();
    for (const position of data.positions) {
      let targetId = mappingId(o.positionMappings, position.id);
      const conflict = data.destinationPositions.find(target => target.code === position.code);
      if (conflict && !targetId) throw new LifecycleError(`Map conflicting position ${position.code} before merging`, 409, 'MAPPING_REQUIRED');
      if (targetId) {
        const target = await tenantRow(Position, targetId, o.organizationId, o.transaction, true);
        if (!same(target.branchId, destination.id)) throw new LifecycleError('Mapped position must belong to the destination branch');
      } else {
        const created = await Position.create({ organizationId: o.organizationId, branchId: destination.id, departmentId: deptMap.get(String(position.departmentId)), code: position.code, name: position.name, postCadreId: position.postCadreId, capacity: position.capacity, leadershipVisible: false, status: 'ACTIVE' }, { transaction: o.transaction });
        targetId = created.id;
        clonedPositionIds.add(String(position.id));
      }
      positionMap.set(String(position.id), targetId);
    }
    // Restore reporting lines only after every target position is known. Explicitly
    // mapped destination positions keep their existing hierarchy.
    for (const position of data.positions) {
      if (!clonedPositionIds.has(String(position.id)) || !position.reportsToPositionId) continue;
      const reportsToPositionId = positionMap.get(String(position.reportsToPositionId)) || position.reportsToPositionId;
      await Position.update({ reportsToPositionId }, { where: { id: positionMap.get(String(position.id)), organizationId: o.organizationId }, transaction: o.transaction });
    }
    for (const assignment of data.assignments) {
      const destinationPlacement = { branchId: destination.id, departmentId: assignment.departmentId ? deptMap.get(String(assignment.departmentId)) : null, positionId: assignment.positionId ? positionMap.get(String(assignment.positionId)) : null };
      await closeAndReplaceAssignment(o, assignment, destinationPlacement, effectiveDate);
      const department = destinationPlacement.departmentId && await Department.findByPk(destinationPlacement.departmentId, { transaction: o.transaction });
      const position = destinationPlacement.positionId && await Position.findByPk(destinationPlacement.positionId, { transaction: o.transaction });
      await Employee.update({ branchId: destination.id, branchCode: destination.code, branchName: destination.name, departmentId: destinationPlacement.departmentId, department: department?.name || null, positionId: destinationPlacement.positionId, designation: position?.name || null }, { where: { id: assignment.employeeId }, transaction: o.transaction });
    }
    const affectedUsers = [];
    const roleScopeChanges = [];
    for (const scope of data.scopes) {
      const duplicate = await UserRoleBranch.findOne({ where: { organizationId: o.organizationId, userRoleAssignmentId: scope.userRoleAssignmentId, branchId: destination.id }, transaction: o.transaction });
      roleScopeChanges.push({ type: 'BRANCH', scopeId: scope.id, assignmentId: scope.userRoleAssignmentId, fromId: source.id, toId: destination.id, deduplicated: !!duplicate });
      if (duplicate) await scope.destroy({ transaction: o.transaction }); else await scope.update({ branchId: destination.id }, { transaction: o.transaction });
      const roleAssignment = await UserRoleAssignment.findByPk(scope.userRoleAssignmentId, { transaction: o.transaction });
      if (roleAssignment) affectedUsers.push(roleAssignment.userId);
    }
    for (const [sourceDepartmentId, destinationDepartmentId] of deptMap) {
      const scopes = await UserRoleDepartment.findAll({ where: { organizationId: o.organizationId, departmentId: sourceDepartmentId }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
      for (const scope of scopes) {
        const duplicate = await UserRoleDepartment.findOne({ where: { organizationId: o.organizationId, userRoleAssignmentId: scope.userRoleAssignmentId, departmentId: destinationDepartmentId }, transaction: o.transaction });
        roleScopeChanges.push({ type: 'DEPARTMENT', scopeId: scope.id, assignmentId: scope.userRoleAssignmentId, fromId: Number(sourceDepartmentId), toId: destinationDepartmentId, deduplicated: !!duplicate });
        if (duplicate) await scope.destroy({ transaction: o.transaction }); else await scope.update({ departmentId: destinationDepartmentId }, { transaction: o.transaction });
        const roleAssignment = await UserRoleAssignment.findByPk(scope.userRoleAssignmentId, { transaction: o.transaction });
        if (roleAssignment) affectedUsers.push(roleAssignment.userId);
      }
    }
    await Responsibility.update({ branchId: destination.id }, { where: { organizationId: o.organizationId, branchId: source.id, status: 'ACTIVE' }, transaction: o.transaction });
    await Position.update({ status: 'INACTIVE' }, { where: { id: data.positions.map(row => row.id) }, transaction: o.transaction });
    await Department.update({ status: 'INACTIVE' }, { where: { id: data.departments.map(row => row.id) }, transaction: o.transaction });
    await source.update({ status: 'INACTIVE' }, { transaction: o.transaction });
    const linkedUsers = await User.findAll({ where: { organizationId: o.organizationId, employeeId: data.assignments.map(row => row.employeeId), status: 'ACTIVE' }, attributes: ['id'], transaction: o.transaction });
    const invalidate = [...new Set([...affectedUsers, ...linkedUsers.map(user => user.id)])];
    if (invalidate.length) await invalidateUserAccess(invalidate, { transaction: o.transaction, actor: o.actor, reason: 'branch.merged' });
    await log(o, 'org.branch.merge', 'organization_branch', source.id, { destinationBranchId: destination.id, effectiveDate, geofenceAction: o.geofenceAction || 'ARCHIVE', employeeIds: data.assignments.map(row => row.employeeId), departmentMappings: Object.fromEntries(deptMap), positionMappings: Object.fromEntries(positionMap), roleScopeChanges, affectedUserIds: invalidate });
    return { sourceBranchId: source.id, destinationBranchId: destination.id, movedEmployees: data.assignments.length, affectedUsers: invalidate.length };
  });
}

async function ensureHoldingBranch(o) {
  const [branch] = await Branch.findOrCreate({
    where: { organizationId: o.organizationId, code: '__STANDALONE__' },
    defaults: { organizationId: o.organizationId, number: '__STANDALONE__', code: '__STANDALONE__', name: 'Unassigned / Standalone', unitType: 'BRANCH', status: 'ACTIVE', displayOrder: 999999 },
    transaction: o.transaction,
  });
  if (branch.status !== 'ACTIVE') await branch.update({ status: 'ACTIVE' }, { transaction: o.transaction });
  return branch;
}

async function retireBranch(options) {
  return locked(options, async o => {
    const effectiveDate = validDate(o.effectiveDate || todayIST());
    const source = await tenantRow(Branch, o.branchId, o.organizationId, o.transaction, true);
    if (source.isHeadOffice || source.unitType === 'HEAD_OFFICE') throw new LifecycleError('Head Office cannot be merged or retired', 409, 'HEAD_OFFICE_PROTECTED');
    const destination = o.useStandalone
      ? await ensureHoldingBranch(o)
      : await tenantRow(Branch, o.destinationBranchId, o.organizationId, o.transaction, true);
    if (same(source.id, destination.id)) throw new LifecycleError('Choose a different destination branch');
    const data = await branchData({ ...o, effectiveDate }, source, destination);
    const affectedUsers = [];
    const roleScopeChanges = [];
    for (const assignment of data.assignments) {
      await closeAndReplaceAssignment(o, assignment, { branchId: destination.id }, effectiveDate);
      await Employee.update({ branchId: destination.id, branchCode: destination.code, branchName: destination.name, departmentId: null, department: null, positionId: null, designation: null }, { where: { id: assignment.employeeId }, transaction: o.transaction });
    }
    for (const scope of data.scopes) {
      const duplicate = await UserRoleBranch.findOne({ where: { organizationId: o.organizationId, userRoleAssignmentId: scope.userRoleAssignmentId, branchId: destination.id }, transaction: o.transaction });
      roleScopeChanges.push({ type: 'BRANCH', scopeId: scope.id, assignmentId: scope.userRoleAssignmentId, fromId: source.id, toId: destination.id, deduplicated: !!duplicate });
      if (duplicate) await scope.destroy({ transaction: o.transaction }); else await scope.update({ branchId: destination.id }, { transaction: o.transaction });
      const roleAssignment = await UserRoleAssignment.findByPk(scope.userRoleAssignmentId, { transaction: o.transaction });
      if (roleAssignment) affectedUsers.push(roleAssignment.userId);
    }
    const sourceDepartmentIds = data.departments.map(row => row.id);
    const departmentScopes = await UserRoleDepartment.findAll({ where: { organizationId: o.organizationId, departmentId: sourceDepartmentIds }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
    for (const scope of departmentScopes) {
      const roleAssignment = await UserRoleAssignment.findByPk(scope.userRoleAssignmentId, { transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
      roleScopeChanges.push({ type: 'DEPARTMENT', scopeId: scope.id, assignmentId: scope.userRoleAssignmentId, fromId: scope.departmentId, toId: null, deduplicated: false });
      await scope.destroy({ transaction: o.transaction });
      const remaining = await UserRoleDepartment.count({ where: { organizationId: o.organizationId, userRoleAssignmentId: scope.userRoleAssignmentId }, transaction: o.transaction });
      if (!remaining && roleAssignment?.status === 'ACTIVE') await roleAssignment.update({ status: 'INACTIVE' }, { transaction: o.transaction });
      if (roleAssignment) affectedUsers.push(roleAssignment.userId);
    }
    await Responsibility.update({ branchId: destination.id }, { where: { organizationId: o.organizationId, branchId: source.id, status: 'ACTIVE' }, transaction: o.transaction });
    await Position.update({ status: 'INACTIVE' }, { where: { id: data.positions.map(row => row.id) }, transaction: o.transaction });
    await Department.update({ status: 'INACTIVE' }, { where: { id: sourceDepartmentIds }, transaction: o.transaction });
    await source.update({ status: 'INACTIVE' }, { transaction: o.transaction });
    const linkedUsers = await User.findAll({ where: { organizationId: o.organizationId, employeeId: data.assignments.map(row => row.employeeId), status: 'ACTIVE' }, attributes: ['id'], transaction: o.transaction });
    const invalidate = [...new Set([...affectedUsers, ...linkedUsers.map(user => user.id)])];
    if (invalidate.length) await invalidateUserAccess(invalidate, { transaction: o.transaction, actor: o.actor, reason: 'branch.retired' });
    await log(o, 'org.branch.retire', 'organization_branch', source.id, { destinationBranchId: destination.id, standalone: !!o.useStandalone, effectiveDate, employeeIds: data.assignments.map(row => row.employeeId), roleScopeChanges, affectedUserIds: invalidate });
    return { sourceBranchId: source.id, destinationBranchId: destination.id, standalone: !!o.useStandalone, movedEmployees: data.assignments.length, affectedUsers: invalidate.length };
  });
}

async function beginBootstrapHandover(options) {
  return locked(options, async o => {
    const bootstrap = await tenantRow(User, o.actor.id, o.organizationId, o.transaction, true);
    if (bootstrap.employeeId != null || bootstrap.role !== 'ORG_ADMIN') throw new LifecycleError('Only the protected unlinked bootstrap Organisation Admin can start this handover', 409, 'NOT_BOOTSTRAP_ADMIN');
    const successor = await tenantRow(User, o.successorUserId, o.organizationId, o.transaction, true);
    if (!successor.employeeId) throw new LifecycleError('The successor must be linked to an active employee', 409, 'SUCCESSOR_LINK_REQUIRED');
    await tenantRow(Employee, successor.employeeId, o.organizationId, o.transaction, true);
    if (same(successor.id, bootstrap.id)) throw new LifecycleError('Choose another user as successor');
    await BootstrapAdminHandover.update({ status: 'CANCELLED' }, { where: { organizationId: o.organizationId, bootstrapUserId: bootstrap.id, status: 'PENDING' }, transaction: o.transaction });
    const handover = await BootstrapAdminHandover.create({ organizationId: o.organizationId, bootstrapUserId: bootstrap.id, successorUserId: successor.id, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }, { transaction: o.transaction });
    await log(o, 'org.bootstrap_handover.begin', 'bootstrap_admin_handover', handover.id, { bootstrapUserId: bootstrap.id, successorUserId: successor.id, expiresAt: handover.expiresAt });
    return handover;
  });
}

async function acceptBootstrapHandover(options) {
  return locked(options, async o => {
    const handover = await tenantRow(BootstrapAdminHandover, o.handoverId, o.organizationId, o.transaction);
    if (handover.status !== 'PENDING') throw new LifecycleError('This handover is no longer pending', 409, 'HANDOVER_NOT_PENDING');
    if (new Date(handover.expiresAt).getTime() <= Date.now()) {
      await handover.update({ status: 'EXPIRED' }, { transaction: o.transaction });
      throw new LifecycleError('This handover has expired', 409, 'HANDOVER_EXPIRED');
    }
    if (!same(handover.successorUserId, o.actor.id)) throw new LifecycleError('Only the selected successor can accept this handover', 403, 'FORBIDDEN');
    const successor = await tenantRow(User, handover.successorUserId, o.organizationId, o.transaction, true);
    if (!successor.employeeId) throw new LifecycleError('The successor must remain linked to an active employee', 409, 'SUCCESSOR_LINK_REQUIRED');
    await tenantRow(Employee, successor.employeeId, o.organizationId, o.transaction, true);
    const bootstrap = await tenantRow(User, handover.bootstrapUserId, o.organizationId, o.transaction, true);
    const adminRole = await Role.findOne({ where: { organizationId: o.organizationId, code: 'ORGANISATION_ADMIN', templateCode: 'ORGANISATION_ADMIN', isProtected: true, status: 'ACTIVE' }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
    if (!adminRole) throw new LifecycleError('Protected Organisation Admin role is unavailable', 409, 'ADMIN_ROLE_REQUIRED');
    const existing = await UserRoleAssignment.findOne({ where: { organizationId: o.organizationId, userId: successor.id, roleId: adminRole.id, scopeType: 'ORGANISATION', status: 'ACTIVE' }, transaction: o.transaction });
    if (!existing) await UserRoleAssignment.create({ organizationId: o.organizationId, userId: successor.id, roleId: adminRole.id, scopeType: 'ORGANISATION', effectiveFrom: todayIST(), assignedBy: bootstrap.id, status: 'ACTIVE' }, { transaction: o.transaction });
    await successor.update({ role: 'ORG_ADMIN' }, { transaction: o.transaction });
    await archiveUserLocked(o, bootstrap, { allowActor: true, reason: 'bootstrap administrator handover accepted' });
    await invalidateUserAccess([successor.id], { transaction: o.transaction, actor: successor, reason: 'bootstrap-handover.accepted' });
    await handover.update({ status: 'ACCEPTED', acceptedAt: new Date() }, { transaction: o.transaction });
    await log(o, 'org.bootstrap_handover.accept', 'bootstrap_admin_handover', handover.id, { bootstrapUserId: bootstrap.id, successorUserId: successor.id });
    return handover;
  });
}

async function listBootstrapHandovers(options) {
  return locked(options, async o => BootstrapAdminHandover.findAll({ where: { organizationId: o.organizationId, [Op.or]: [{ bootstrapUserId: o.actor.id }, { successorUserId: o.actor.id }] }, order: [['id', 'DESC']], transaction: o.transaction }));
}

module.exports = { LifecycleError, archiveUser, archiveEmployee, archiveDepartment, previewBranchMerge, mergeBranch, retireBranch, beginBootstrapHandover, acceptBootstrapHandover, listBootstrapHandovers };
