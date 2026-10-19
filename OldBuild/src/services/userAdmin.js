'use strict';

/**
 * One implementation of "an admin creates / resets an account", shared by
 * Super Admin platform-user management, organisation onboarding and Org
 * Admin user management — so the seat limit, temp-password rules, welcome
 * email and audit entry are identical no matter which screen it came from.
 */

const { User, Organization } = require('../models');
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

/** Where this user signs in: their bank's own page, or the platform page for Super Admins. */
async function loginUrlFor(req, organizationId) {
  const base = await appBaseUrl(req);
  if (!organizationId) return `${base}/`;
  const org = await Organization.findByPk(organizationId, { attributes: ['code'] });
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

/**
 * @returns {{ user, tempPassword, email: {requested, sent, error} }}
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
  const user = await User.create({
    organizationId: organizationId || null,
    email: cleanEmail,
    name: String(name).trim(),
    role,
    employeeId: employeeId || null,
    passwordHash: await hashPassword(tempPassword),
    mustChangePassword: true,
    status: 'ACTIVE',
  });

  let emailResult = { requested: !!sendEmail, sent: false, error: null };
  if (sendEmail) {
    const r = await sendWelcome(req, user, tempPassword);
    emailResult = { requested: true, sent: r.sent, error: r.error || null };
  }
  await audit(req, 'user.create', {
    organizationId: user.organizationId,
    targetType: 'user', targetId: user.id,
    details: { email: user.email, role: user.role, welcomeEmailSent: emailResult.sent },
  });
  return { user, tempPassword, email: emailResult };
}

async function resetPassword(req, user, sendEmail) {
  const tempPassword = generateTempPassword();
  user.passwordHash = await hashPassword(tempPassword);
  user.mustChangePassword = true;
  await user.save();
  let emailResult = { requested: !!sendEmail, sent: false, error: null };
  if (sendEmail) {
    const r = await sendWelcome(req, user, tempPassword);
    emailResult = { requested: true, sent: r.sent, error: r.error || null };
  }
  await audit(req, 'user.password.reset', {
    organizationId: user.organizationId, targetType: 'user', targetId: user.id,
    details: { email: user.email, emailSent: emailResult.sent },
  });
  return { tempPassword, email: emailResult };
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
  if (status === 'ACTIVE' && user.organizationId) await assertCanAddUser(user.organizationId);
  user.status = status;
  await user.save();
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
  await PasswordResetToken.destroy({ where: { userId } });
  await user.destroy();
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
  publicUser, createAccount, resetPassword, resetMfa, setStatus, hardDelete, sendError, loginUrlFor, UserAdminError,
};
