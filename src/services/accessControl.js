'use strict';
const { Op } = require('sequelize');
const models = require('../models');
const { User, Organization, Employee, OrganizationBranch, OrganizationDepartment, OrganizationRole, OrganizationRolePermission, UserRoleAssignment, UserRoleBranch, UserRoleDepartment } = models;
const { permission, template } = require('./permissionCatalog');
const { checkOrgAccess, todayIST } = require('./orgAccess');
const { sameId, matchesScope } = require('./organizationAccessPolicy');

const BOOTSTRAP_MODULES = ['structure', 'branches', 'departments', 'positions', 'assignments', 'settings', 'roles', 'users', 'audit'];
const bootstrapPermission = code => BOOTSTRAP_MODULES.includes(code.split('.')[0]) || ['people.view', 'people.create', 'people.edit'].includes(code);
const current = at => ({ status: 'ACTIVE', effectiveFrom: { [Op.lte]: at }, [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: at } }] });
const unique = values => [...new Set(values)].sort((a, b) => a - b);

async function bootstrapState(user, date, transaction) {
  if (user.employeeId != null || user.role !== 'ORG_ADMIN') return { bootstrap: false, protectedAssignment: false };
  const adminRoles = await OrganizationRole.findAll({ where: { organizationId: user.organizationId, code: 'ORGANISATION_ADMIN', templateCode: 'ORGANISATION_ADMIN', isProtected: true }, transaction });
  const historicalAdmin = await UserRoleAssignment.count({ where: { organizationId: user.organizationId, userId: user.id, roleId: { [Op.in]: adminRoles.map(r => r.id) } }, transaction });
  const adminAssignments = await UserRoleAssignment.findAll({ where: { organizationId: user.organizationId, roleId: { [Op.in]: adminRoles.filter(r => r.status === 'ACTIVE').map(r => r.id) }, scopeType: 'ORGANISATION', ...current(date) }, transaction });
  const candidates = await User.findAll({ where: { organizationId: user.organizationId, id: { [Op.in]: adminAssignments.map(a => a.userId) }, employeeId: null, role: 'ORG_ADMIN', status: 'ACTIVE' }, attributes: ['id'], transaction });
  const ownRoles = await OrganizationRole.findAll({ where: { organizationId: user.organizationId, templateCode: 'EMPLOYEE' }, attributes: ['id'], transaction });
  const priorLink = await UserRoleAssignment.count({ where: { organizationId: user.organizationId, userId: user.id, roleId: { [Op.in]: ownRoles.map(r => r.id) } }, transaction });
  return {
    protectedAssignment: historicalAdmin > 0,
    bootstrap: candidates.length === 1 && sameId(candidates[0].id, user.id) && priorLink === 0,
  };
}

async function effectiveAccess(userId, at = todayIST(), transaction) {
  const date = at instanceof Date ? at.toISOString().slice(0, 10) : at;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new TypeError('Invalid access date');
  const access = { userId, organizationId: null, employeeId: null, accessControlMode: null, grants: [], permissionCodes: [], scopeSummary: { own: false, organization: false, branchIds: [], departmentIds: [] }, activeBranchIds: [], activeDepartmentIds: [] };
  const user = await User.findByPk(userId, { transaction });
  if (!user || user.status !== 'ACTIVE' || user.role === 'SUPER_ADMIN' || !user.organizationId) return access;
  access.organizationId = user.organizationId;
  const organization = await Organization.findByPk(user.organizationId, { transaction });
  if (!checkOrgAccess(organization).ok) return access;
  access.accessControlMode = organization.accessControlMode;
  const employee = user.employeeId && await Employee.findOne({ where: { id: user.employeeId, organizationId: user.organizationId, status: 'ACTIVE' }, attributes: ['id'], transaction });
  const linked = employee && await User.count({ where: { organizationId: user.organizationId, employeeId: employee.id, status: 'ACTIVE' }, transaction }) === 1;
  if (linked) access.employeeId = employee.id;
  const branches = await OrganizationBranch.findAll({ where: { organizationId: user.organizationId, status: 'ACTIVE' }, attributes: ['id'], transaction });
  access.activeBranchIds = branches.map(b => b.id);
  const departments = await OrganizationDepartment.findAll({ where: { organizationId: user.organizationId, status: 'ACTIVE', branchId: { [Op.in]: access.activeBranchIds } }, attributes: ['id', 'branchId'], transaction });
  access.activeDepartmentIds = departments.map(d => d.id);
  function grant(code, scope, branchIds = [], departmentIds = []) {
    access.grants.push({ action: code, scope, branchIds, departmentIds });
  }
  const { bootstrap, protectedAssignment } = linked ? { bootstrap: false, protectedAssignment: false } : await bootstrapState(user, date, transaction);
  if (organization.accessControlMode === 'LEGACY') {
    const definition = template(User.LEGACY_ROLE_TEMPLATES[user.role]);
    // Legacy routes use tenant-wide management; narrower template scopes bind after activation.
    if (definition) for (const code of definition.permissionCodes) {
      if (protectedAssignment && (!bootstrap || !bootstrapPermission(code))) continue;
      if (permission(code).allowedScopes.includes('OWN') && definition.code === 'EMPLOYEE') {
        if (linked) grant(code, 'OWN');
      } else grant(code, 'ORGANISATION');
    }
  } else if (organization.accessControlMode === 'PERMISSIONS') {
    const assignments = await UserRoleAssignment.findAll({ where: { organizationId: user.organizationId, userId: user.id, ...current(date) }, transaction });
    const roles = await OrganizationRole.findAll({ where: { organizationId: user.organizationId, id: { [Op.in]: assignments.map(a => a.roleId) }, status: 'ACTIVE' }, transaction });
    const rolePermissions = await OrganizationRolePermission.findAll({ where: { organizationId: user.organizationId, roleId: { [Op.in]: roles.map(r => r.id) } }, transaction });
    const branchScopes = await UserRoleBranch.findAll({ where: { organizationId: user.organizationId, userRoleAssignmentId: { [Op.in]: assignments.map(a => a.id) }, branchId: { [Op.in]: access.activeBranchIds } }, transaction });
    const departmentScopes = await UserRoleDepartment.findAll({ where: { organizationId: user.organizationId, userRoleAssignmentId: { [Op.in]: assignments.map(a => a.id) }, departmentId: { [Op.in]: access.activeDepartmentIds } }, transaction });
    if (linked || bootstrap) for (const assignment of assignments) {
      const role = roles.find(r => sameId(r.id, assignment.roleId));
      const definition = role && template(role.templateCode);
      if (!definition || !definition.allowedScopes.includes(assignment.scopeType)) continue;
      if (bootstrap && !(role.isProtected && role.code === 'ORGANISATION_ADMIN' && role.templateCode === 'ORGANISATION_ADMIN')) continue;
      const branchIds = unique(branchScopes.filter(s => sameId(s.userRoleAssignmentId, assignment.id)).map(s => s.branchId));
      const departmentIds = unique(departmentScopes.filter(s => sameId(s.userRoleAssignmentId, assignment.id)).map(s => s.departmentId));
      if (assignment.scopeType === 'SELECTED_BRANCHES' && !branchIds.length || assignment.scopeType === 'DEPARTMENT' && !departmentIds.length) continue;
      for (const p of rolePermissions.filter(p => sameId(p.roleId, role.id))) {
        if (!definition.permissionCodes.includes(p.permissionCode) || !permission(p.permissionCode)?.allowedScopes.includes(assignment.scopeType)) continue;
        if (bootstrap && !bootstrapPermission(p.permissionCode)) continue;
        grant(p.permissionCode, assignment.scopeType, branchIds, departmentIds);
      }
    }
  }
  // The own-record baseline is protected and independent of operational role copies.
  if (linked) for (const code of template('EMPLOYEE').permissionCodes) grant(code, 'OWN');
  access.permissionCodes = [...new Set(access.grants.map(g => g.action))].sort();
  access.scopeSummary = {
    own: access.grants.some(g => g.scope === 'OWN'),
    organization: access.grants.some(g => g.scope === 'ORGANISATION'),
    branchIds: unique(access.grants.flatMap(g => g.branchIds)),
    departmentIds: unique(access.grants.flatMap(g => g.departmentIds)),
  };
  return access;
}

// Model names are the shared resolver/query contract; unknown layouts fail closed.
function resourceModel(resourceType) {
  const model = models[resourceType];
  return model?.rawAttributes?.organizationId ? model : null;
}
function typeOf(resource) { return resource.resourceType || resource.constructor?.name; }
function validResource(access, resource, model) {
  if (!model || !sameId(access.organizationId, resource.organizationId)) return false;
  if (access.accessControlMode === 'LEGACY') return true;
  if (model === OrganizationBranch) return access.activeBranchIds.some(id => sameId(id, resource.id));
  if (model === OrganizationDepartment) return access.activeDepartmentIds.some(id => sameId(id, resource.id));
  if (model.rawAttributes.branchId && resource.branchId != null && !access.activeBranchIds.some(id => sameId(id, resource.branchId))) return false;
  if (model.rawAttributes.departmentId && resource.departmentId != null && !access.activeDepartmentIds.some(id => sameId(id, resource.departmentId))) return false;
  return true;
}
function guardFields(permissionCode, resourceType) {
  const guardrails = permission(permissionCode)?.guardrails || [];
  const fields = [];
  if (guardrails.includes('PREPARER_CANNOT_APPROVE') || guardrails.includes('PREPARER_CANNOT_PAY')) {
    if (resourceType === 'PayrollRun') fields.push('processedByUserId');
    else if (['ExpenseClaim', 'FinancialChangeProposal'].includes(resourceType)) fields.push('preparedBy');
    else return null;
  }
  if (guardrails.includes('APPROVER_CANNOT_PAY')) {
    if (resourceType === 'PayrollRun') fields.push('approvedByUserId');
    else if (resourceType === 'ExpenseClaim') fields.push('decidedBy');
    else return null;
  }
  if (resourceType === 'ExpenseClaim' && ['expenses.prepare', 'expenses.approve', 'payments.pay'].includes(permissionCode)) fields.push('submittedBy');
  return fields;
}
function hasProtectedConflict(permissionCode, resource, actorId) {
  const fields = guardFields(permissionCode, typeOf(resource));
  return !actorId || !fields || fields.some(field => !Object.hasOwn(resource.dataValues || resource, field) || sameId(resource[field], actorId));
}
function can(access, permissionCode, resource) {
  const grants = access?.grants?.filter(g => g.action === permissionCode) || [];
  if (!permission(permissionCode) || !access?.organizationId || !grants.length) return false;
  if (resource === undefined) return true;
  if (!resource || typeof resource !== 'object') return false;
  const resourceType = typeOf(resource);
  const model = resourceModel(resourceType);
  if (!validResource(access, resource, model)) return false;
  if (hasProtectedConflict(permissionCode, resource, access.userId)) return false;
  if (permission(permissionCode).guardrails.includes('APPROVED_PAYMENT_ONLY') && resource.status !== 'APPROVED') return false;
  const employeeId = model === Employee ? resource.id : model.rawAttributes.employeeId ? resource.employeeId : null;
  const scoped = { id: employeeId, branchId: model === OrganizationBranch ? resource.id : resource.branchId, departmentId: model === OrganizationDepartment ? resource.id : resource.departmentId };
  return grants.some(g => matchesScope(access, scoped, g));
}

function scopedWhere(access, permissionCode, resourceType) {
  const model = resourceModel(resourceType);
  const deny = { id: { [Op.in]: [] } };
  if (!model || !can(access, permissionCode)) return deny;
  const clauses = [{ organizationId: access.organizationId }];
  const scopes = [];
  for (const grant of access.grants.filter(g => g.action === permissionCode)) {
    if (grant.scope === 'ORGANISATION') scopes.push({});
    if (grant.scope === 'OWN' && access.employeeId != null) {
      if (model === Employee) scopes.push({ id: access.employeeId });
      else if (model.rawAttributes.employeeId) scopes.push({ employeeId: access.employeeId });
    }
    if (grant.scope === 'SELECTED_BRANCHES') {
      if (model === OrganizationBranch) scopes.push({ id: { [Op.in]: grant.branchIds } });
      else if (model.rawAttributes.branchId) scopes.push({ branchId: { [Op.in]: grant.branchIds } });
    }
    if (grant.scope === 'DEPARTMENT') {
      if (model === OrganizationDepartment) scopes.push({ id: { [Op.in]: grant.departmentIds } });
      else if (model.rawAttributes.departmentId) scopes.push({ departmentId: { [Op.in]: grant.departmentIds } });
    }
  }
  if (!scopes.length) return deny;
  if (!access.grants.some(g => g.action === permissionCode && g.scope === 'ORGANISATION')) clauses.push({ [Op.or]: scopes });
  if (access.accessControlMode !== 'LEGACY') {
    if (model === OrganizationBranch) clauses.push({ id: { [Op.in]: access.activeBranchIds } });
    if (model === OrganizationDepartment) clauses.push({ id: { [Op.in]: access.activeDepartmentIds } });
    for (const [field, activeIds] of [['branchId', access.activeBranchIds], ['departmentId', access.activeDepartmentIds]]) {
      if (model.rawAttributes[field]) clauses.push({ [Op.or]: [{ [field]: null }, { [field]: { [Op.in]: activeIds } }] });
    }
  }
  const fields = guardFields(permissionCode, resourceType);
  if (!fields) return deny;
  for (const field of fields) clauses.push({ [Op.or]: [{ [field]: null }, { [field]: { [Op.ne]: access.userId } }] });
  if (permission(permissionCode).guardrails.includes('APPROVED_PAYMENT_ONLY')) clauses.push({ status: 'APPROVED' });
  return { [Op.and]: clauses };
}
module.exports = { effectiveAccess, can, scopedWhere, resourceModel, hasProtectedConflict };
