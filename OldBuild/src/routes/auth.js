'use strict';

/**
 * /api/v1/auth/* — sign-in, MFA, password change/reset.
 *
 * Sign-in is scoped by where it happens:
 *   - a bank's own login page (/o/<CODE>) sends orgCode; only that bank's
 *     users can sign in there;
 *   - the platform login page (/) sends no orgCode; only Super Admins can
 *     sign in there. A bank user who lands on it is pointed to their
 *     bank's page — but only after a correct password, so the hint can't
 *     be used to probe which emails exist.
 */

const express = require('express');
const { Op } = require('sequelize');
const { User, Organization, PasswordResetToken } = require('../models');
const { authenticate } = require('../middleware/auth');
const { checkOrgAccess, licenseSummary } = require('../services/orgAccess');
const brand = require('../services/brandAssets');
const secretBox = require('../services/secretBox');
const mailer = require('../services/mailer');
const { appBaseUrl } = require('../services/settings');
const { audit } = require('../services/audit');
const { findOrgByCode } = require('./public');
const {
  hashPassword, verifyPassword, signToken, signMfaChallengeToken, verifyMfaChallengeToken,
  generateMfaSecret, mfaKeyUri, mfaQrCodeDataUrl, verifyMfaCode, encryptMfaSecret, decryptMfaSecret,
} = require('../services/authService');

const router = express.Router();

const RESET_TTL_MS = 30 * 60 * 1000;

const withOrg = {
  include: [{
    model: Organization,
    attributes: ['id', 'name', 'shortName', 'code', 'status', 'licensePlan', 'licenseStartsAt', 'licenseExpiresAt', 'maxUsers', 'maxEmployees'],
  }],
};

async function publicUser(user) {
  const org = user.Organization || null;
  let organization = null;
  if (org) {
    const logo = await brand.info(org.id, 'LOGO');
    organization = {
      id: org.id,
      code: org.code,
      name: org.name,
      shortName: org.shortName,
      logoUrl: logo ? `/assets/org/${encodeURIComponent(org.code)}/logo?v=${logo.version}` : null,
      license: licenseSummary(org),
    };
  }
  return {
    id: user.id,
    organizationId: user.organizationId,
    organizationName: org ? org.name : null,
    organization,
    email: user.email,
    name: user.name,
    role: user.role,
    employeeId: user.employeeId,
    mustChangePassword: user.mustChangePassword,
    mfaEnabled: user.mfaEnabled,
    mfaEnrolledAt: user.mfaEnrolledAt,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
  };
}

function actorOf(user) {
  return { id: user.id, email: user.email, organizationId: user.organizationId };
}

async function finishLogin(req, user, viaMfa) {
  const previousLogin = user.lastLoginAt;
  user.lastLoginAt = new Date();
  await user.save();
  const loaded = await User.findByPk(user.id, withOrg);
  await audit(req, 'auth.login', { actor: actorOf(user), organizationId: user.organizationId, targetType: 'user', targetId: user.id, details: { mfa: !!viaMfa } });
  return { token: signToken(user), user: await publicUser(loaded), mustChangePassword: user.mustChangePassword, previousLoginAt: previousLogin };
}

const INVALID = { status: 'error', message: 'Invalid email or password' };

// Compared against when the email doesn't exist, so an unknown email takes
// as long as a wrong password — otherwise response time reveals which
// emails have accounts.
const DUMMY_HASH = require('bcryptjs').hashSync(require('crypto').randomBytes(16).toString('hex'), 10);

// POST /login — { email, password, orgCode? }
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const orgCode = (req.body || {}).orgCode ? String(req.body.orgCode).trim() : '';
    if (!email || !password) return res.status(400).json({ status: 'error', message: 'Email and password are required' });

    let org = null;
    if (orgCode) {
      org = await findOrgByCode(orgCode);
      if (!org) return res.status(404).json({ status: 'error', message: 'Unknown organisation. Check the login address you were given.' });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ where: { email: cleanEmail }, ...withOrg });
    const fail = async (reason) => {
      await audit(req, 'auth.login.failed', {
        actor: { id: user ? user.id : null, email: cleanEmail },
        organizationId: org ? org.id : (user ? user.organizationId : null),
        details: { reason, orgCode: orgCode || null },
      });
    };

    // Wrong bank's page counts as "no such user" — same response as a bad email.
    if (!user || (org && user.organizationId !== org.id)) {
      await verifyPassword(password, DUMMY_HASH);
      await fail('unknown_user');
      return res.status(401).json(INVALID);
    }
    if (!(await verifyPassword(password, user.passwordHash))) { await fail('bad_password'); return res.status(401).json(INVALID); }
    if (user.status !== 'ACTIVE') { await fail('inactive'); return res.status(401).json({ status: 'error', message: 'This account has been deactivated. Contact your administrator.' }); }

    if (!org && user.organizationId) {
      // Correct password, but a bank user on the platform page.
      await fail('wrong_login_page');
      const base = await appBaseUrl(req);
      return res.status(400).json({
        status: 'error',
        code: 'ORG_LOGIN_REQUIRED',
        message: `Please sign in from your organisation's login page: ${base}/o/${user.Organization.code}`,
        loginPath: `/o/${user.Organization.code}`,
      });
    }

    if (user.organizationId) {
      const access = checkOrgAccess(user.Organization);
      if (!access.ok) { await fail(access.code); return res.status(403).json({ status: 'error', code: access.code, message: access.message }); }
    }

    if (user.mfaEnabled) {
      await audit(req, 'auth.login.password_ok_mfa_pending', { actor: actorOf(user), organizationId: user.organizationId });
      return res.json({ mfaRequired: true, mfaToken: signMfaChallengeToken(user), user: { name: user.name, email: user.email } });
    }
    res.json(await finishLogin(req, user, false));
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// POST /mfa/verify-login — { mfaToken, code } -> full session
router.post('/mfa/verify-login', async (req, res) => {
  try {
    const { mfaToken, code } = req.body || {};
    if (!mfaToken || !code) return res.status(400).json({ status: 'error', message: 'mfaToken and code are required' });
    let payload;
    try { payload = verifyMfaChallengeToken(mfaToken); } catch (err) {
      return res.status(401).json({ status: 'error', code: 'MFA_EXPIRED', message: 'This sign-in attempt has expired. Please sign in again.' });
    }
    const user = await User.findByPk(payload.sub, withOrg);
    if (!user || user.status !== 'ACTIVE' || !user.mfaEnabled || !user.mfaSecret) {
      return res.status(401).json({ status: 'error', code: 'MFA_EXPIRED', message: 'Invalid sign-in attempt. Please sign in again.' });
    }
    if (user.organizationId) {
      const access = checkOrgAccess(user.Organization);
      if (!access.ok) return res.status(403).json({ status: 'error', code: access.code, message: access.message });
    }
    if (!verifyMfaCode(code, decryptMfaSecret(user.mfaSecret))) {
      await audit(req, 'auth.login.failed', { actor: actorOf(user), organizationId: user.organizationId, details: { reason: 'bad_mfa_code' } });
      return res.status(401).json({ status: 'error', message: 'Incorrect code. Check the time on your device and try again.' });
    }
    res.json(await finishLogin(req, user, true));
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.get('/me', authenticate, async (req, res) => {
  const user = await User.findByPk(req.user.id, withOrg);
  if (!user) return res.status(404).json({ status: 'error', message: 'Not found' });
  res.json({ data: await publicUser(user) });
});

router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ status: 'error', message: 'Current and new password are required' });
    if (String(newPassword).length < 8) return res.status(400).json({ status: 'error', message: 'New password must be at least 8 characters' });
    if (currentPassword === newPassword) return res.status(400).json({ status: 'error', message: 'New password must be different from the current one' });
    const user = await User.findByPk(req.user.id);
    if (!(await verifyPassword(currentPassword, user.passwordHash))) return res.status(401).json({ status: 'error', message: 'Current password is incorrect' });
    user.passwordHash = await hashPassword(newPassword);
    user.mustChangePassword = false;
    await user.save();
    await audit(req, 'auth.password.change', { targetType: 'user', targetId: user.id });
    res.json({ status: 'ok', message: 'Password changed' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ------------------------------------------------------- forgot password

/**
 * POST /forgot-password — { email, orgCode? }. Always answers the same way
 * whether or not the account exists (no email enumeration). Sends a
 * single-use, 30-minute link if the account exists and SMTP is set up.
 */
router.post('/forgot-password', async (req, res) => {
  const generic = { status: 'ok', message: 'If an account exists for that email, a reset link has been sent. It is valid for 30 minutes.' };
  try {
    const email = String((req.body || {}).email || '').toLowerCase().trim();
    const orgCode = String((req.body || {}).orgCode || '').trim();
    if (!email) return res.status(400).json({ status: 'error', message: 'Email is required' });
    const org = orgCode ? await findOrgByCode(orgCode) : null;
    const user = await User.findOne({ where: { email }, ...withOrg });
    const eligible = user && user.status === 'ACTIVE' &&
      (org ? user.organizationId === org.id : user.role === 'SUPER_ADMIN') &&
      (!user.organizationId || checkOrgAccess(user.Organization).ok);
    if (!eligible) {
      await audit(req, 'auth.reset.requested_unknown', { actor: { email }, organizationId: org ? org.id : null });
      return res.json(generic);
    }
    await PasswordResetToken.update({ usedAt: new Date() }, { where: { userId: user.id, usedAt: null } });
    const { token, hash } = secretBox.randomToken(32);
    await PasswordResetToken.create({ userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + RESET_TTL_MS), requestedIp: req.ip });
    const base = await appBaseUrl(req);
    const path = user.organizationId ? `/o/${encodeURIComponent(user.Organization.code)}` : '/';
    const resetUrl = `${base}${path}#/reset-password?token=${encodeURIComponent(token)}`;
    const mail = await mailer.sendMail({ organizationId: user.organizationId, to: user.email, ...mailer.resetEmail({ name: user.name, resetUrl }) });
    await audit(req, 'auth.reset.requested', { actor: actorOf(user), organizationId: user.organizationId, details: { emailSent: mail.sent, error: mail.error || undefined } });
    res.json(generic);
  } catch (err) {
    console.error('[forgot-password]', err);
    res.json(generic);
  }
});

// POST /reset-password — { token, newPassword }
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) return res.status(400).json({ status: 'error', message: 'Token and new password are required' });
    if (String(newPassword).length < 8) return res.status(400).json({ status: 'error', message: 'New password must be at least 8 characters' });
    const row = await PasswordResetToken.findOne({
      where: { tokenHash: secretBox.sha256(token), usedAt: null, expiresAt: { [Op.gt]: new Date() } },
    });
    if (!row) return res.status(400).json({ status: 'error', code: 'RESET_INVALID', message: 'This reset link is invalid or has expired. Request a new one.' });
    const user = await User.findByPk(row.userId);
    if (!user || user.status !== 'ACTIVE') return res.status(400).json({ status: 'error', code: 'RESET_INVALID', message: 'This reset link is invalid or has expired.' });
    user.passwordHash = await hashPassword(newPassword);
    user.mustChangePassword = false;
    await user.save();
    row.usedAt = new Date();
    await row.save();
    await audit(req, 'auth.reset.completed', { actor: actorOf(user), organizationId: user.organizationId, targetType: 'user', targetId: user.id });
    // MFA is deliberately left as-is: a reset link proves control of the
    // mailbox, not of the authenticator — the next sign-in still asks for a code.
    res.json({ status: 'ok', message: 'Password updated. You can now sign in.' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ------------------------------------------------------------------- MFA
// Self-service, off by default. Enabling is two steps (setup -> confirm) so
// a secret is saved only after the user has proven their app generates
// valid codes — a hiccup mid-setup can't lock anyone out.

router.get('/mfa/setup', authenticate, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (user.mfaEnabled) return res.status(400).json({ status: 'error', message: 'MFA is already enabled. Disable it first to re-enrol.' });
    const secret = generateMfaSecret();
    const otpauthUrl = mfaKeyUri(user.email, secret);
    res.json({ data: { secret, otpauthUrl, qrCodeDataUrl: await mfaQrCodeDataUrl(otpauthUrl) } });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/mfa/confirm', authenticate, async (req, res) => {
  try {
    const { secret, code } = req.body || {};
    if (!secret || !code) return res.status(400).json({ status: 'error', message: 'secret and code are required' });
    if (!/^[A-Z2-7]{16,64}$/.test(String(secret))) return res.status(400).json({ status: 'error', message: 'Invalid secret. Start the setup again.' });
    if (!verifyMfaCode(code, secret)) return res.status(400).json({ status: 'error', message: 'Incorrect code. Check the time on your device and try again.' });
    const user = await User.findByPk(req.user.id);
    if (user.mfaEnabled) return res.status(400).json({ status: 'error', message: 'MFA is already enabled.' });
    user.mfaSecret = encryptMfaSecret(secret);
    user.mfaEnabled = true;
    user.mfaEnrolledAt = new Date();
    await user.save();
    await audit(req, 'auth.mfa.enable', { targetType: 'user', targetId: user.id });
    res.json({ status: 'ok', message: 'Two-factor authentication is now on for your account.' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Requires the password again, so an unattended signed-in browser can't strip MFA.
router.post('/mfa/disable', authenticate, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ status: 'error', message: 'Password is required' });
    const user = await User.findByPk(req.user.id);
    if (!(await verifyPassword(password, user.passwordHash))) return res.status(401).json({ status: 'error', message: 'Password is incorrect' });
    user.mfaEnabled = false;
    user.mfaSecret = null;
    user.mfaEnrolledAt = null;
    await user.save();
    await audit(req, 'auth.mfa.disable', { targetType: 'user', targetId: user.id });
    res.json({ status: 'ok', message: 'Two-factor authentication has been turned off for your account.' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
