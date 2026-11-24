'use strict';

const express = require('express');
const { Op } = require('sequelize');
const { authenticate } = require('../middleware/auth');
const { requireFeaturePermission } = require('../middleware/permissions');
const { scopedWhere } = require('../services/accessControl');
const { parseEmployeeFinancialWorkbook } = require('../services/importWorkbooks');
const { signPreview, verifyPreview } = require('../services/importPreview');
const financialImport = require('../services/employeeFinancialImport');

const router = express.Router();
const WRITERS = ['ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER'];
router.use(authenticate, requireFeaturePermission('compensation.prepare', WRITERS));

function fail(res, error) {
  if (!error.status) console.error('[employee-financial-import]', error);
  res.status(error.status || 500).json({ status: 'error', message: error.status ? error.message : 'Could not complete the employee financial import.' });
}

router.post('/preview', express.raw({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', limit: '2mb' }), async (req, res) => {
  try {
    const parsed = await parseEmployeeFinancialWorkbook(req.body, { filename: req.get('X-Import-Filename') });
    const employeeWhere = req.access ? scopedWhere(req.access, req.permissionCode, 'Employee') : { id: { [Op.ne]: null } };
    const checked = await financialImport.validatePreview(parsed, { organizationId: req.user.organizationId, payYear: req.query.payYear, payMonth: req.query.payMonth, employeeWhere });
    res.json({ data: signPreview('employee-financial-import', req.user, checked) });
  } catch (error) { fail(res, error); }
});

router.post('/apply', express.json({ limit: '3mb' }), async (req, res) => {
  try {
    const preview = verifyPreview('employee-financial-import', req.user, req.body?.preview);
    const result = await financialImport.applyPreview(preview, req.user, req.access);
    res.json({ data: result });
  } catch (error) { fail(res, error); }
});

module.exports = router;
