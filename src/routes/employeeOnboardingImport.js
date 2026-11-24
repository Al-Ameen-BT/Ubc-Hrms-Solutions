'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireFeaturePermission } = require('../middleware/permissions');
const { parseEmployeeWorkbook } = require('../services/employeeWorkbook');
const { signPreview, verifyPreview } = require('../services/importPreview');
const onboarding = require('../services/employeeOnboardingImport');

const router = express.Router();
router.use(authenticate, requireFeaturePermission('people.create', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER']));
function fail(res, error) { if (!error.status) console.error('[employee-onboarding-import]', error); res.status(error.status || 500).json({ status: 'error', message: error.status ? error.message : 'Could not complete employee onboarding import.' }); }

router.post('/preview', express.raw({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', limit: '2mb' }), async (req, res) => {
  try {
    const rows = await parseEmployeeWorkbook(req.body);
    const source = { filename: req.get('X-Import-Filename') || 'employee-onboarding.xlsx', sha256: crypto.createHash('sha256').update(req.body).digest('hex'), byteLength: req.body.length };
    const preview = await onboarding.validatePreview(rows, { organizationId: req.user.organizationId, source, access: req.access });
    res.json({ data: signPreview('employee-onboarding-import', req.user, preview) });
  } catch (error) { fail(res, error); }
});
router.post('/apply', express.json({ limit: '3mb' }), async (req, res) => {
  try { const preview = verifyPreview('employee-onboarding-import', req.user, req.body?.preview); res.json({ data: await onboarding.applyPreview(preview, req.user, req.access) }); }
  catch (error) { fail(res, error); }
});

module.exports = router;
