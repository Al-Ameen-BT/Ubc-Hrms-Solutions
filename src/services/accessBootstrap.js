'use strict';
const { Op } = require('sequelize');
const {
  sequelize, Organization, OrganizationBranch, OrganizationDepartment, Employee, User,
  OrganizationRole, OrganizationRolePermission, UserRoleAssignment, UserRoleBranch, UserRoleDepartment,
  EmployeeOrganizationAssignment,
} = require('../models');
const { ROLE_TEMPLATES, template } = require('./permissionCatalog');

const today = () => new Date().toISOString().slice(0, 10);
const current = at => ({ status: 'ACTIVE', effectiveFrom: { [Op.lte]: at }, [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: at } }] });

async function inOrganization(organizationId, transaction, work) {
  if (!transaction) return sequelize.transaction(t => inOrganization(organizationId, t, work));
  const organization = await Organization.findByPk(organizationId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!organization) throw new Error('Organisation not found');
  return work(organization, transaction);
}

// Never fall back from a supplied but invalid authoritative ID to legacy text.
function mappedBranch(employee, branches) {
  if (employee.branchId != null) {
    const branch = branches.find(b => b.id === employee.branchId && b.status === 'ACTIVE');
    return branch ? { branch } : { reason: 'INVALID_BRANCH' };
  }
  const labels = [['code', employee.branchCode], ['name', employee.branchName]].filter(([, value]) => value != null && value !== '');
  if (!labels.length) return { reason: 'BRANCH_REQUIRED' };
  const candidates = branches.filter(b => labels.some(([key, value]) => b[key] === value));
  if (candidates.length > 1) return { reason: 'AMBIGUOUS_BRANCH' };
  if (candidates.length !== 1 || !labels.every(([key, value]) => candidates[0][key] === value)) return { reason: 'UNMAPPED_BRANCH' };
  return candidates[0].status === 'ACTIVE' ? { branch: candidates[0] } : { reason: 'INVALID_BRANCH' };
}

async function inspect(organizationId, transaction) {
  const branches = await OrganizationBranch.findAll({ where: { organizationId }, transaction });
  const employees = await Employee.findAll({ where: { organizationId, status: 'ACTIVE' }, transaction, order: [['id', 'ASC']] });
  const users = await User.findAll({ where: { organizationId, status: 'ACTIVE' }, transaction, order: [['id', 'ASC']] });
  const departments = await OrganizationDepartment.findAll({ where: { organizationId, status: 'ACTIVE' }, transaction });
  const assignments = await UserRoleAssignment.findAll({ where: { organizationId }, transaction });
  const roles = await OrganizationRole.findAll({ where: { organizationId }, transaction });
  const baselineIds = new Set(roles.filter(r => r.isProtected && r.templateCode === 'EMPLOYEE').map(r => r.id));
  const adminIds = new Set(roles.filter(r => r.isProtected && r.templateCode === 'ORGANISATION_ADMIN').map(r => r.id));
  const primaryAssignments = await EmployeeOrganizationAssignment.findAll({ where: { organizationId, ...current(today()) }, transaction });
  const mappings = new Map(employees.map(e => {
    const mapping = mappedBranch(e, branches);
    const active = primaryAssignments.filter(a => a.employeeId === e.id);
    if (mapping.branch && active.length && (active.length !== 1 || active[0].branchId !== mapping.branch.id)) return [e.id, { reason: 'CONFLICTING_PRIMARY_ASSIGNMENT' }];
    return [e.id, mapping];
  }));
  const unresolvedEmployees = employees.filter(e => !mappings.get(e.id).branch).map(e => ({ employeeId: e.id, reason: mappings.get(e.id).reason }));
  const unlinkedAdmins = users.filter(u => u.role === 'ORG_ADMIN' && !u.employeeId && !assignments.some(a => a.userId === u.id && (!adminIds.has(a.roleId) || baselineIds.has(a.roleId))));
  // An existing protected assignment keeps its exception; an own baseline records that it was linked before.
  const bootstrap = unlinkedAdmins.find(u => assignments.some(a => a.userId === u.id && adminIds.has(a.roleId))) || unlinkedAdmins[0];
  const unresolvedUsers = [];
  const eligible = [];
  for (const user of users) {
    const employee = employees.find(e => e.id === user.employeeId);
    let reason;
    if (!user.employeeId && user.id !== bootstrap?.id) reason = 'EMPLOYEE_LINK_REQUIRED';
    else if (user.employeeId && !employee) reason = 'INVALID_EMPLOYEE_LINK';
    else if (employee && users.filter(u => u.employeeId === employee.id).length !== 1) reason = 'DUPLICATE_EMPLOYEE_LINK';
    const validEmployeeLink = Boolean(employee && !reason);
    const templateCode = User.LEGACY_ROLE_TEMPLATES[user.role];
    if (!reason && !template(templateCode)) reason = 'UNMAPPED_ROLE';
    const branch = employee && mappings.get(employee.id).branch;
    if (!reason && employee && !branch) reason = mappings.get(employee.id).reason;
    let department;
    if (!reason && templateCode === 'DEPARTMENT_HEAD') {
      department = departments.find(d => d.id === employee?.departmentId && d.branchId === branch?.id);
      if (!department) reason = 'DEPARTMENT_SCOPE_REQUIRED';
    }
    if (reason) unresolvedUsers.push({ userId: user.id, reason });
    eligible.push({ user, employee, validEmployeeLink, branch, department, templateCode, reason });
  }
  const headOffices = branches.filter(b => b.status === 'ACTIVE' && (b.unitType === 'HEAD_OFFICE' || (!b.unitType && b.isHeadOffice)));
  return { branches, employees, mappings, eligible, unresolvedEmployees, unresolvedUsers, roles, assignments, bootstrapUserId: bootstrap?.id || null, headOffices };
}

async function resolveLegacyAssignments({ organizationId, transaction }) {
  return inOrganization(organizationId, transaction, async (organization, t) => {
    if (organization.accessControlMode !== 'LEGACY') throw new Error('Bootstrap requires LEGACY access mode');
    const state = await inspect(organization.id, t);
    let mappedEmployees = 0;
    for (const branch of state.branches) {
      if (!branch.unitType) await branch.update({ unitType: branch.isHeadOffice ? 'HEAD_OFFICE' : 'BRANCH' }, { transaction: t });
    }
    for (const employee of state.employees) {
      const branch = state.mappings.get(employee.id).branch;
      if (!branch) continue;
      const existing = await EmployeeOrganizationAssignment.findAll({ where: { organizationId: organization.id, employeeId: employee.id, ...current(today()) }, transaction: t });
      if (employee.branchId == null) { await employee.update({ branchId: branch.id }, { transaction: t }); mappedEmployees++; }
      if (!existing.length) await EmployeeOrganizationAssignment.create({ organizationId: organization.id, employeeId: employee.id, branchId: branch.id, effectiveFrom: today() }, { transaction: t });
    }
    return { mappedEmployees, unresolvedEmployees: state.unresolvedEmployees, unresolvedUsers: state.unresolvedUsers, bootstrapUserId: state.bootstrapUserId };
  });
}

async function bootstrapOrganizationAccess({ organizationId, transaction }) {
  return inOrganization(organizationId, transaction, async (organization, t) => {
    // A later access-management task owns changes after activation, including revocation.
    if (organization.accessControlMode !== 'LEGACY') throw new Error('Bootstrap requires LEGACY access mode');
    let rolesCreated = 0, permissionsCreated = 0, assignmentsCreated = 0;
    const roles = new Map();
    for (const definition of ROLE_TEMPLATES) {
      const [role, created] = await OrganizationRole.findOrCreate({ where: { organizationId: organization.id, code: definition.code }, defaults: { name: definition.name, templateCode: definition.code, isProtected: true }, transaction: t });
      if (!role.isProtected || role.templateCode !== definition.code || role.status !== 'ACTIVE') throw new Error('Conflicting protected role requires administrator resolution');
      rolesCreated += Number(created);
      roles.set(definition.code, role);
      const existing = await OrganizationRolePermission.findAll({ where: { organizationId: organization.id, roleId: role.id }, transaction: t });
      if (existing.some(p => !definition.permissionCodes.includes(p.permissionCode))) throw new Error('Protected role exceeds its template ceiling');
      for (const permissionCode of definition.permissionCodes) {
        const [, added] = await OrganizationRolePermission.findOrCreate({ where: { organizationId: organization.id, roleId: role.id, permissionCode }, transaction: t });
        permissionsCreated += Number(added);
      }
    }
    const resolution = await resolveLegacyAssignments({ organizationId: organization.id, transaction: t });
    const state = await inspect(organization.id, t);
    const blockedUsers = new Set(resolution.unresolvedUsers.map(u => u.userId));
    async function assign(user, code, scopeType, branch, department) {
      const roleId = roles.get(code).id;
      let assignment = await UserRoleAssignment.findOne({ where: { organizationId: organization.id, userId: user.id, roleId, scopeType, ...current(today()) }, transaction: t });
      if (!assignment) {
        assignment = await UserRoleAssignment.create({ organizationId: organization.id, userId: user.id, roleId, scopeType, effectiveFrom: today() }, { transaction: t });
        assignmentsCreated++;
      }
      if (branch) await UserRoleBranch.findOrCreate({ where: { organizationId: organization.id, userRoleAssignmentId: assignment.id, branchId: branch.id }, transaction: t });
      if (department) await UserRoleDepartment.findOrCreate({ where: { organizationId: organization.id, userRoleAssignmentId: assignment.id, departmentId: department.id }, transaction: t });
    }
    for (const entry of state.eligible) {
      const { user, branch, department, templateCode } = entry;
      // Own records do not depend on resolving a management branch or department.
      if (entry.validEmployeeLink) await assign(user, 'EMPLOYEE', 'OWN');
      if (blockedUsers.has(user.id)) continue;
      const scopeType = template(templateCode).allowedScopes[0];
      await assign(user, templateCode, scopeType, scopeType === 'SELECTED_BRANCHES' ? branch : null, scopeType === 'DEPARTMENT' ? department : null);
    }
    return { rolesCreated, permissionsCreated, assignmentsCreated, ...resolution };
  });
}

async function accessReadiness(organizationId, { transaction, lock = false } = {}) {
  const inspectReadiness = async transaction => {
    const organization = await Organization.findByPk(organizationId, { transaction, ...(lock ? { lock: transaction.LOCK.UPDATE } : {}) });
    if (!organization) throw new Error('Organisation not found');
    const state = await inspect(organization.id, transaction);
    const blockers = [...state.unresolvedEmployees, ...state.unresolvedUsers];
    if (state.headOffices.length !== 1) blockers.push({ reason: 'EXACTLY_ONE_HEAD_OFFICE_REQUIRED' });
    const permissions = await OrganizationRolePermission.findAll({ where: { organizationId: organization.id }, transaction });
    const orgAdminRole = state.roles.find(r => r.code === 'ORGANISATION_ADMIN' && r.status === 'ACTIVE');
    if (!orgAdminRole) {
      blockers.push({ reason: 'ORG_ADMIN_ROLE_REQUIRED' });
    } else {
      const expected = template('ORGANISATION_ADMIN').permissionCodes;
      const actual = permissions.filter(p => p.roleId === orgAdminRole.id).map(p => p.permissionCode);
      if (expected.some(code => !actual.includes(code))) blockers.push({ roleId: orgAdminRole.id, reason: 'PROTECTED_PERMISSIONS_REQUIRED' });
    }
    for (const role of state.roles.filter(r => r.isProtected)) {
      const definition = template(role.templateCode);
      if (!definition) continue;
      const actual = permissions.filter(p => p.roleId === role.id).map(p => p.permissionCode);
      if (actual.some(code => !definition.permissionCodes.includes(code))) {
        blockers.push({ roleId: role.id, reason: 'TEMPLATE_CEILING_EXCEEDED' });
      }
    }
    const { PERMISSIONS } = require('./permissionCatalog');
    const validCodes = new Set(PERMISSIONS.map(p => p.code));
    for (const role of state.roles) {
      const rolePerms = permissions.filter(p => p.roleId === role.id).map(p => p.permissionCode);
      if (rolePerms.some(code => !validCodes.has(code))) {
        blockers.push({ roleId: role.id, reason: 'INVALID_PERMISSION_ASSIGNED' });
      }
      if (role.code !== 'ORGANISATION_ADMIN' && rolePerms.includes('roles.manage')) {
        blockers.push({ roleId: role.id, reason: 'ROLE_MANAGE_CANNOT_BE_DELEGATED' });
      }
    }
    const at = today();
    const active = state.assignments.filter(a => a.status === 'ACTIVE' && a.effectiveFrom <= at && (!a.effectiveTo || a.effectiveTo >= at));
    const hasAssignment = (userId, code, scopeType) => active.some(a => a.userId === userId && a.scopeType === scopeType && state.roles.some(r => r.id === a.roleId && (r.code === code || r.templateCode === code)));
    if (!state.eligible.some(e => !e.reason && hasAssignment(e.user.id, 'ORGANISATION_ADMIN', 'ORGANISATION'))) blockers.push({ reason: 'ORG_ADMIN_ASSIGNMENT_REQUIRED' });
    const branchScopes = await UserRoleBranch.findAll({ where: { organizationId: organization.id }, transaction });
    const departmentScopes = await UserRoleDepartment.findAll({ where: { organizationId: organization.id }, transaction });
    for (const entry of state.eligible) {
      if (entry.validEmployeeLink && !hasAssignment(entry.user.id, 'EMPLOYEE', 'OWN')) blockers.push({ userId: entry.user.id, reason: 'OWN_BASELINE_REQUIRED' });
      if (entry.reason) continue;
      const scopeType = template(entry.templateCode).allowedScopes[0];
      if (!hasAssignment(entry.user.id, entry.templateCode, scopeType)) blockers.push({ userId: entry.user.id, reason: 'LEGACY_ROLE_ASSIGNMENT_REQUIRED' });
      else if (['SELECTED_BRANCHES', 'DEPARTMENT'].includes(scopeType)) {
        const scoped = active.filter(a => a.userId === entry.user.id && state.roles.some(r => r.id === a.roleId && (r.code === entry.templateCode || r.templateCode === entry.templateCode)) && a.scopeType === scopeType);
        const hasScope = scoped.some(a => scopeType === 'SELECTED_BRANCHES'
          ? branchScopes.some(s => s.userRoleAssignmentId === a.id && s.branchId === entry.branch?.id)
          : departmentScopes.some(s => s.userRoleAssignmentId === a.id && s.departmentId === entry.department?.id));
        if (!hasScope) blockers.push({ userId: entry.user.id, reason: 'LEGACY_ROLE_SCOPE_REQUIRED' });
      }
    }
    return { ready: blockers.length === 0, accessControlMode: organization.accessControlMode, blockers, bootstrapUserId: state.bootstrapUserId, warnings: state.bootstrapUserId ? [{ userId: state.bootstrapUserId, reason: 'BOOTSTRAP_ADMIN_UNLINKED' }] : [] };
  };
  return transaction ? inspectReadiness(transaction) : sequelize.transaction(inspectReadiness);
}

module.exports = { bootstrapOrganizationAccess, resolveLegacyAssignments, accessReadiness };
