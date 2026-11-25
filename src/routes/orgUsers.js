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
const models = require('../models');
const { User, Organization } = models;
const { authenticate } = require('../middleware/auth');
const { requireFeaturePermission } = require('../middleware/permissions');
const users = require('../services/userAdmin');

const router = express.Router({ mergeParams: true });
const { publicUser, sendError } = users;

const MANAGEABLE_ROLES = [
  'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER',
  'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'DEPARTMENT_HEAD', 'EMPLOYEE',
];

router.use(authenticate);

router.use((req, res, next) => {
  if (req.user.role !== 'SUPER_ADMIN' && String(req.params.orgId) !== String(req.user.organizationId)) {
    return res.status(403).json({ status: 'error', message: "Cannot manage another organisation's users" });
  }
  next();
});

router.use('/:userId', async (req, res, next) => {
  if (req.params.userId === 'smtp-status') return next();
  try { req.targetUser = await users.tenantResource(User, req.params.userId, req.params.orgId); next(); } catch (error) { sendError(res, error); }
});
router.use(async (req, res, next) => {
  try {
    if (req.body?.employeeId != null && req.body.employeeId !== '') await users.tenantResource(models.Employee, req.body.employeeId, req.params.orgId);
    if (Array.isArray(req.body?.assignments)) for (const assignment of req.body.assignments) {
      if (assignment?.roleId != null) await users.tenantResource(models.OrganizationRole, assignment.roleId, req.params.orgId);
      for (const [key, Model] of [['branchIds', models.OrganizationBranch], ['departmentIds', models.OrganizationDepartment]]) if (Array.isArray(assignment?.[key])) for (const id of assignment[key]) await users.tenantResource(Model, id, req.params.orgId);
    }
    next();
  } catch (error) { sendError(res, error); }
});
router.use(requireFeaturePermission('users.manage', ['SUPER_ADMIN', 'ORG_ADMIN']));

async function loadOrgOr404(req, res) {
  const org = await Organization.findByPk(req.params.orgId);
  if (!org) {
    res.status(404).json({ status: 'error', message: 'Organisation not found' });
    return null;
  }
  return org;
}

async function loadUserInOrgOr404(req, res) {
  const user = req.targetUser || await User.findOne({ where: { id: req.params.userId, organizationId: req.params.orgId } });
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

router.get('/smtp-status', async (req, res) => {
  try {
    const org = await loadOrgOr404(req, res);
    if (!org) return;
    const [smtp, loginUrl] = await Promise.all([
      users.smtpAvailability(org.id),
      users.loginUrlFor(req, org.id),
    ]);
    res.json({ data: { ...smtp, loginUrl } });
  } catch (err) { sendError(res, err); }
});

router.post('/', async (req, res) => {
  try {
    const org = await loadOrgOr404(req, res);
    if (!org) return;
    const b = users.inputShape(req.body || {}, ['email', 'name', 'role', 'employeeId', 'assignments', 'sendEmail']);
    if (b.role !== undefined && !MANAGEABLE_ROLES.includes(b.role)) {
      return res.status(400).json({ status: 'error', message: `role must be one of: ${MANAGEABLE_ROLES.join(', ')}` });
    }
    const r = await users.createAccount(req, {
      organizationId: org.id, email: b.email, name: b.name, role: b.role, employeeId: b.employeeId, assignments: b.assignments, sendEmail: b.sendEmail,
    });
    res.status(201).json({ data: publicUser(r.user), tempPassword: r.tempPassword, email: r.email, loginUrl: r.loginUrl });
  } catch (err) { sendError(res, err); }
});

// PUT /:userId — name / role / status / employee link (not email, not password)
router.put('/:userId', async (req, res) => {
  try {
    const user = await loadUserInOrgOr404(req, res);
    if (!user) return;
    const updated = await users.updateOrganizationUser(req, user, req.body || {});
    res.json({ data: publicUser(updated) });
  } catch (err) { sendError(res, err); }
});

router.post('/:userId/reset-password', async (req, res) => {
  try {
    const user = await loadUserInOrgOr404(req, res);
    if (!user) return;
    if (user.id === req.user.id) return res.status(400).json({ status: 'error', message: 'Use My account to change your own password.' });
    const r = await users.resetPassword(req, user, (req.body || {}).sendEmail);
    res.json({ status: 'ok', data: publicUser(user), tempPassword: r.tempPassword, email: r.email, loginUrl: r.loginUrl });
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

// DELETE /:userId archives access while retaining the account identity,
// role history, employee link and audit references.
router.delete('/:userId', async (req, res) => {
  try {
    if (req.user.role === 'SUPER_ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Only an Organisation Admin can remove users from the organisation.' });
    }
    const user = await loadUserInOrgOr404(req, res);
    if (!user) return;
    const result = await require('../services/organizationLifecycle').archiveUser({ organizationId: req.params.orgId, actor: req.user, userId: user.id, reason: req.body?.reason });
    await user.reload();
    res.json({ data: publicUser(user), archived: true, changed: result.changed, message: result.changed ? 'User archived. Historical records and audit trails were retained.' : 'User was already archived.' });
  } catch (err) { sendError(res, err); }
});

module.exports = router;
