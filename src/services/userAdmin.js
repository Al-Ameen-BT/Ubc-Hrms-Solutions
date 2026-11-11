'use strict';

/**
 * One implementation of "an admin creates / resets an account", shared by
 * Super Admin platform-user management, organisation onboarding and Org
 * Admin user management — so the seat limit, temp-password rules, welcome
 * email and audit entry are identical no matter which screen it came from.
 */

const { sequelize, User, Organization, Employee, EmployeeMobileDevice, EmployeeDeviceLink } = require('../models');
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
async function createAccount(req, { organizationId, email, name, role, employeeId, sendEmail }) {
  const cleanEmail = normEmail(email);
  if (!cleanEmail || !name || !role) throw new UserAdminError(400, 'Email, name and role are required.');
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
  const user = employeeId
    ? await withEmployeeLink(organizationId, employeeId, null, transaction => User.create(values, { transaction }))
    : await User.create(values);

  const { emailResult, loginUrl } = await deliverTempPasswordEmail(req, user, tempPassword, sendEmail, organizationId);
  await audit(req, 'user.create', {
    organizationId: user.organizationId,
    targetType: 'user', targetId: user.id,
    details: { email: user.email, role: user.role, welcomeEmailSent: emailResult.sent, emailBypassed: emailResult.bypassed },
  });
  return { user, tempPassword, email: emailResult, loginUrl };
}

async function assertEmployeeLink(organizationId, employeeId, exceptUserId, transaction) {
  const employee = await Employee.findByPk(employeeId, { transaction, lock: transaction?.LOCK.UPDATE });
  if (!employee || String(employee.organizationId) !== String(organizationId)) throw new UserAdminError(400, 'Employee must belong to this bank.');
  const where = { employeeId, status: 'ACTIVE' };
  if (exceptUserId) where.id = { [Op.ne]: exceptUserId };
  if (await User.findOne({ where, transaction })) throw new UserAdminError(409, 'This employee already has an active account.');
}

async function withEmployeeLink(organizationId, employeeId, exceptUserId, write) {
  return sequelize.transaction(async transaction => {
    await assertEmployeeLink(organizationId, employeeId, exceptUserId, transaction);
    return write(transaction);
  });
}

async function revokeEmployeeDevices(userId, transaction) {
  await EmployeeMobileDevice.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null }, transaction });
  await EmployeeDeviceLink.update({ status: 'CANCELLED' }, { where: { userId, status: ['PENDING', 'CLAIMED', 'APPROVED'] }, transaction });
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
    await PasswordResetToken.destroy({ where: { userId }, transaction });
    await EmployeeDeviceLink.destroy({ where: { userId }, transaction });
    await EmployeeMobileDevice.destroy({ where: { userId }, transaction });
    await user.destroy({ transaction });
  });
  await audit(req, 'user.delete', {
    organizationId, targetType: 'user', targetId: userId, details: { email },
  });
}

/** Maps service errors (UserAdminError, LicenseLimitError, SmtpInputError, AssetError…) to a JSON response. */
function sendError(res, err) {
  const status = err.status || (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError' ? 400 : 500);
  const message = err.errors && err.errors[0] ? err.errors[0].message : err.message;
  if (status >= 500) console.error(err);
  return res.status(status).json({ status: 'error', code: err.code, message });
}

module.exports = {
  publicUser, createAccount, assertEmployeeLink, withEmployeeLink, revokeEmployeeDevices, resetPassword, resetMfa, setStatus, hardDelete, sendError, loginUrlFor, smtpAvailability, UserAdminError,
};
