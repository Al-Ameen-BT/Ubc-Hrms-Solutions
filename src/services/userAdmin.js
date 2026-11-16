'use strict';

/**
 * One implementation of "an admin creates / resets an account", shared by
 * Super Admin platform-user management, organisation onboarding and Org
 * Admin user management — so the seat limit, temp-password rules, welcome
 * email and audit entry are identical no matter which screen it came from.
 */

const { sequelize, User, Organization, Employee, LeaveApplication, ArrearsCase, ArrearsInstallment, AuditLog, EmployeeMobileDevice, EmployeeDeviceLink, OrganizationRole, UserRoleAssignment, UserRoleBranch, UserRoleDepartment } = require('../models');
const { Op } = require('sequelize');
const { hashPassword, generateTempPassword } = require('./authService');
const { assertCanAddUser } = require('./license');
const mailer = require('./mailer');
const { appBaseUrl } = require('./settings');
const { audit } = require('./audit');

function publicUser(user) {
  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role,
    employeeId: user.employeeId,
    mustChangePassword: user.mustChangePassword,
    mfaEnabled: user.mfaEnabled,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

class UserAdminError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

function normEmail(email) {
  return String(email || '').toLowerCase().trim();
}

/** Where this user signs in: their bank's own domain (if configured), else its /o/<CODE> page; Super Admins use the platform page. */
async function loginUrlFor(req, organizationId) {
  const base = await appBaseUrl(req);
  if (!organizationId) return `${base}/`;
  const org = await Organization.findByPk(organizationId, { attributes: ['code', 'customDomain'] });
  if (org && org.customDomain) return `https://${org.customDomain}/`;
  return `${base}/o/${encodeURIComponent(org ? org.code : '')}`;
}

async function sendWelcome(req, user, tempPassword) {
  let orgName = null;
  if (user.organizationId) {
    const org = await Organization.findByPk(user.organizationId, { attributes: ['name'] });
    orgName = org && org.name;
  }
  const msg = mailer.welcomeEmail({
    name: user.name,
    email: user.email,
    tempPassword,
    loginUrl: await loginUrlFor(req, user.organizationId),
    orgName,
  });
  return mailer.sendMail({ organizationId: user.organizationId, to: user.email, ...msg });
}

/** Checks whether an organisation (or platform fallback) has a usable SMTP configuration. */
async function smtpAvailability(organizationId) {
  const chosen = await mailer.resolve(organizationId);
  return { smtpConfigured: Boolean(chosen), via: chosen ? chosen.via : null };
}

/**
 * Attempts welcome/reset email delivery only when requested and SMTP is
 * configured; otherwise bypasses email cleanly so callers can display the
 * temporary password on screen.
 */
async function deliverTempPasswordEmail(req, user, tempPassword, sendEmail, organizationId) {
  const [smtp, loginUrl] = await Promise.all([
    smtpAvailability(organizationId),
    loginUrlFor(req, user.organizationId),
  ]);
  if (!sendEmail || !smtp.smtpConfigured) {
    return {
      loginUrl,
      emailResult: {
        requested: !!sendEmail,
        sent: false,
        bypassed: true,
        smtpConfigured: smtp.smtpConfigured,
        via: smtp.via,
        error: sendEmail && !smtp.smtpConfigured ? 'No SMTP server is configured.' : null,
      },
    };
  }
  const r = await sendWelcome(req, user, tempPassword);
  return {
    loginUrl,
    emailResult: {
      requested: true,
      sent: r.sent,
      bypassed: false,
      smtpConfigured: true,
      via: r.via || smtp.via,
      error: r.error || null,
    },
  };
}

/**
 * @returns {{ user, tempPassword, email: {requested, sent, bypassed, smtpConfigured, via, error}, loginUrl }}
 */
async function createAccount(req, { organizationId, email, name, role, employeeId, assignments, sendEmail }) {
  role = role || (assignments ? 'EMPLOYEE' : null);
  const cleanEmail = normEmail(email);
  if (!cleanEmail || typeof name !== 'string' || !name.trim() || name.trim().length > 255 || !role) throw new UserAdminError(400, 'Email, name and role are required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new UserAdminError(400, 'That email address is not valid.');
  if (await User.findOne({ where: { email: cleanEmail } })) {
    throw new UserAdminError(409, 'A user with this email already exists.');
  }
  if (organizationId) await assertCanAddUser(organizationId);
  const tempPassword = generateTempPassword();
  const values = {
    organizationId: organizationId || null,
    email: cleanEmail,
    name: String(name).trim(),
    role,
    employeeId: employeeId || null,
    passwordHash: await hashPassword(tempPassword),
    mustChangePassword: true,
    status: 'ACTIVE',
  };
  const user = await sequelize.transaction(async transaction => {
    const organization = organizationId && await Organization.findByPk(organizationId, { transaction, lock: transaction.LOCK.UPDATE });
    if (employeeId) await tenantResource(Employee, employeeId, organizationId, transaction, true);
    if (Array.isArray(assignments)) for (const data of assignments) await validateAssignment(data, { id: null, employeeId, role }, { organizationId, transaction });
    if (organization && req.user && req.user.role !== 'SUPER_ADMIN') {
      await authorizeAccess({ organizationId, transaction, actor: req.user }, 'users.manage');
      if (assignments !== undefined) await authorizeAccess({ organizationId, transaction, actor: req.user });
    }
    if (organization && req.user) {
      if (!employeeId && role !== 'ORG_ADMIN') bad('An active employee link and initial role assignments are required');
      const legacyOwnBaseline = organization.accessControlMode === 'LEGACY' && role === 'EMPLOYEE' && employeeId && assignments === undefined;
      if (employeeId && !legacyOwnBaseline && (!Array.isArray(assignments) || !assignments.length)) bad('Initial role assignments are required');
      if (!employeeId && (organization.accessControlMode !== 'LEGACY' || assignments?.length || await User.count({ where: { organizationId, role: 'ORG_ADMIN', employeeId: null, status: 'ACTIVE' }, transaction }))) bad('Only one protected bootstrap Organisation Admin is allowed');
    }
    if (organization?.maxUsers != null && await User.count({ where: { organizationId, status: 'ACTIVE' }, transaction }) >= organization.maxUsers) throw new UserAdminError(403, 'User limit reached', 'LICENSE_USER_LIMIT');
    if (employeeId) await assertEmployeeLink(organizationId, employeeId, null, transaction);
    const created = await User.create(values, { transaction });
    if (organization?.accessControlMode === 'LEGACY') {
      await require('./accessBootstrap').bootstrapOrganizationAccess({ organizationId, transaction });
    }
    if (assignments !== undefined) {
      if (!Array.isArray(assignments) || !assignments.length) bad('Initial role assignments are required');
      const o = { organizationId, transaction, actor: req.user };
      await endUserAssignments(created, o);
      for (const assignment of assignments) await saveAssignment(created, assignment, o);
      await baseline(created, o); await synchronizeRole(created, o);
    }
    await AuditLog.create({ organizationId: created.organizationId, actorUserId: req.user?.id || null, action: 'user.create', targetType: 'user', targetId: String(created.id), details: { email: created.email, role: created.role, employeeId: created.employeeId } }, { transaction });
    return created;
  });

  const { emailResult, loginUrl } = await deliverTempPasswordEmail(req, user, tempPassword, sendEmail, organizationId);
  return { user, tempPassword, email: emailResult, loginUrl };
}

async function assertEmployeeLink(organizationId, employeeId, exceptUserId, transaction) {
  const employee = await Employee.findByPk(employeeId, { transaction, lock: transaction?.LOCK.UPDATE });
  if (!employee || employee.status !== 'ACTIVE' || String(employee.organizationId) !== String(organizationId)) throw new UserAdminError(400, 'Employee must belong to this bank.');
  const where = { employeeId, status: 'ACTIVE' };
  if (exceptUserId) where.id = { [Op.ne]: exceptUserId };
  if (await User.findOne({ where, transaction })) throw new UserAdminError(409, 'This employee already has an active account.');
}

async function completeEmployeeLink(organization, userId, employeeId, transaction) {
  const organizationId = organization.id;
  if (organization.accessControlMode === 'LEGACY') await require('./accessBootstrap').bootstrapOrganizationAccess({ organizationId, transaction });
  const inactiveUser = userId && employeeId && await User.findOne({ where: { id: userId, organizationId, employeeId, status: 'INACTIVE' }, transaction });
  if (!inactiveUser) return;
  // An inactive link must record the same permanent bootstrap exit as an active link.
  const baseline = await OrganizationRole.findOne({ where: { organizationId, code: 'EMPLOYEE', templateCode: 'EMPLOYEE', isProtected: true }, transaction });
  if (!baseline) throw new UserAdminError(400, 'Protected employee role is required');
  await UserRoleAssignment.findOrCreate({
    where: { organizationId, userId: inactiveUser.id, roleId: baseline.id, scopeType: 'OWN' },
    defaults: { effectiveFrom: todayIST(), status: 'INACTIVE' },
    transaction,
  });
}

async function withEmployeeLink(organizationId, employeeId, exceptUserId, write) {
  return sequelize.transaction(async transaction => {
    const organization = await Organization.findByPk(organizationId, { transaction, lock: transaction.LOCK.UPDATE });
    await assertEmployeeLink(organizationId, employeeId, exceptUserId, transaction);
    const result = await write(transaction);
    await completeEmployeeLink(organization, exceptUserId, employeeId, transaction);
    return result;
  });
}

async function revokeEmployeeDevices(userId, transaction) {
  await EmployeeMobileDevice.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null }, transaction });
  await EmployeeDeviceLink.update({ status: 'CANCELLED' }, { where: { userId, status: ['PENDING', 'CLAIMED', 'APPROVED'] }, transaction });
}

async function invalidateUserAccess(userIds, { transaction, reason = 'access.changed', actor } = {}) {
  if (!transaction) return sequelize.transaction(transaction => invalidateUserAccess(userIds, { transaction, reason, actor }));
  const ids = [...new Set(userIds)].sort((a, b) => a - b);
  if (!ids.length) return;
  const affected = await User.findAll({ where: { id: ids }, attributes: ['id', 'organizationId'], order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
  await User.increment('accessVersion', { where: { id: ids }, transaction });
  await revokeEmployeeDevices(ids, transaction);
  await AuditLog.bulkCreate(affected.map(user => ({ organizationId: user.organizationId, actorUserId: actor?.id || null, action: 'user.access.invalidate', targetType: 'user', targetId: String(user.id), details: { reason } })), { transaction });
}

async function resetPassword(req, user, sendEmail) {
  const tempPassword = generateTempPassword();
  await sequelize.transaction(async transaction => {
    user.passwordHash = await hashPassword(tempPassword);
    user.mustChangePassword = true;
    await user.save({ transaction });
    await revokeEmployeeDevices(user.id, transaction);
  });
  const { emailResult, loginUrl } = await deliverTempPasswordEmail(req, user, tempPassword, sendEmail, user.organizationId);
  await audit(req, 'user.password.reset', {
    organizationId: user.organizationId, targetType: 'user', targetId: user.id,
    details: { email: user.email, emailSent: emailResult.sent, emailBypassed: emailResult.bypassed },
  });
  return { tempPassword, email: emailResult, loginUrl };
}

async function resetMfa(req, user) {
  if (!user.mfaEnabled) throw new UserAdminError(400, 'MFA is not enabled on this account.');
  user.mfaEnabled = false;
  user.mfaSecret = null;
  user.mfaEnrolledAt = null;
  await user.save();
  await audit(req, 'user.mfa.reset', {
    organizationId: user.organizationId, targetType: 'user', targetId: user.id, details: { email: user.email },
  });
}

/** Status change with the seat check on reactivation. */
async function setStatus(req, user, status) {
  if (user.organizationId && req.user) { await updateOrganizationUser(req, user, { status }); await user.reload(); return; }
  if (!['ACTIVE', 'INACTIVE'].includes(status)) throw new UserAdminError(400, "status must be 'ACTIVE' or 'INACTIVE'");
  if (status === user.status) return;
  if (status === 'ACTIVE' && user.organizationId) {
    await assertCanAddUser(user.organizationId);
    if (user.employeeId) {
      await withEmployeeLink(user.organizationId, user.employeeId, user.id, async transaction => {
        user.status = status;
        await user.save({ transaction });
      });
      await audit(req, 'user.reactivate', { organizationId: user.organizationId, targetType: 'user', targetId: user.id, details: { email: user.email } });
      return;
    }
  }
  await sequelize.transaction(async transaction => {
    user.status = status;
    await user.save({ transaction });
    if (status === 'INACTIVE') await revokeEmployeeDevices(user.id, transaction);
  });
  await audit(req, status === 'ACTIVE' ? 'user.reactivate' : 'user.deactivate', {
    organizationId: user.organizationId, targetType: 'user', targetId: user.id, details: { email: user.email },
  });
}

/**
 * Permanently removes a user account. Only allowed once the account is
 * already INACTIVE (disable first, then delete) — this is the deliberate
 * two-step the UI/API enforce so a delete is never the first action taken
 * against a live account. Any password-reset tokens for the user are
 * cleared first since nothing should reference a user row that no longer
 * exists; audit history is untouched (AuditLog keeps actorEmail alongside
 * the now-dangling actorUserId, by design — see models/auditLog.js).
 */
async function hardDelete(req, user) {
  if (user.status !== 'INACTIVE') {
    throw new UserAdminError(400, 'This account must be disabled before it can be permanently deleted.');
  }
  const { PasswordResetToken } = require('../models');
  const email = user.email; const organizationId = user.organizationId; const userId = user.id;
  await sequelize.transaction(async transaction => {
    const organization = organizationId && await Organization.findByPk(organizationId, { transaction, lock: transaction.LOCK.UPDATE });
    if (organization && req.user) {
      const o = { organizationId, transaction, actor: req.user };
      if (req.user.role !== 'SUPER_ADMIN') await authorizeAccess(o, 'users.manage');
      if (sameId(req.user.id, user.id)) bad('You cannot delete your own account');
      if (organization.accessControlMode === 'PERMISSIONS' && await UserRoleAssignment.count({ where: { organizationId, userId }, transaction })) bad('Retain this inactive account to preserve its role-assignment history', 409);
      if (await OrganizationRole.count({ where: { organizationId, code: 'ORGANISATION_ADMIN', isProtected: true }, transaction })) await protectAdministrators(o);
      await accessAudit(o, 'user.delete', 'user', userId, { email });
    }
    if (organization?.accessControlMode === 'LEGACY') {
      // Preserve legacy account deletion without cascading into employee or audit history.
      const assignments = await UserRoleAssignment.findAll({ where: { organizationId, userId }, attributes: ['id'], transaction });
      const scopeWhere = { organizationId, userRoleAssignmentId: assignments.map(a => a.id) };
      await UserRoleBranch.destroy({ where: scopeWhere, transaction });
      await UserRoleDepartment.destroy({ where: scopeWhere, transaction });
      await UserRoleAssignment.destroy({ where: { organizationId, userId }, transaction });
    }
    await PasswordResetToken.destroy({ where: { userId }, transaction });
    await EmployeeDeviceLink.destroy({ where: { userId }, transaction });
    await EmployeeMobileDevice.destroy({ where: { userId }, transaction });
    await user.destroy({ transaction });
  });
  if (!req.user) await audit(req, 'user.delete', {
    organizationId, targetType: 'user', targetId: userId, details: { email },
  });
}

/** Maps service errors (UserAdminError, LicenseLimitError, SmtpInputError, AssetError…) to a JSON response. */
function sendError(res, err) {
  const status = err.status || (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError' ? 400 : 500);
  const message = err.errors && err.errors[0] ? err.errors[0].message : err.message;
  if (status >= 500) console.error(err);
  return res.status(status).json({ status: 'error', code: err.code, message: status >= 500 ? 'Unable to complete request' : message });
}

// Tenant access changes share the organization lock with structure and transfer writers.
const { OrganizationBranch, OrganizationDepartment, OrganizationRolePermission } = require('../models');
const { template, ROLE_TEMPLATES } = require('./permissionCatalog');
const { todayIST } = require('./orgAccess');
const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const activeAt = (row, at = todayIST()) => row.status === 'ACTIVE' && row.effectiveFrom <= at && (!row.effectiveTo || row.effectiveTo >= at);
const bad = (message, status = 400) => { throw new UserAdminError(status, message); };
function inputShape(data, allowed) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(key => !allowed.includes(key))) bad('Unsupported request fields');
  return data;
}
function validId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) bad('Invalid identifier');
  return Number(value);
}
async function tenantResource(Model, id, organizationId, transaction, active = false) {
  const row = await Model.findOne({ where: { id: validId(id), organizationId }, transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!row) bad('Resource not found', 404);
  if (active && row.status !== 'ACTIVE') bad('Resource must be active');
  return row;
}
async function accessTransaction(options, work) {
  if (!options.transaction) return sequelize.transaction(transaction => accessTransaction({ ...options, transaction }, work));
  const organizationId = validId(options.organizationId), { transaction } = options;
  const organization = await Organization.findByPk(organizationId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!organization) bad('Resource not found', 404);
  return work({ ...options, organizationId, organization });
}
async function authorizeAccess(o, code = 'roles.manage') {
  const actor = o.actor && await tenantResource(User, o.actor.id, o.organizationId, o.transaction, true);
  const { effectiveAccess, can } = require('./accessControl');
  if (!actor || !can(await effectiveAccess(actor.id, todayIST(), o.transaction), code)) bad('Permission denied', 403);
  return actor;
}
async function accessAudit(o, action, targetType, targetId, details) {
  await AuditLog.create({ organizationId: o.organizationId, actorUserId: o.actor?.id || null, action, targetType, targetId: targetId == null ? null : String(targetId), details }, { transaction: o.transaction });
}
async function roleData(role, transaction) {
  const grants = await OrganizationRolePermission.findAll({ where: { organizationId: role.organizationId, roleId: role.id }, transaction, attributes: ['permissionCode'], order: [['permissionCode', 'ASC']] });
  return { id: role.id, code: role.code, name: role.name, templateCode: role.templateCode, isProtected: role.isProtected, status: role.status, permissionCodes: grants.map(p => p.permissionCode), allowedScopes: template(role.templateCode)?.allowedScopes || [] };
}
function subset(definition, codes) {
  if (!Array.isArray(codes) || codes.some(code => typeof code !== 'string' || !definition.permissionCodes.includes(code)) || new Set(codes).size !== codes.length) bad('Permissions must be a unique subset of the source template');
  return codes;
}
async function roleImpact(o, roleId) {
  const assignments = await UserRoleAssignment.findAll({ where: { organizationId: o.organizationId, roleId, status: 'ACTIVE', [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: todayIST() } }] }, transaction: o.transaction, ...(o.transaction ? { lock: o.transaction.LOCK.UPDATE } : {}) });
  const users = await User.findAll({ where: { organizationId: o.organizationId, id: assignments.map(a => a.userId) }, attributes: ['id'], order: [['id', 'ASC']], transaction: o.transaction, ...(o.transaction ? { lock: o.transaction.LOCK.UPDATE } : {}) });
  const userIds = users.map(user => user.id);
  return { userIds, affectedUserCount: userIds.length, requiresReauthentication: userIds.length > 0, requiresDeviceRelink: userIds.length > 0 };
}
async function listRoles(options) {
  return accessTransaction(options, async o => { await authorizeAccess(o); const roles = await OrganizationRole.findAll({ where: { organizationId: o.organizationId }, order: [['id', 'ASC']], transaction: o.transaction }); return Promise.all(roles.map(role => roleData(role, o.transaction))); });
}
async function readRole(options) {
  return accessTransaction(options, async o => { const role = await tenantResource(OrganizationRole, o.id, o.organizationId, o.transaction); await authorizeAccess(o); return roleData(role, o.transaction); });
}
async function previewRoleImpact(options) {
  return accessTransaction(options, async o => { const role = await tenantResource(OrganizationRole, o.id, o.organizationId, o.transaction); await authorizeAccess(o); return roleImpact(o, role.id); });
}
async function writeRole(options) {
  return accessTransaction(options, async o => {
    const data = inputShape(o.data, o.id ? ['name', 'permissionCodes', 'status'] : ['sourceRoleId', 'code', 'name', 'permissionCodes']);
    const existing = o.id ? await tenantResource(OrganizationRole, o.id, o.organizationId, o.transaction) : null;
    const source = existing || await tenantResource(OrganizationRole, data.sourceRoleId, o.organizationId, o.transaction, true);
    await authorizeAccess(o);
    if (existing?.isProtected) bad('Protected templates are immutable');
    if (!existing && !source.isProtected) bad('Copy a protected template');
    const definition = template(source.templateCode); if (!definition) bad('Invalid source template');
    const before = existing ? await roleData(existing, o.transaction) : null;
    const permissionCodes = subset(definition, data.permissionCodes === undefined ? before?.permissionCodes || definition.permissionCodes : data.permissionCodes);
    const impact = existing ? await roleImpact(o, existing.id) : { userIds: [], affectedUserCount: 0 };
    if (impact.userIds.some(id => sameId(id, o.actor.id)) && permissionCodes.some(code => !before.permissionCodes.includes(code))) bad('You cannot grant yourself additional access');
    if (data.status !== undefined && !['ACTIVE', 'INACTIVE'].includes(data.status)) bad('Invalid status');
    if (data.status === 'INACTIVE' && impact.userIds.length) bad('End or replace active role assignments before deactivation', 409);
    const name = data.name === undefined ? existing?.name : data.name;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 255) bad('Name must contain 1–255 characters');
    if (!existing && (typeof data.code !== 'string' || !/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(data.code))) bad('Code must contain 2–32 uppercase letters, digits, hyphens or underscores');
    const role = existing ? await existing.update({ name: name.trim(), status: data.status || existing.status }, { transaction: o.transaction }) : await OrganizationRole.create({ organizationId: o.organizationId, code: data.code, name: name.trim(), templateCode: definition.code }, { transaction: o.transaction });
    await OrganizationRolePermission.destroy({ where: { organizationId: o.organizationId, roleId: role.id }, transaction: o.transaction });
    await OrganizationRolePermission.bulkCreate(permissionCodes.map(permissionCode => ({ organizationId: o.organizationId, roleId: role.id, permissionCode })), { transaction: o.transaction });
    await invalidateUserAccess(impact.userIds, { transaction: o.transaction, actor: o.actor, reason: 'role.changed' });
    const after = await roleData(role, o.transaction);
    await accessAudit(o, existing ? 'org.role.update' : 'org.role.create', 'organization_role', role.id, { before, after, affectedUserCount: impact.affectedUserCount });
    return after;
  });
}
async function validateAssignment(data, user, o) {
  inputShape(data, ['roleId', 'scopeType', 'branchIds', 'departmentIds', 'effectiveFrom', 'effectiveTo', 'status']);
  const role = await tenantResource(OrganizationRole, data.roleId, o.organizationId, o.transaction, true), definition = template(role.templateCode);
  if (!definition || !definition.allowedScopes.includes(data.scopeType)) bad('Scope exceeds the role template');
  const grants = (await roleData(role, o.transaction)).permissionCodes; subset(definition, grants);
  const ids = key => { if (data[key] !== undefined && !Array.isArray(data[key])) bad('Scope identifiers must be arrays'); const values = (data[key] || []).map(validId); if (new Set(values).size !== values.length) bad('Duplicate scope identifiers'); return values; };
  const branchIds = ids('branchIds'), departmentIds = ids('departmentIds');
  if (data.scopeType === 'SELECTED_BRANCHES' ? !branchIds.length || departmentIds.length : data.scopeType === 'DEPARTMENT' ? departmentIds.length !== 1 || branchIds.length : branchIds.length || departmentIds.length) bad('Scope requires exactly its selected branch or department identifiers');
  for (const id of branchIds) await tenantResource(OrganizationBranch, id, o.organizationId, o.transaction, true);
  for (const id of departmentIds) { const d = await tenantResource(OrganizationDepartment, id, o.organizationId, o.transaction, true); await tenantResource(OrganizationBranch, d.branchId, o.organizationId, o.transaction, true); }
  const { isDateOnly } = require('./dateUtils');
  if (!isDateOnly(data.effectiveFrom) || data.effectiveTo != null && (!isDateOnly(data.effectiveTo) || data.effectiveTo < data.effectiveFrom)) bad('Invalid effective date range');
  if (data.status !== undefined && !['ACTIVE', 'INACTIVE'].includes(data.status)) bad('Invalid status');
  if (user.employeeId) await assertEmployeeLink(o.organizationId, user.employeeId, user.id, o.transaction);
  else {
    const history = await UserRoleAssignment.findAll({ where: { organizationId: o.organizationId, userId: user.id }, transaction: o.transaction });
    const baseline = await OrganizationRole.findOne({ where: { organizationId: o.organizationId, templateCode: 'EMPLOYEE', isProtected: true }, transaction: o.transaction });
    if (!(role.isProtected && role.code === 'ORGANISATION_ADMIN' && user.role === 'ORG_ADMIN') || history.some(a => a.roleId === baseline?.id)) bad('An active employee link is required');
    if (await User.count({ where: { organizationId: o.organizationId, role: 'ORG_ADMIN', employeeId: null, status: 'ACTIVE', id: { [Op.ne]: user.id } }, transaction: o.transaction })) bad('Only one unlinked bootstrap administrator is allowed');
  }
  return { role, branchIds, departmentIds, values: { roleId: role.id, scopeType: data.scopeType, effectiveFrom: data.effectiveFrom, effectiveTo: data.effectiveTo || null, status: data.status || 'ACTIVE' } };
}
async function endUserAssignments(user, o) {
  const rows = await UserRoleAssignment.findAll({ where: { organizationId: o.organizationId, userId: user.id, status: 'ACTIVE' }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
  for (const row of rows) {
    const before = row.toJSON();
    await row.update({ status: 'INACTIVE' }, { transaction: o.transaction });
    await accessAudit(o, 'org.roleAssignment.end', 'user_role_assignment', row.id, { before, after: { ...before, status: 'INACTIVE' } });
  }
}
async function saveAssignment(user, data, o, existing) {
  const checked = await validateAssignment(data, user, o), { values, branchIds, departmentIds } = checked;
  const before = existing?.toJSON() || null;
  const assignments = await UserRoleAssignment.findAll({ where: { organizationId: o.organizationId, userId: user.id, roleId: values.roleId, status: 'ACTIVE' }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
  if (values.status === 'ACTIVE' && assignments.some(a => a.id !== existing?.id && (!a.effectiveTo || a.effectiveTo >= values.effectiveFrom) && (!values.effectiveTo || values.effectiveTo >= a.effectiveFrom))) bad('Role assignment dates overlap an existing assignment', 409);
  const row = existing ? await existing.update(values, { transaction: o.transaction }) : await UserRoleAssignment.create({ ...values, organizationId: o.organizationId, userId: user.id, assignedBy: o.actor?.id }, { transaction: o.transaction });
  const where = { organizationId: o.organizationId, userRoleAssignmentId: row.id };
  await UserRoleBranch.destroy({ where, transaction: o.transaction }); await UserRoleDepartment.destroy({ where, transaction: o.transaction });
  await UserRoleBranch.bulkCreate(branchIds.map(branchId => ({ ...where, branchId })), { transaction: o.transaction });
  await UserRoleDepartment.bulkCreate(departmentIds.map(departmentId => ({ ...where, departmentId })), { transaction: o.transaction });
  const result = { id: row.id, userId: user.id, ...values, branchIds, departmentIds };
  await accessAudit(o, existing ? values.status === 'INACTIVE' ? 'org.roleAssignment.end' : 'org.roleAssignment.update' : 'org.roleAssignment.create', 'user_role_assignment', row.id, { before, after: result });
  return result;
}
async function baseline(user, o) {
  if (!user.employeeId) return;
  const role = await OrganizationRole.findOne({ where: { organizationId: o.organizationId, code: 'EMPLOYEE', templateCode: 'EMPLOYEE', isProtected: true, status: 'ACTIVE' }, transaction: o.transaction });
  if (!role) bad('Protected employee role is required');
  const existing = await UserRoleAssignment.findOne({ where: { organizationId: o.organizationId, userId: user.id, roleId: role.id, scopeType: 'OWN', status: 'ACTIVE', effectiveTo: null }, transaction: o.transaction });
  if (!existing) await saveAssignment(user, { roleId: role.id, scopeType: 'OWN', effectiveFrom: todayIST() }, o);
}
async function synchronizeRole(user, o) {
  const assignments = await UserRoleAssignment.findAll({ where: { organizationId: o.organizationId, userId: user.id }, transaction: o.transaction });
  const roles = await OrganizationRole.findAll({ where: { organizationId: o.organizationId, id: assignments.filter(a => activeAt(a)).map(a => a.roleId), status: 'ACTIVE' }, transaction: o.transaction });
  // Branch Manager has no legacy enum; a custom subset must not gain legacy template powers.
  const primary = ROLE_TEMPLATES.find(t => t.code !== 'EMPLOYEE' && roles.some(r => r.isProtected && r.templateCode === t.code));
  const role = primary && Object.keys(User.LEGACY_ROLE_TEMPLATES).find(key => User.LEGACY_ROLE_TEMPLATES[key] === primary.code) || 'EMPLOYEE';
  if (user.role !== role) await user.update({ role }, { transaction: o.transaction });
}
async function protectAdministrators(o) {
  const roles = await OrganizationRole.findAll({ where: { organizationId: o.organizationId, code: 'ORGANISATION_ADMIN', templateCode: 'ORGANISATION_ADMIN', isProtected: true, status: 'ACTIVE' }, transaction: o.transaction });
  const permissions = await OrganizationRolePermission.findAll({ where: { organizationId: o.organizationId, roleId: roles.map(r => r.id) }, transaction: o.transaction });
  const adminIds = roles.filter(role => ['roles.manage', 'users.manage'].every(code => permissions.some(p => p.roleId === role.id && p.permissionCode === code))).map(r => r.id);
  const users = await User.findAll({ where: { organizationId: o.organizationId, status: 'ACTIVE' }, transaction: o.transaction });
  const employees = await Employee.findAll({ where: { organizationId: o.organizationId, status: 'ACTIVE' }, attributes: ['id'], transaction: o.transaction });
  const ownRoles = await OrganizationRole.findAll({ where: { organizationId: o.organizationId, templateCode: 'EMPLOYEE' }, attributes: ['id'], transaction: o.transaction });
  const priorLinks = await UserRoleAssignment.findAll({ where: { organizationId: o.organizationId, roleId: ownRoles.map(r => r.id) }, attributes: ['userId'], transaction: o.transaction });
  const bootstrapUsers = users.filter(u => !u.employeeId && u.role === 'ORG_ADMIN' && !priorLinks.some(a => a.userId === u.id));
  const eligible = users.filter(u => u.employeeId ? employees.some(e => e.id === u.employeeId) && users.filter(other => other.employeeId === u.employeeId).length === 1 : bootstrapUsers.length === 1 && bootstrapUsers[0].id === u.id);
  const assignments = await UserRoleAssignment.findAll({ where: { organizationId: o.organizationId, roleId: adminIds, scopeType: 'ORGANISATION', status: 'ACTIVE', userId: eligible.map(u => u.id) }, transaction: o.transaction });
  const boundaries = new Set([todayIST(), ...assignments.flatMap(a => [a.effectiveFrom, ...(a.effectiveTo ? [new Date(Date.parse(a.effectiveTo) + 86400000).toISOString().slice(0, 10)] : [])]).filter(d => d >= todayIST())]);
  if ([...boundaries].some(at => !assignments.some(a => activeAt(a, at)))) bad('Cannot remove the last effective Organisation Admin', 409);
}
async function changeRoleAssignment(options) {
  return accessTransaction(options, async o => {
    const existing = o.id ? await tenantResource(UserRoleAssignment, o.id, o.organizationId, o.transaction) : null;
    const data = inputShape(o.data, existing ? ['roleId', 'scopeType', 'branchIds', 'departmentIds', 'effectiveFrom', 'effectiveTo', 'status'] : ['userId', 'roleId', 'scopeType', 'branchIds', 'departmentIds', 'effectiveFrom', 'effectiveTo', 'status']);
    const user = await tenantResource(User, existing ? existing.userId : data.userId, o.organizationId, o.transaction, !existing || data.status !== 'INACTIVE');
    const before = existing?.toJSON() || null;
    let fields = { ...data }; delete fields.userId;
    if (existing) {
      const branches = await UserRoleBranch.findAll({ where: { organizationId: o.organizationId, userRoleAssignmentId: existing.id }, transaction: o.transaction });
      const departments = await UserRoleDepartment.findAll({ where: { organizationId: o.organizationId, userRoleAssignmentId: existing.id }, transaction: o.transaction });
      fields = { roleId: existing.roleId, scopeType: existing.scopeType, effectiveFrom: existing.effectiveFrom, effectiveTo: existing.effectiveTo, status: existing.status, branchIds: branches.map(b => b.branchId), departmentIds: departments.map(d => d.departmentId), ...fields };
      const role = await tenantResource(OrganizationRole, existing.roleId, o.organizationId, o.transaction);
      if (role.isProtected && role.templateCode === 'EMPLOYEE' && user.employeeId) bad('The own-record baseline is protected');
    }
    await validateAssignment(fields, user, o);
    await authorizeAccess(o); if (sameId(user.id, o.actor.id)) bad('You cannot change your own role assignments');
    const result = await saveAssignment(user, fields, o, existing);
    await baseline(user, o);
    const adminRoles = await OrganizationRole.findAll({ where: { organizationId: o.organizationId, code: 'ORGANISATION_ADMIN', isProtected: true }, transaction: o.transaction });
    if (adminRoles.some(role => role.id === fields.roleId || role.id === before?.roleId)) await protectAdministrators(o);
    await synchronizeRole(user, o);
    await invalidateUserAccess([user.id], { transaction: o.transaction, actor: o.actor, reason: 'assignment.changed' });
    return result;
  });
}
async function listRoleAssignments(options) {
  return accessTransaction(options, async o => {
    if (o.userId != null) await tenantResource(User, o.userId, o.organizationId, o.transaction);
    await authorizeAccess(o);
    const rows = await UserRoleAssignment.findAll({ where: { organizationId: o.organizationId, ...(o.userId ? { userId: o.userId } : {}) }, order: [['id', 'ASC']], transaction: o.transaction });
    const branches = await UserRoleBranch.findAll({ where: { organizationId: o.organizationId }, transaction: o.transaction }), departments = await UserRoleDepartment.findAll({ where: { organizationId: o.organizationId }, transaction: o.transaction });
    return rows.map(a => ({ id: a.id, userId: a.userId, roleId: a.roleId, scopeType: a.scopeType, effectiveFrom: a.effectiveFrom, effectiveTo: a.effectiveTo, status: a.status, branchIds: branches.filter(b => b.userRoleAssignmentId === a.id).map(b => b.branchId), departmentIds: departments.filter(d => d.userRoleAssignmentId === a.id).map(d => d.departmentId) }));
  });
}
async function previewUserAccess(options) {
  return accessTransaction(options, async o => { const user = await tenantResource(User, o.userId, o.organizationId, o.transaction); await authorizeAccess(o); const access = await require('./accessControl').effectiveAccess(user.id, todayIST(), o.transaction); return { userId: user.id, permissionCodes: access.permissionCodes, scopeSummary: access.scopeSummary, accessControlMode: access.accessControlMode }; });
}
async function permissionModeReadiness(o) {
  const readiness = await require('./accessBootstrap').accessReadiness(o.organizationId, { transaction: o.transaction, lock: true });
  const blockers = [...readiness.blockers];
  if (readiness.bootstrapUserId) blockers.push({ userId: readiness.bootstrapUserId, reason: 'BOOTSTRAP_ADMIN_LINK_REQUIRED' });
  const pendingLeave = await LeaveApplication.count({ where: { status: 'PENDING', selectedApproverUserId: null }, include: [{ model: Employee, required: true, attributes: [], where: { organizationId: o.organizationId } }], transaction: o.transaction });
  if (pendingLeave) blockers.push({ reason: 'PENDING_LEAVE_APPROVER_REQUIRED', count: pendingLeave });
  const legacyArrears = await ArrearsCase.count({ where: { organizationId: o.organizationId, [Op.or]: [{ calculatedBy: null }, { planApprovedBy: null }, { totalAdjustedAmount: { [Op.ne]: null }, adjustedBy: null }] }, include: [{ model: ArrearsInstallment, required: true, attributes: [], where: { status: 'PENDING' } }], distinct: true, transaction: o.transaction });
  if (legacyArrears) blockers.push({ reason: 'LEGACY_ARREARS_ACTOR_HISTORY_REQUIRED', count: legacyArrears });
  return { ...readiness, ready: readiness.ready && !blockers.length, blockers };
}

async function previewAccessReadiness(options) {
  return accessTransaction(options, async o => { await authorizeAccess(o); return permissionModeReadiness(o); });
}
async function activatePermissionMode(options) {
  return accessTransaction(options, async o => {
    await authorizeAccess(o);
    if (o.organization.accessControlMode !== 'LEGACY') bad('Permission mode is already active and cannot be reversed', 409);
    const readiness = await permissionModeReadiness(o);
    if (!readiness.ready) throw new UserAdminError(409, 'Resolve access readiness blockers before activation', 'ACCESS_NOT_READY');
    const users = await User.findAll({ where: { organizationId: o.organizationId }, attributes: ['id'], order: [['id', 'ASC']], transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
    await o.organization.update({ accessControlMode: 'PERMISSIONS' }, { transaction: o.transaction });
    await invalidateUserAccess(users.map(u => u.id), { transaction: o.transaction, actor: o.actor, reason: 'permission-mode.activated' });
    await accessAudit(o, 'org.accessMode.activate', 'organization', o.organizationId, { before: 'LEGACY', after: 'PERMISSIONS', affectedUserCount: users.length });
    return { accessControlMode: 'PERMISSIONS', affectedUserCount: users.length, requiresReauthentication: true, requiresDeviceRelink: true };
  });
}
async function updateOrganizationUser(req, user, data) {
  inputShape(data, ['name', 'role', 'status', 'employeeId', 'assignments']);
  return accessTransaction({ organizationId: user.organizationId, actor: req.user }, async o => {
    user = await tenantResource(User, user.id, o.organizationId, o.transaction);
    if (data.employeeId != null && data.employeeId !== '') await tenantResource(Employee, data.employeeId, o.organizationId, o.transaction, true);
    if (Array.isArray(data.assignments)) for (const a of data.assignments) await validateAssignment(a, { ...user.toJSON(), employeeId: data.employeeId === undefined ? user.employeeId : data.employeeId }, o);
    if (req.user.role !== 'SUPER_ADMIN') {
      await authorizeAccess(o, 'users.manage');
      if (data.assignments !== undefined || data.role !== undefined && data.role !== user.role) await authorizeAccess(o);
    }
    const isSelf = sameId(user.id, req.user.id);
    if (isSelf && data.employeeId !== undefined && user.employeeId != null && !sameId(user.employeeId, data.employeeId)) bad('You cannot change your own employee identity');
    if (isSelf && (data.role !== undefined && data.role !== user.role || data.assignments !== undefined || data.status === 'INACTIVE')) bad('You cannot change your own role or deactivate your account');
    if (data.name !== undefined && (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 255)) bad('Name must contain 1–255 characters');
    if (data.status !== undefined && !['ACTIVE', 'INACTIVE'].includes(data.status)) bad('Invalid status');
    if (data.role !== undefined && !Object.hasOwn(User.LEGACY_ROLE_TEMPLATES, data.role)) bad('Invalid role');
    const adminRoles = await OrganizationRole.findAll({ where: { organizationId: o.organizationId, code: 'ORGANISATION_ADMIN', isProtected: true }, transaction: o.transaction });
    const hadAdminAssignment = await UserRoleAssignment.count({ where: { organizationId: o.organizationId, userId: user.id, roleId: adminRoles.map(r => r.id), status: 'ACTIVE' }, transaction: o.transaction });
    const before = publicUser(user), employeeId = data.employeeId === undefined ? user.employeeId : data.employeeId === null || data.employeeId === '' ? null : validId(data.employeeId);
    if (employeeId && (data.status || user.status) === 'ACTIVE') await assertEmployeeLink(o.organizationId, employeeId, user.id, o.transaction);
    if (!employeeId && data.employeeId !== undefined && o.organization.accessControlMode === 'PERMISSIONS') {
      const ownRole = await OrganizationRole.findOne({ where: { organizationId: o.organizationId, code: 'EMPLOYEE', templateCode: 'EMPLOYEE', isProtected: true }, transaction: o.transaction });
      const assignments = await UserRoleAssignment.findAll({ where: { organizationId: o.organizationId, userId: user.id, status: 'ACTIVE' }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
      if (assignments.some(a => a.roleId !== ownRole?.id || a.scopeType !== 'OWN')) bad('End operational role assignments before clearing the employee link');
    }
    if (!employeeId && o.organization.accessControlMode === 'PERMISSIONS' && (data.status || user.status) === 'ACTIVE') bad('An active employee link is required');
    if (data.status === 'ACTIVE' && user.status !== 'ACTIVE' && o.organization.maxUsers != null && await User.count({ where: { organizationId: o.organizationId, status: 'ACTIVE' }, transaction: o.transaction }) >= o.organization.maxUsers) throw new UserAdminError(403, 'User limit reached', 'LICENSE_USER_LIMIT');
    await user.update({ ...(data.name === undefined ? {} : { name: data.name.trim() }), ...(data.status ? { status: data.status } : {}), employeeId, ...(data.role === undefined ? {} : { role: data.role }) }, { transaction: o.transaction });
    const changedAccess = data.role !== undefined && data.role !== before.role || data.status !== undefined && data.status !== before.status || !sameId(employeeId, before.employeeId) && !(employeeId == null && before.employeeId == null) || data.assignments !== undefined;
    if (data.assignments !== undefined) {
      if (!Array.isArray(data.assignments) || !data.assignments.length) bad('At least one initial role assignment is required');
      await endUserAssignments(user, o);
      for (const assignment of data.assignments) await saveAssignment(user, assignment, o);
      await baseline(user, o); await synchronizeRole(user, o);
    } else if (o.organization.accessControlMode === 'LEGACY') {
      if (data.role !== undefined && data.role !== before.role) await endUserAssignments(user, o);
    } else if (data.role !== undefined && data.role !== before.role) bad('Change role assignments instead of the compatibility role');
    await completeEmployeeLink(o.organization, user.id, employeeId, o.transaction);
    if (hadAdminAssignment || before.role === 'ORG_ADMIN' && (data.status !== undefined || data.role !== undefined || data.employeeId !== undefined || data.assignments !== undefined)) await protectAdministrators(o);
    if (changedAccess) await invalidateUserAccess([user.id], { transaction: o.transaction, actor: o.actor, reason: 'user.updated' });
    await accessAudit(o, 'user.update', 'user', user.id, { before, after: publicUser(user) });
    return user;
  });
}

module.exports = {
  inputShape, tenantResource, listRoles, readRole, writeRole, previewRoleImpact, changeRoleAssignment, listRoleAssignments, previewUserAccess, previewAccessReadiness, activatePermissionMode, updateOrganizationUser,
  publicUser, createAccount, assertEmployeeLink, withEmployeeLink, revokeEmployeeDevices, invalidateUserAccess, resetPassword, resetMfa, setStatus, hardDelete, sendError, loginUrlFor, smtpAvailability, UserAdminError,
};
