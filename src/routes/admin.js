'use strict';

/**
 * Super Admin platform routes — /api/v1/admin/*. Every route requires SUPER_ADMIN.
 *
 *   Organisations   onboarding, profile, licence (plan, dates, seat limits),
 *                   suspend/reactivate, logo, first Org Admin
 *   Platform users  other Super Admin accounts
 *   Settings        platform name/contacts, Banihal logo + favicon, SMTP
 *   Audit           the platform-wide audit trail
 *
 * There is deliberately no self-service signup: a new UCB client is
 * onboarded by a Super Admin creating the organisation and its first Org
 * Admin; that Org Admin then manages their own bank's users.
 */

const express = require('express');
const { Op, fn, col, where: sqlWhere } = require('sequelize');
const { Organization, User, AuditLog, sequelize } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { licenseSummary, todayIST, daysBetween } = require('../services/orgAccess');
const license = require('../services/license');
const brand = require('../services/brandAssets');
const mailer = require('../services/mailer');
const { getPlatformSettings } = require('../services/settings');
const { audit, auditPage } = require('../services/audit');
const auditRetention = require('../services/auditRetention');
const users = require('../services/userAdmin');
const orgFields = require('../services/orgFields');
const orgDomains = require('../services/orgDomains');
const payScaleLibrary = require('../services/payScaleLibrary');
const payScaleRevision = require('../services/payScaleRevision');
const { parseCsv, toCsv } = require('../services/csv');

const router = express.Router();
router.use(authenticate, requireRole('SUPER_ADMIN'));

const { publicUser, sendError } = users;

async function orgView(org, req) {
  const [usage, logo, cnameTarget] = await Promise.all([license.usage(org.id), brand.info(org.id, 'LOGO'), orgDomains.cnameTargetFor(req)]);
  return {
    ...org.toJSON(),
    bankClassLabel: payScaleLibrary.BANK_CLASS_LABELS[org.bankClass] || null,
    license: licenseSummary(org),
    usage,
    logo,
    cnameTarget,
    loginUrl: org.customDomain ? `https://${org.customDomain}/` : null,
  };
}

/**
 * A bank's custom domain must be unique and must not be the application's own
 * host. Returns a { status, message } to send back, or null when it's fine.
 */
async function domainConflict(domain, excludeOrgId, req) {
  if (!domain) return null;
  if (await orgDomains.isReservedHost(domain, req)) {
    return { status: 409, message: `${domain} is this application's own address and cannot be used as a bank's domain.` };
  }
  const clash = await Organization.findOne({ where: { customDomain: domain } });
  if (clash && Number(clash.id) !== Number(excludeOrgId)) {
    return { status: 409, message: `Custom domain ${domain} is already used by another organisation.` };
  }
  return null;
}

/** The exact DNS record a client must create, for their onboarding checklist. */
async function domainInstructions(org, req) {
  const target = await orgDomains.cnameTargetFor(req);
  return {
    domain: org.customDomain || null,
    recordType: 'CNAME',
    host: org.customDomain || null,
    value: target,
    verifiedAt: org.customDomainVerifiedAt || null,
    note: target
      ? `Create a CNAME record for ${org.customDomain || 'your subdomain'} pointing to ${target}.`
      : 'This application has no public base URL configured yet — set it under Platform Settings before pointing a domain here.',
  };
}

// ------------------------------------------------------------ dashboard

router.get('/dashboard', async (req, res) => {
  try {
    const orgs = await Organization.findAll();
    const today = todayIST();
    let active = 0; let suspended = 0; let expired = 0; let expiringSoon = 0;
    for (const o of orgs) {
      const s = licenseSummary(o).state;
      if (o.status !== 'ACTIVE') suspended += 1;
      else if (s === 'ORG_LICENSE_EXPIRED') expired += 1;
      else {
        active += 1;
        if (o.licenseExpiresAt && daysBetween(today, String(o.licenseExpiresAt)) <= 30) expiringSoon += 1;
      }
    }
    const [orgUsers, platformUsers, failedLogins24h] = await Promise.all([
      User.count({ where: { organizationId: { [Op.ne]: null }, status: 'ACTIVE' } }),
      User.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' } }),
      AuditLog.count({ where: { action: 'auth.login.failed', createdAt: { [Op.gte]: new Date(Date.now() - 86400000) } } }),
    ]);
    res.json({ data: { organisations: { total: orgs.length, active, suspended, expired, expiringSoon }, orgUsers, platformUsers, failedLogins24h } });
  } catch (err) { sendError(res, err); }
});

// -------------------------------------------------------- organisations

router.get('/organizations', async (req, res) => {
  try {
    const rows = await Organization.findAll({ order: [['id', 'ASC']] });
    res.json({ data: await Promise.all(rows.map((o) => orgView(o, req))) });
  } catch (err) { sendError(res, err); }
});

router.get('/organizations/:id', async (req, res) => {
  try {
    const org = await Organization.findByPk(req.params.id);
    if (!org) return res.status(404).json({ status: 'error', message: 'Not found' });
    const [list, smtpRow] = await Promise.all([
      User.findAll({ where: { organizationId: org.id }, order: [['id', 'ASC']] }),
      mailer.getConfigRow(org.id),
    ]);
    res.json({
      data: {
        organization: await orgView(org, req),
        domain: await domainInstructions(org, req),
        users: list.map(publicUser),
        smtp: { configured: !!(smtpRow && smtpRow.enabled && smtpRow.host), lastTestOk: smtpRow ? smtpRow.lastTestOk : null },
      },
    });
  } catch (err) { sendError(res, err); }
});

// GET — the 6 Kerala UCB licensing classes, for the onboarding form's picker
router.get('/bank-classes', (req, res) => {
  res.json({ data: payScaleLibrary.BANK_CLASS_LIST });
});

// -------------------------------------------------- pay scale revisions
// A Super Admin applying a Government pay-scale revision to one
// organisation at a time: download a CSV pre-filled with that org's
// current posts/scales, edit the changed rows' newScaleExpression, upload
// it back. See services/payScaleRevision.js.
router.get('/organizations/:id/pay-scale-template.csv', async (req, res) => {
  try {
    const org = await Organization.findByPk(req.params.id);
    if (!org) return res.status(404).json({ status: 'error', message: 'Not found' });
    const rows = await payScaleRevision.templateRows(org.id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pay-scale-template-${org.code}.csv"`);
    res.send(toCsv(rows, payScaleRevision.TEMPLATE_HEADERS));
  } catch (err) { sendError(res, err); }
});

router.post('/organizations/:id/pay-scales/bulk-apply', async (req, res) => {
  try {
    const org = await Organization.findByPk(req.params.id);
    if (!org) return res.status(404).json({ status: 'error', message: 'Not found' });
    const b = req.body || {};
    const csvText = b.csv;
    if (!csvText || !String(csvText).trim()) return res.status(400).json({ status: 'error', message: 'No CSV content provided.' });
    const rows = parseCsv(csvText);
    if (!rows.length) return res.status(400).json({ status: 'error', message: 'CSV has no data rows.' });
    const result = await payScaleRevision.applyRevision({
      organizationId: org.id, revisionName: b.revisionName, effectiveDate: b.effectiveDate, description: b.description, rows,
    });
    await audit(req, 'payscale.revision.bulk_apply', {
      organizationId: org.id, targetType: 'pay_revision', targetId: result.revision.id,
      details: { revisionName: result.revision.name, applied: result.applied.length },
    });
    res.status(201).json({ data: { revision: result.revision, applied: result.applied } });
  } catch (err) { res.status(err.status || 400).json({ status: 'error', message: err.message }); }
});

// POST — onboard a new UCB tenant (profile + licence in one step). The bank
// class is required and chosen once here — it drives which reference
// post/pay-scale library (src/seed/payScalesUCB.js) gets auto-provisioned
// into this organisation.
router.post('/organizations', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ status: 'error', message: 'Registered name is required' });
    if (!b.bankClass) return res.status(400).json({ status: 'error', message: 'Bank class is required — choose one of the 6 Kerala UCB licensing classes' });
    const code = orgFields.normaliseCode(b.code);
    const clash = await Organization.findOne({ where: sqlWhere(fn('upper', col('code')), code) });
    if (clash) return res.status(409).json({ status: 'error', message: `Organisation code ${code} is already in use` });
    const fields = orgFields.superAdminFields(b);
    if (fields.customDomain) {
      const conflict = await domainConflict(fields.customDomain, null, req);
      if (conflict) return res.status(conflict.status).json({ status: 'error', message: conflict.message });
    }
    orgFields.checkDateOrder(Organization.build({ ...fields, code }));
    const org = await sequelize.transaction(async (transaction) => {
      const created = await Organization.create({ ...fields, code, status: 'ACTIVE' }, { transaction });
      await payScaleLibrary.provisionForOrganization(created, { transaction });
      return created;
    });
    await audit(req, 'org.create', { organizationId: org.id, targetType: 'organization', targetId: org.id, details: { code, name: org.name, bankClass: org.bankClass, ...pickLicense(org) } });
    res.status(201).json({ data: await orgView(org, req) });
  } catch (err) { sendError(res, err); }
});

function pickLicense(o) {
  return {
    status: o.status, licensePlan: o.licensePlan, licenseStartsAt: o.licenseStartsAt,
    licenseExpiresAt: o.licenseExpiresAt, maxUsers: o.maxUsers, maxEmployees: o.maxEmployees,
  };
}

/**
 * PUT — profile and the "licence & access" controls: suspend/reactivate
 * (status), plan, validity dates, seat limits. Access changes are enforced
 * on every authenticated request (middleware/auth.js), so suspending or
 * expiring a bank cuts off sessions already in progress.
 */
router.put('/organizations/:id', async (req, res) => {
  try {
    const org = await Organization.findByPk(req.params.id);
    if (!org) return res.status(404).json({ status: 'error', message: 'Not found' });
    // Bank class can be changed at any time. Changing it never touches
    // existing posts/pay scales (or anything an employee references) — it
    // only ADDS the new class's posts/scales if the org doesn't already
    // have them (see payScaleLibrary.seedMissingPosts), so switching back
    // and forth never loses data.
    const before = pickLicense(org);
    const bankClassChanged = req.body && req.body.bankClass !== undefined && req.body.bankClass !== org.bankClass;
    const prevDomain = org.customDomain;
    Object.assign(org, orgFields.superAdminFields(req.body));
    if (org.customDomain !== prevDomain) {
      if (org.customDomain) {
        const conflict = await domainConflict(org.customDomain, org.id, req);
        if (conflict) return res.status(conflict.status).json({ status: 'error', message: conflict.message });
      }
      org.customDomainVerifiedAt = null; // a changed domain has to be verified again
    }
    orgFields.checkDateOrder(org);
    if (bankClassChanged) {
      await sequelize.transaction(async (transaction) => {
        await org.save({ transaction });
        await payScaleLibrary.provisionForOrganization(org, { transaction });
      });
    } else {
      await org.save();
    }
    const after = pickLicense(org);
    const changed = Object.keys(after).filter((k) => String(after[k]) !== String(before[k]));
    if (bankClassChanged) changed.push('bankClass');
    if (changed.length) {
      const action = changed.includes('status') ? (org.status === 'ACTIVE' ? 'org.reactivate' : 'org.suspend') : 'org.license.update';
      await audit(req, action, { organizationId: null, targetType: 'organization', targetId: org.id, details: { before, after, orgCode: org.code } });
    } else {
      await audit(req, 'org.profile.update', { organizationId: null, targetType: 'organization', targetId: org.id, details: { orgCode: org.code } });
    }
    res.json({ data: await orgView(org, req) });
  } catch (err) { sendError(res, err); }
});

// GET — the exact DNS record a client must create for their custom domain,
// plus whether it has been verified. The organisation page renders this as
// the client's onboarding checklist.
router.get('/organizations/:id/domain', async (req, res) => {
  try {
    const org = await Organization.findByPk(req.params.id);
    if (!org) return res.status(404).json({ status: 'error', message: 'Not found' });
    res.json({ data: await domainInstructions(org, req) });
  } catch (err) { sendError(res, err); }
});

// POST — check the client's DNS really points at this application, and record
// when it last passed. This confirms the CNAME step during onboarding; it is
// never an access gate, and a transient failure does not clear a prior pass.
router.post('/organizations/:id/verify-domain', async (req, res) => {
  try {
    const org = await Organization.findByPk(req.params.id);
    if (!org) return res.status(404).json({ status: 'error', message: 'Not found' });
    if (!org.customDomain) return res.status(400).json({ status: 'error', message: 'This organisation has no custom domain set.' });
    const target = await orgDomains.cnameTargetFor(req);
    const result = await orgDomains.verifyDomain(org.customDomain, target);
    if (result.ok) {
      org.customDomainVerifiedAt = new Date();
      await org.save();
    }
    await audit(req, 'org.domain.verify', {
      organizationId: null, targetType: 'organization', targetId: org.id,
      details: { domain: org.customDomain, ok: result.ok, method: result.method, target, orgCode: org.code },
    });
    res.json({ data: { ...result, verifiedAt: org.customDomainVerifiedAt || null } });
  } catch (err) { sendError(res, err); }
});

router.put('/organizations/:id/logo', async (req, res) => {
  try {
    const org = await Organization.findByPk(req.params.id);
    if (!org) return res.status(404).json({ status: 'error', message: 'Not found' });
    const info = await brand.save(org.id, 'LOGO', (req.body || {}).dataUrl, req.user.id);
    await audit(req, 'org.logo.update', { organizationId: org.id, targetType: 'organization', targetId: org.id, details: info });
    res.json({ data: info });
  } catch (err) { sendError(res, err); }
});

router.delete('/organizations/:id/logo', async (req, res) => {
  try {
    await brand.remove(req.params.id, 'LOGO');
    await audit(req, 'org.logo.remove', { organizationId: Number(req.params.id), targetType: 'organization', targetId: req.params.id });
    res.json({ status: 'ok' });
  } catch (err) { sendError(res, err); }
});

// POST — create an ORG_ADMIN for a tenant (first one at onboarding, or another later)
router.post('/organizations/:id/admin-users', async (req, res) => {
  try {
    const org = await Organization.findByPk(req.params.id);
    if (!org) return res.status(404).json({ status: 'error', message: 'Organisation not found' });
    const b = req.body || {};
    const r = await users.createAccount(req, { organizationId: org.id, email: b.email, name: b.name, role: 'ORG_ADMIN', sendEmail: b.sendEmail });
    res.status(201).json({ data: publicUser(r.user), tempPassword: r.tempPassword, email: r.email });
  } catch (err) { sendError(res, err); }
});

// ------------------------------------------------------- platform users

async function loadSuperAdmin(req, res) {
  const u = await User.findByPk(req.params.userId);
  if (!u || u.role !== 'SUPER_ADMIN') {
    res.status(404).json({ status: 'error', message: 'Platform user not found' });
    return null;
  }
  return u;
}

router.get('/platform-users', async (req, res) => {
  try {
    const list = await User.findAll({ where: { role: 'SUPER_ADMIN' }, order: [['id', 'ASC']] });
    res.json({ data: list.map(publicUser) });
  } catch (err) { sendError(res, err); }
});

router.post('/platform-users', async (req, res) => {
  try {
    const b = req.body || {};
    const r = await users.createAccount(req, { organizationId: null, email: b.email, name: b.name, role: 'SUPER_ADMIN', sendEmail: b.sendEmail });
    res.status(201).json({ data: publicUser(r.user), tempPassword: r.tempPassword, email: r.email });
  } catch (err) { sendError(res, err); }
});

router.put('/platform-users/:userId', async (req, res) => {
  try {
    const u = await loadSuperAdmin(req, res);
    if (!u) return;
    const b = req.body || {};
    if (b.status !== undefined && b.status !== u.status) {
      if (b.status === 'INACTIVE') {
        if (u.id === req.user.id) return res.status(400).json({ status: 'error', message: 'You cannot deactivate your own account.' });
        const activeSupers = await User.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' } });
        if (activeSupers <= 1) return res.status(400).json({ status: 'error', message: 'This is the last active Super Admin — create another before deactivating it.' });
      }
      await users.setStatus(req, u, b.status);
    }
    if (b.name !== undefined && String(b.name).trim()) {
      u.name = String(b.name).trim();
      await u.save();
    }
    res.json({ data: publicUser(u) });
  } catch (err) { sendError(res, err); }
});

router.post('/platform-users/:userId/reset-password', async (req, res) => {
  try {
    const u = await loadSuperAdmin(req, res);
    if (!u) return;
    if (u.id === req.user.id) return res.status(400).json({ status: 'error', message: 'Use My account to change your own password.' });
    const r = await users.resetPassword(req, u, (req.body || {}).sendEmail);
    res.json({ status: 'ok', tempPassword: r.tempPassword, email: r.email });
  } catch (err) { sendError(res, err); }
});

router.post('/platform-users/:userId/reset-mfa', async (req, res) => {
  try {
    const u = await loadSuperAdmin(req, res);
    if (!u) return;
    if (u.id === req.user.id) return res.status(400).json({ status: 'error', message: 'Use My account to change your own MFA.' });
    await users.resetMfa(req, u);
    res.json({ data: publicUser(u) });
  } catch (err) { sendError(res, err); }
});

// DELETE /platform-users/:userId — same two-step as org users (see
// routes/orgUsers.js): disables first, permanently deletes on a second call
// once already INACTIVE. Never lets the last active Super Admin be
// disabled or deleted, so the platform is never left with no one able to
// sign in.
router.delete('/platform-users/:userId', async (req, res) => {
  try {
    const u = await loadSuperAdmin(req, res);
    if (!u) return;
    if (u.id === req.user.id) return res.status(400).json({ status: 'error', message: 'You cannot deactivate or delete your own account.' });
    if (u.status === 'INACTIVE') {
      await users.hardDelete(req, u);
      return res.json({ status: 'ok', deleted: true, message: 'Platform user permanently deleted.' });
    }
    const activeSupers = await User.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' } });
    if (activeSupers <= 1) return res.status(400).json({ status: 'error', message: 'This is the last active Super Admin — create another before deactivating it.' });
    await users.setStatus(req, u, 'INACTIVE');
    res.json({ data: publicUser(u), deleted: false, message: 'Platform user deactivated. Delete again to permanently remove the account.' });
  } catch (err) { sendError(res, err); }
});

// ------------------------------------------------------------- settings

router.get('/settings', async (req, res) => {
  try {
    const s = await getPlatformSettings();
    const [logo, favicon, smtpRow] = await Promise.all([brand.info(null, 'LOGO'), brand.info(null, 'FAVICON'), mailer.getConfigRow(null)]);
    res.json({ data: { settings: s, logo, favicon, smtp: mailer.publicView(smtpRow), limits: brand.LIMITS } });
  } catch (err) { sendError(res, err); }
});

router.put('/settings', async (req, res) => {
  try {
    const s = await getPlatformSettings();
    const b = req.body || {};
    const text = (v, max) => (String(v == null ? '' : v).trim().slice(0, max) || null);
    if (b.platformName !== undefined) s.platformName = text(b.platformName, 128) || 'UCB HRMS & Payroll';
    if (b.companyName !== undefined) s.companyName = text(b.companyName, 255) || 'Banihal Technologies LLP';
    if (b.supportEmail !== undefined) s.supportEmail = text(b.supportEmail, 255);
    if (b.supportPhone !== undefined) s.supportPhone = text(b.supportPhone, 64);
    if (b.loginMessage !== undefined) s.loginMessage = text(b.loginMessage, 500);
    if (b.auditRetentionDays !== undefined) {
      const days = Number(b.auditRetentionDays);
      if (!Number.isInteger(days) || days < 30 || days > 3650) {
        return res.status(400).json({ status: 'error', message: 'Audit log retention must be a whole number of days between 30 and 3650.' });
      }
      s.auditRetentionDays = days;
    }
    if (b.appBaseUrl !== undefined) {
      const u = text(b.appBaseUrl, 255);
      if (u && !/^https?:\/\/[^\s/]+/i.test(u)) return res.status(400).json({ status: 'error', message: 'Application URL must start with http:// or https://' });
      s.appBaseUrl = u ? u.replace(/\/+$/, '') : null;
    }
    await s.save();
    await audit(req, 'platform.settings.update', { organizationId: null });
    res.json({ data: s });
  } catch (err) { sendError(res, err); }
});

for (const kind of ['logo', 'favicon']) {
  const KIND = kind.toUpperCase();
  router.put(`/settings/${kind}`, async (req, res) => {
    try {
      const info = await brand.save(null, KIND, (req.body || {}).dataUrl, req.user.id);
      await audit(req, `platform.${kind}.update`, { organizationId: null, details: info });
      res.json({ data: info });
    } catch (err) { sendError(res, err); }
  });
  router.delete(`/settings/${kind}`, async (req, res) => {
    try {
      await brand.remove(null, KIND);
      await audit(req, `platform.${kind}.remove`, { organizationId: null });
      res.json({ status: 'ok' });
    } catch (err) { sendError(res, err); }
  });
}

router.get('/settings/smtp', async (req, res) => {
  try { res.json({ data: mailer.publicView(await mailer.getConfigRow(null)) }); } catch (err) { sendError(res, err); }
});

router.put('/settings/smtp', async (req, res) => {
  try {
    const row = await mailer.updateConfig(null, req.body);
    await audit(req, 'platform.smtp.update', { organizationId: null, details: { host: row.host, enabled: row.enabled } });
    res.json({ data: mailer.publicView(row) });
  } catch (err) { sendError(res, err); }
});

router.post('/settings/smtp/test', async (req, res) => {
  try {
    const to = String((req.body || {}).to || req.user.email).trim();
    const r = await mailer.testConfig(null, to);
    await audit(req, 'platform.smtp.test', { organizationId: null, details: { to, ok: r.ok } });
    res.status(r.ok ? 200 : 502).json({ status: r.ok ? 'ok' : 'error', message: r.message, data: mailer.publicView(await mailer.getConfigRow(null)) });
  } catch (err) { sendError(res, err); }
});

// ---------------------------------------------------------------- audit

router.get('/audit', async (req, res) => {
  try {
    const where = {};
    if (req.query.organizationId === 'platform') where.organizationId = null;
    else if (req.query.organizationId) where.organizationId = req.query.organizationId;
    if (req.query.action) where.action = { [Op.like]: `${String(req.query.action).replace(/[%_]/g, '')}%` };
    const [result, platformSettings] = await Promise.all([auditPage(where, req.query), getPlatformSettings()]);
    res.json({ ...result, auditRetentionDays: platformSettings.auditRetentionDays });
  } catch (err) { sendError(res, err); }
});

/**
 * How long audit rows are kept, and a way to run the nightly purge on
 * demand (e.g. right after lowering the retention window, or to verify it
 * works, without waiting for the next scheduled run).
 */
router.get('/audit/retention', async (req, res) => {
  try {
    const s = await getPlatformSettings();
    res.json({ data: { auditRetentionDays: s.auditRetentionDays } });
  } catch (err) { sendError(res, err); }
});

router.post('/audit/purge-now', async (req, res) => {
  try {
    const result = await auditRetention.purgeExpiredAuditLogs();
    await audit(req, 'platform.audit.purge', { organizationId: null, details: { deleted: result.deleted, days: result.days } });
    res.json({ data: result });
  } catch (err) { sendError(res, err); }
});

module.exports = router;
