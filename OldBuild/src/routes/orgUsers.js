'use strict';

/**
 * Org user management — /api/v1/organizations/:orgId/users
 *
 * ORG_ADMIN manages users within their own organisation only (enforced
 * below, not just by convention). SUPER_ADMIN may manage users in any
 * organisation by putting its id in the URL. Nobody can create a
 * SUPER_ADMIN through this router — platform users are managed under
 * /api/v1/admin/platform-users.
 *
 * Creating or reactivating a user takes a licence seat (Organization.maxUsers).
 */

const express = require('express');
const { User, Organization } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const users = require('../services/userAdmin');

const router = express.Router({ mergeParams: true });
const { publicUser, sendError } = users;

const MANAGEABLE_ROLES = [
  'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER',
  'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'DEPARTMENT_HEAD', 'EMPLOYEE',
];

router.use(authenticate, requireRole('SUPER_ADMIN', 'ORG_ADMIN'));

router.use((req, res, next) => {
  if (req.user.role !== 'SUPER_ADMIN' && String(req.params.orgId) !== String(req.user.organizationId)) {
    return res.status(403).json({ status: 'error', message: "Cannot manage another organisation's users" });
  }
  next();
});

async function loadOrgOr404(req, res) {
  const org = await Organization.findByPk(req.params.orgId);
  if (!org) {
    res.status(404).json({ status: 'error', message: 'Organisation not found' });
    return null;
  }
  return org;
}

async function loadUserInOrgOr404(req, res) {
  const user = await User.findByPk(req.params.userId);
  if (!user || String(user.organizationId) !== String(req.params.orgId)) {
    res.status(404).json({ status: 'error', message: 'User not found' });
    return null;
  }
  return user;
}

router.get('/', async (req, res) => {
  try {
    if (!(await loadOrgOr404(req, res))) return;
    const list = await User.findAll({ where: { organizationId: req.params.orgId }, order: [['id', 'ASC']] });
    res.json({ data: list.map(publicUser) });
  } catch (err) { sendError(res, err); }
});

router.post('/', async (req, res) => {
  try {
    const org = await loadOrgOr404(req, res);
    if (!org) return;
    const b = req.body || {};
    if (!MANAGEABLE_ROLES.includes(b.role)) {
      return res.status(400).json({ status: 'error', message: `role must be one of: ${MANAGEABLE_ROLES.join(', ')}` });
    }
    const r = await users.createAccount(req, {
      organizationId: org.id, email: b.email, name: b.name, role: b.role, employeeId: b.employeeId, sendEmail: b.sendEmail,
    });
    res.status(201).json({ data: publicUser(r.user), tempPassword: r.tempPassword, email: r.email });
  } catch (err) { sendError(res, err); }
});

// PUT /:userId — name / role / status (not email, not password)
router.put('/:userId', async (req, res) => {
  try {
    const user = await loadUserInOrgOr404(req, res);
    if (!user) return;
    const { name, role, status } = req.body || {};
    const isSelf = user.id === req.user.id;
    if (role !== undefined && role !== user.role) {
      if (!MANAGEABLE_ROLES.includes(role)) {
        return res.status(400).json({ status: 'error', message: `role must be one of: ${MANAGEABLE_ROLES.join(', ')}` });
      }
      if (isSelf) return res.status(400).json({ status: 'error', message: 'You cannot change your own role.' });
    }
    if (status === 'INACTIVE' && isSelf) {
      return res.status(400).json({ status: 'error', message: 'You cannot deactivate your own account.' });
    }
    if (status !== undefined) await users.setStatus(req, user, status);
    let changed = false;
    if (name !== undefined && String(name).trim()) { user.name = String(name).trim(); changed = true; }
    if (role !== undefined && role !== user.role) { user.role = role; changed = true; }
    if (changed) {
      await user.save();
      await require('../services/audit').audit(req, 'user.update', {
        organizationId: user.organizationId, targetType: 'user', targetId: user.id, details: { name: user.name, role: user.role },
      });
    }
    res.json({ data: publicUser(user) });
  } catch (err) { sendError(res, err); }
});

router.post('/:userId/reset-password', async (req, res) => {
  try {
    const user = await loadUserInOrgOr404(req, res);
    if (!user) return;
    if (user.id === req.user.id) return res.status(400).json({ status: 'error', message: 'Use My account to change your own password.' });
    const r = await users.resetPassword(req, user, (req.body || {}).sendEmail);
    res.json({ status: 'ok', tempPassword: r.tempPassword, email: r.email });
  } catch (err) { sendError(res, err); }
});

/**
 * Clears MFA on another user's account (lost phone / new device). There
 * are no backup codes yet, so this admin-initiated reset is the recovery
 * path; the user re-enrols from My account.
 */
router.post('/:userId/reset-mfa', async (req, res) => {
  try {
    const user = await loadUserInOrgOr404(req, res);
    if (!user) return;
    if (user.id === req.user.id) return res.status(400).json({ status: 'error', message: 'Use My account to change your own MFA.' });
    await users.resetMfa(req, user);
    res.json({ data: publicUser(user), message: 'MFA cleared. They can sign in with just their password and re-enrol from My account.' });
  } catch (err) { sendError(res, err); }
});

// DELETE /:userId — two-step: an ACTIVE account is disabled (soft delete);
// calling DELETE again on an already-INACTIVE account permanently removes
// it. This is deliberate friction: nothing gets permanently deleted on the
// first call.
router.delete('/:userId', async (req, res) => {
  try {
    const user = await loadUserInOrgOr404(req, res);
    if (!user) return;
    if (user.id === req.user.id) return res.status(400).json({ status: 'error', message: 'You cannot deactivate or delete your own account.' });
    if (user.status === 'INACTIVE') {
      await users.hardDelete(req, user);
      return res.json({ status: 'ok', deleted: true, message: 'User permanently deleted.' });
    }
    await users.setStatus(req, user, 'INACTIVE');
    res.json({ data: publicUser(user), deleted: false, message: 'User deactivated. Delete again to permanently remove the account.' });
  } catch (err) { sendError(res, err); }
});

module.exports = router;
