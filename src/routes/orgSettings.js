'use strict';

/**
 * An organisation's own Settings — /api/v1/org/* — for its ORG_ADMIN.
 * Always acts on the caller's own organisation (taken from the token, never
 * from the request). Licence fields are shown read-only here; only a Super
 * Admin can change them (/api/v1/admin/organizations/:id).
 */

const express = require('express');
const { requireFeaturePermission, resource } = require('../middleware/permissions');
const { Op } = require('sequelize');
const { Organization, AuditLog, OrganizationBranch, OrganizationBoardMember } = require('../models');
const { authenticate } = require('../middleware/auth');
const { licenseSummary } = require('../services/orgAccess');
const license = require('../services/license');
const brand = require('../services/brandAssets');
const mailer = require('../services/mailer');
const orgFields = require('../services/orgFields');
const orgDocuments = require('../services/orgDocuments');
const { audit, auditPage } = require('../services/audit');
const { sendError, loginUrlFor } = require('../services/userAdmin');
const payrollSettings = require('../services/payrollSettings');
const { getPlatformSettings } = require('../services/settings');
const orgDomains = require('../services/orgDomains');
const { getDashboardAnalytics } = require('../services/dashboardAnalytics');
const { scopedWhere } = require('../services/accessControl');

const router = express.Router();
router.use(authenticate);

async function ownOrg(req) {
  return Organization.findByPk(req.user.organizationId);
}

router.get('/dashboard-analytics', requireFeaturePermission('hr.view', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER']), async (req, res) => {
  try {
    const filters = {};
    for (const key of ['branchId', 'departmentId']) {
      if (req.query[key] === undefined || req.query[key] === '') continue;
      const value = Number(req.query[key]);
      if (!Number.isInteger(value) || value <= 0) return res.status(400).json({ status: 'error', message: `Invalid ${key === 'branchId' ? 'branch' : 'department'} filter.` });
      filters[key] = value;
    }
    if (req.query.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.date) || Number.isNaN(new Date(`${req.query.date}T00:00:00Z`).getTime())) return res.status(400).json({ status: 'error', message: 'Invalid dashboard date.' });
      filters.date = req.query.date;
    }
    if (req.query.employmentType) {
      if (!['REGULAR', 'PART_TIME_CONTINGENT'].includes(req.query.employmentType)) return res.status(400).json({ status: 'error', message: 'Invalid employment type filter.' });
      filters.employmentType = req.query.employmentType;
    }
    if (req.query.search) {
      const search = String(req.query.search).trim();
      if (search.length > 80) return res.status(400).json({ status: 'error', message: 'Employee search is too long.' });
      filters.search = search;
    }
    const analytics = await getDashboardAnalytics(req.user.organizationId, filters, req.access);
    res.json({ data: analytics });
  } catch (err) { sendError(res, err); }
});

router.get('/dashboard-analytics/branches/:branchId', requireFeaturePermission('hr.view', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER']), async (req, res) => {
  try {
    if (!/^[1-9]\d*$/.test(req.params.branchId)) return res.status(404).json({ status: 'error', message: 'Branch not found' });
    const branchId = Number(req.params.branchId);
    const branch = await OrganizationBranch.findOne({
      where: {
        [Op.and]: [
          { id: branchId, organizationId: req.user.organizationId, status: 'ACTIVE' },
          scopedWhere(req.access, 'hr.view', 'OrganizationBranch'),
        ],
      },
      attributes: ['id', 'code', 'name', 'unitType', 'isHeadOffice'],
    });
    if (!branch) return res.status(404).json({ status: 'error', message: 'Branch not found' });

    const filters = { branchId };
    for (const key of ['departmentId']) {
      if (req.query[key] === undefined || req.query[key] === '') continue;
      const value = Number(req.query[key]);
      if (!Number.isInteger(value) || value <= 0) return res.status(400).json({ status: 'error', message: 'Invalid department filter.' });
      filters[key] = value;
    }
    if (req.query.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.date) || Number.isNaN(new Date(`${req.query.date}T00:00:00Z`).getTime())) return res.status(400).json({ status: 'error', message: 'Invalid dashboard date.' });
      filters.date = req.query.date;
    }
    if (req.query.employmentType) {
      if (!['REGULAR', 'PART_TIME_CONTINGENT'].includes(req.query.employmentType)) return res.status(400).json({ status: 'error', message: 'Invalid employment type filter.' });
      filters.employmentType = req.query.employmentType;
    }

    const analytics = await getDashboardAnalytics(req.user.organizationId, filters, req.access);
    const centre = analytics.commandCentre;
    const health = centre.branchHealth.find((row) => Number(row.branchId) === branchId);
    const byCategory = (category) => centre.actions.filter((row) => row.category === category);
    res.json({ data: {
      schemaVersion: centre.schemaVersion,
      branch: { id: branch.id, code: branch.code, name: branch.name, unitType: branch.unitType, isHeadOffice: Boolean(branch.isHeadOffice), manager: health?.manager || { assigned: false, employeeId: null, name: null }, health: health?.health || null },
      overview: centre.overview,
      departmentDistribution: centre.distribution.department,
      attendanceTrend: centre.attendance.trend,
      upcomingLeave: analytics.leaves.activeLeavesList,
      vacancies: { count: centre.overview.openPositions.value, available: true },
      onboardingIssues: byCategory('ONBOARDING'),
      payrollBlockers: byCategory('PAYROLL'),
      complianceIssues: byCategory('COMPLIANCE'),
      employeeIssues: centre.actions,
      asOf: centre.asOf,
    } });
  } catch (err) { sendError(res, err); }
});

router.get('/settings', requireFeaturePermission('settings.view', ['ORG_ADMIN']), async (req, res) => {
  try {
    const org = await ownOrg(req);
    const [usage, logo, favicon, smtpRow, platformSmtp] = await Promise.all([
      license.usage(org.id), brand.info(org.id, 'LOGO'), brand.info(org.id, 'FAVICON'), mailer.getConfigRow(org.id), mailer.getConfigRow(null),
    ]);
    res.json({
      data: {
        organization: {
          id: org.id, code: org.code, name: org.name, shortName: org.shortName, regulator: org.regulator,
          address: org.address, contactEmail: org.contactEmail, contactPhone: org.contactPhone, website: org.website,
        },
        loginUrl: await loginUrlFor(req, org.id),
        customDomain: org.customDomain || null,
        customDomainVerifiedAt: org.customDomainVerifiedAt || null,
        cnameTarget: await orgDomains.cnameTargetFor(req),
        license: licenseSummary(org),
        usage,
        logo,
        favicon,
        logoLimitBytes: brand.LIMITS.LOGO,
        faviconLimitBytes: brand.LIMITS.FAVICON,
        smtp: mailer.publicView(smtpRow),
        platformSmtpAvailable: !!(platformSmtp && platformSmtp.enabled && platformSmtp.host && platformSmtp.fromEmail),
      },
    });
  } catch (err) { sendError(res, err); }
});

router.put('/settings', requireFeaturePermission('settings.configure', ['ORG_ADMIN']), async (req, res) => {
  try {
    const org = await ownOrg(req);
    Object.assign(org, orgFields.orgAdminFields(req.body));
    await org.save();
    await audit(req, 'org.profile.update', { targetType: 'organization', targetId: org.id });
    res.json({ status: 'ok' });
  } catch (err) { sendError(res, err); }
});

for (const kind of ['logo', 'favicon']) {
  const assetKind = kind.toUpperCase();
  router.put(`/settings/${kind}`, requireFeaturePermission('settings.configure', ['ORG_ADMIN']), async (req, res) => {
    try {
      const info = await brand.save(req.user.organizationId, assetKind, (req.body || {}).dataUrl, req.user.id);
      await audit(req, `org.${kind}.update`, { targetType: 'organization', targetId: req.user.organizationId, details: info });
      res.json({ data: info });
    } catch (err) { sendError(res, err); }
  });
  router.delete(`/settings/${kind}`, requireFeaturePermission('settings.configure', ['ORG_ADMIN']), async (req, res) => {
    try {
      await brand.remove(req.user.organizationId, assetKind);
      await audit(req, `org.${kind}.remove`, { targetType: 'organization', targetId: req.user.organizationId });
      res.json({ status: 'ok' });
    } catch (err) { sendError(res, err); }
  });
}

router.get('/settings/smtp', requireFeaturePermission('settings.view', ['ORG_ADMIN']), async (req, res) => {
  try { res.json({ data: mailer.publicView(await mailer.getConfigRow(req.user.organizationId)) }); } catch (err) { sendError(res, err); }
});

router.put('/settings/smtp', requireFeaturePermission('settings.configure', ['ORG_ADMIN']), async (req, res) => {
  try {
    const row = await mailer.updateConfig(req.user.organizationId, req.body);
    await audit(req, 'org.smtp.update', { details: { host: row.host, enabled: row.enabled } });
    res.json({ data: mailer.publicView(row) });
  } catch (err) { sendError(res, err); }
});

router.post('/settings/smtp/test', requireFeaturePermission('settings.configure', ['ORG_ADMIN']), async (req, res) => {
  try {
    const to = String((req.body || {}).to || req.user.email).trim();
    const r = await mailer.testConfig(req.user.organizationId, to);
    await audit(req, 'org.smtp.test', { details: { to, ok: r.ok } });
    res.status(r.ok ? 200 : 502).json({
      status: r.ok ? 'ok' : 'error', message: r.message,
      data: mailer.publicView(await mailer.getConfigRow(req.user.organizationId)),
    });
  } catch (err) { sendError(res, err); }
});

// Payroll settings — organisation-wide rates used by services/payslip.js
// (DA/HRA %, PF %, GSLI default/cutoff, Professional Tax schedule, Overdraft
// limits, Festival Advance repayment window, stagnation-increment policy).
// Lazily created with defaults on first read.
router.get('/settings/payroll', requireFeaturePermission(['compensation.view', 'settings.view'], ['ORG_ADMIN']), async (req, res) => {
  try { res.json({ data: await require('../services/financialChanges').settingsForDate(req.user.organizationId, new Date().toISOString().slice(0, 10)) }); } catch (err) { sendError(res, err); }
});

router.put('/settings/payroll', requireFeaturePermission(['compensation.prepare', 'settings.configure'], ['ORG_ADMIN']), async (req, res) => {
  try {
    if (req.user.accessControlMode === 'PERMISSIONS' || await require('../models').OrganizationCatalogueAdoption.count({ where: { organizationId: req.user.organizationId, status: 'APPROVED' } })) {
      return res.status(409).json({ status: 'error', message: 'Direct modification of statutory payroll settings is disabled in permission mode. Submit a financial change proposal for maker-checker approval.' });
    }
    const row = await payrollSettings.updateSettings(req.user.organizationId, req.body);
    await audit(req, 'org.payroll_settings.update', { targetType: 'organization', targetId: req.user.organizationId });
    res.json({ data: row });
  } catch (err) { sendError(res, err); }
});

// Per-organisation mandatory Employee fields (task 73). Every field defaults
// to mandatory; an Org Admin may switch individual ones off for their own
// bank only — see services/orgFields.js MANDATORY_FIELD_DEFS.
router.get('/mandatory-fields', requireFeaturePermission('settings.view', ['ORG_ADMIN']), async (req, res) => {
  try {
    const org = await ownOrg(req);
    res.json({ data: { fields: orgFields.MANDATORY_FIELD_DEFS, config: orgFields.mandatoryConfigFor(org) } });
  } catch (err) { sendError(res, err); }
});

router.put('/mandatory-fields', requireFeaturePermission('settings.configure', ['ORG_ADMIN']), async (req, res) => {
  try {
    const org = await ownOrg(req);
    const config = orgFields.normaliseMandatoryConfig(req.body && req.body.config);
    org.mandatoryEmployeeFields = Object.assign(orgFields.mandatoryConfigFor(org), config);
    await org.save();
    await audit(req, 'org.mandatory_fields.update', { targetType: 'organization', targetId: org.id, details: org.mandatoryEmployeeFields });
    res.json({ data: { fields: orgFields.MANDATORY_FIELD_DEFS, config: org.mandatoryEmployeeFields } });
  } catch (err) { sendError(res, err); }
});

// Organisation Profile (task 75) — bank identity shown on the Org Admin's
// "Organisation Profile" page and used for document headers/footers (task
// 76, services/documentHeader.js). Address is directly editable here too
// (task 79), reusing the existing `address` field rather than duplicating
// it — same column Settings → Organisation and the document footer use.
router.get('/profile', requireFeaturePermission('settings.view', ['ORG_ADMIN']), async (req, res) => {
  try {
    const org = await ownOrg(req);
    const [logo, branches, board, documents] = await Promise.all([
      brand.info(org.id, 'LOGO'),
      OrganizationBranch.findAll({ where: { organizationId: org.id }, order: [['isHeadOffice', 'DESC'], ['name', 'ASC']] }),
      OrganizationBoardMember.findAll({
        where: { organizationId: org.id },
        attributes: { exclude: ['photoData'] },
        order: [['displayOrder', 'ASC'], ['id', 'ASC']],
      }),
      orgDocuments.list(org.id),
    ]);
    res.json({
      data: {
        organization: {
          id: org.id, code: org.code, name: org.name, shortName: org.shortName, address: org.address,
          establishedYear: org.establishedYear, registrationNumber: org.registrationNumber,
          rbiLicenseNumber: org.rbiLicenseNumber, rbiLicenseDate: org.rbiLicenseDate,
          gstn: org.gstn, panNumber: org.panNumber,
        },
        logo,
        branches,
        board: board.map((m) => ({ ...m.toJSON(), hasPhoto: !!m.photoMimeType })),
        documentTypes: orgFields.ORG_DOC_TYPES,
        documents,
      },
    });
  } catch (err) { sendError(res, err); }
});

router.put('/profile', requireFeaturePermission('settings.configure', ['ORG_ADMIN']), async (req, res) => {
  try {
    const org = await ownOrg(req);
    Object.assign(org, orgFields.orgProfileFields(req.body));
    await org.save();
    await audit(req, 'org.profile_details.update', { targetType: 'organization', targetId: org.id });
    res.json({ status: 'ok' });
  } catch (err) { sendError(res, err); }
});

// Branch CRUD is mounted from orgStructure.legacy and uses the authoritative structure service.

// ---- Board / management members (Chairman, Vice Chairman, MD, GM, AGM,
// other board members), with an optional photo ----
router.get('/profile/board', requireFeaturePermission('settings.view', ['ORG_ADMIN']), async (req, res) => {
  try {
    const rows = await OrganizationBoardMember.findAll({
      where: { organizationId: req.user.organizationId },
      attributes: { exclude: ['photoData'] },
      order: [['displayOrder', 'ASC'], ['id', 'ASC']],
    });
    res.json({ data: rows.map((m) => ({ ...m.toJSON(), hasPhoto: !!m.photoMimeType })) });
  } catch (err) { sendError(res, err); }
});

router.post('/profile/board', requireFeaturePermission('settings.configure', ['ORG_ADMIN']), async (req, res) => {
  try {
    const fields = orgFields.boardMemberFields(req.body);
    if (!fields.name || !fields.role) throw new orgFields.OrgFieldError('Name and role are required');
    orgFields.assertBoardRoleOther(fields);
    const photo = (req.body || {}).photoDataUrl ? brand.decodeUpload(req.body.photoDataUrl, 'BOARD_PHOTO') : null;
    const row = await OrganizationBoardMember.create({
      organizationId: req.user.organizationId, ...fields,
      ...(photo ? { photoData: photo.buf, photoMimeType: photo.mimeType, photoSizeBytes: photo.buf.length } : {}),
    });
    await audit(req, 'org.board_member.create', { targetType: 'organization_board_member', targetId: row.id });
    const { photoData, ...safe } = row.toJSON();
    res.status(201).json({ data: { ...safe, hasPhoto: !!row.photoMimeType } });
  } catch (err) { sendError(res, err); }
});

router.put('/profile/board/:id', requireFeaturePermission('settings.configure', ['ORG_ADMIN'], resource('OrganizationBoardMember')), async (req, res) => {
  try {
    const row = await OrganizationBoardMember.findOne({ where: { id: req.params.id, organizationId: req.user.organizationId } });
    if (!row) return res.status(404).json({ status: 'error', message: 'Board member not found' });
    const fields = orgFields.boardMemberFields(req.body);
    orgFields.assertBoardRoleOther({
      role: fields.role !== undefined ? fields.role : row.role,
      roleOther: fields.roleOther !== undefined ? fields.roleOther : row.roleOther,
    });
    if (req.body && req.body.photoDataUrl) {
      const photo = brand.decodeUpload(req.body.photoDataUrl, 'BOARD_PHOTO');
      Object.assign(fields, { photoData: photo.buf, photoMimeType: photo.mimeType, photoSizeBytes: photo.buf.length });
    } else if (req.body && req.body.removePhoto) {
      Object.assign(fields, { photoData: null, photoMimeType: null, photoSizeBytes: null });
    }
    await row.update(fields);
    await audit(req, 'org.board_member.update', { targetType: 'organization_board_member', targetId: row.id });
    const { photoData, ...safe } = row.toJSON();
    res.json({ data: { ...safe, hasPhoto: !!row.photoMimeType } });
  } catch (err) { sendError(res, err); }
});

router.delete('/profile/board/:id', requireFeaturePermission('settings.configure', ['ORG_ADMIN'], resource('OrganizationBoardMember')), async (req, res) => {
  try {
    const row = await OrganizationBoardMember.findOne({ where: { id: req.params.id, organizationId: req.user.organizationId } });
    if (!row) return res.status(404).json({ status: 'error', message: 'Board member not found' });
    await row.destroy();
    await audit(req, 'org.board_member.delete', { targetType: 'organization_board_member', targetId: req.params.id });
    res.json({ status: 'ok' });
  } catch (err) { sendError(res, err); }
});

// Photo bytes — public within the authenticated app (same auth as the rest
// of this router); no sha256 on this model, so served inline rather than via
// brand.send(), which expects a BrandAsset-shaped row.
router.get('/profile/board/:id/photo', requireFeaturePermission('chart.view', ['ORG_ADMIN']), require('../services/organizationChart').photoHandler('board'));

// ---- Statutory document uploads (task 79): RBI licence, incorporation /
// registration certificate, PAN, GSTN, TAN, or OTHER with a free-text
// label. Several rows may share a docType (e.g. a renewed licence uploaded
// without deleting the old one first) — list returns all of them. ----
router.get('/profile/documents', requireFeaturePermission('settings.view', ['ORG_ADMIN']), async (req, res) => {
  try { res.json({ data: await orgDocuments.list(req.user.organizationId) }); } catch (err) { sendError(res, err); }
});

router.post('/profile/documents', requireFeaturePermission('settings.configure', ['ORG_ADMIN']), async (req, res) => {
  try {
    const row = await orgDocuments.create(req.user.organizationId, req.body, req.user.id);
    await audit(req, 'org.document.upload', { targetType: 'organization_document', targetId: row.id, details: { docType: row.docType } });
    res.status(201).json({ data: row });
  } catch (err) { sendError(res, err); }
});

router.delete('/profile/documents/:id', requireFeaturePermission('settings.configure', ['ORG_ADMIN'], resource('OrganizationDocument')), async (req, res) => {
  try {
    const row = await orgDocuments.remove(req.user.organizationId, req.params.id);
    if (!row) return res.status(404).json({ status: 'error', message: 'Document not found' });
    await audit(req, 'org.document.delete', { targetType: 'organization_document', targetId: req.params.id, details: { docType: row.docType } });
    res.json({ status: 'ok' });
  } catch (err) { sendError(res, err); }
});

// File bytes — downloads with the original filename where one was given.
router.get('/profile/documents/:id/file', requireFeaturePermission('settings.view', ['ORG_ADMIN'], resource('OrganizationDocument')), async (req, res) => {
  try {
    const row = await orgDocuments.find(req.user.organizationId, req.params.id);
    if (!row) return res.status(404).end();
    const name = (row.fileName || (row.docType + (row.mimeType === 'application/pdf' ? '.pdf' : ''))).replace(/[^A-Za-z0-9 ._-]/g, '_');
    res.set({
      'Content-Type': row.mimeType,
      'Content-Length': String(row.sizeBytes || row.data.length),
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    });
    res.end(Buffer.from(row.data));
  } catch (err) { sendError(res, err); }
});

// Audit trail for this organisation only. Retention (how far back it goes
// before the nightly purge removes rows) is a platform-wide setting — see
// GET /admin/audit/retention — shown here read-only for context.
router.get('/audit', requireFeaturePermission('audit.view', ['ORG_ADMIN']), async (req, res) => {
  try {
    const where = {
      organizationId: req.user.organizationId,
      actorEmail: { [Op.notLike]: '%@banihal.in' },
    };
    if (req.query.action) where.action = { [Op.like]: `${String(req.query.action).replace(/[%_]/g, '')}%` };
    const [result, platformSettings] = await Promise.all([auditPage(where, req.query), getPlatformSettings()]);
    res.json({ ...result, auditRetentionDays: platformSettings.auditRetentionDays });
  } catch (err) { sendError(res, err); }
});

module.exports = router;
