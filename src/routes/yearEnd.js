'use strict';

/**
 * Year-End Process — see services/yearEnd.js.
 *   GET  /organizations/:orgId/year-end             every year this org has touched (closed or not)
 *   GET  /organizations/:orgId/year-end/:year        one year's summary (creates the OPEN row on first look, if none exists yet)
 *   POST /organizations/:orgId/year-end/:year/close  close the year (APPROVERS only — a governance action)
 *   POST /organizations/:orgId/year-end/:year/reopen SUPER_ADMIN/ORG_ADMIN only
 */

const express = require('express');
const { requireFeaturePermission } = require('../middleware/permissions');

const { authenticate } = require('../middleware/auth');
const { audit } = require('../services/audit');
const yearEnd = require('../services/yearEnd');
const leave = require('../services/leave');

const router = express.Router({ mergeParams: true });

const VIEWERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'];
const APPROVERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'APPROVING_AUTHORITY'];
const REOPENERS = ['SUPER_ADMIN', 'ORG_ADMIN'];

router.use(authenticate);

function orgIdFor(req) {
  return req.user.role === 'SUPER_ADMIN' ? req.params.orgId : req.user.organizationId;
}

function sendErr(res, err) { res.status(err.status || 500).json({ status: 'error', message: err.message }); }

router.get('/', requireFeaturePermission(['yearend.view', 'payroll.view'], VIEWERS), async (req, res) => {
  try { res.json({ data: await yearEnd.listYears(orgIdFor(req)) }); } catch (err) { sendErr(res, err); }
});

// ------------------------------------------------------------------- Leave Rollover (Calendar Year)
router.get('/leave-rollover/preview', requireFeaturePermission(['yearend.view', 'leave.view', 'leave.manage'], VIEWERS), async (req, res) => {
  try {
    const fromYear = Number(req.query.fromYear) || (new Date().getUTCFullYear() - 1);
    const data = await leave.previewLeaveYearEndRollover(orgIdFor(req), fromYear);
    res.json({ data });
  } catch (err) { sendErr(res, err); }
});

router.post('/leave-rollover/execute', requireFeaturePermission(['yearend.close', 'leave.manage'], APPROVERS), async (req, res) => {
  try {
    const { fromYear, remarks } = req.body || {};
    if (!fromYear) return res.status(400).json({ status: 'error', message: 'fromYear is required.' });
    const snapshot = await leave.executeLeaveYearEndRollover(orgIdFor(req), Number(fromYear), req.user.id, remarks);
    await audit(req, 'leave.year_end_rollover.execute', {
      organizationId: orgIdFor(req),
      targetType: 'leave_year_end_snapshot',
      targetId: snapshot.id,
      details: { fromYear: snapshot.fromYear, toYear: snapshot.toYear },
    });
    res.json({ data: snapshot });
  } catch (err) { sendErr(res, err); }
});

router.get('/leave-rollover/history', requireFeaturePermission(['yearend.view', 'leave.view'], VIEWERS), async (req, res) => {
  try {
    const data = await leave.listLeaveYearEndSnapshots(orgIdFor(req));
    res.json({ data });
  } catch (err) { sendErr(res, err); }
});

// ------------------------------------------------------------------- Financial Year (April - March)
router.get('/:year', requireFeaturePermission(['yearend.view', 'payroll.view'], VIEWERS), async (req, res) => {
  try { res.json({ data: await yearEnd.summary(orgIdFor(req), Number(req.params.year)) }); } catch (err) { sendErr(res, err); }
});

router.post('/:year/close', requireFeaturePermission(['yearend.close', 'payroll.approve'], APPROVERS), async (req, res) => {
  try {
    const row = await yearEnd.closeYear(orgIdFor(req), Number(req.params.year), req.user.id, req.body && req.body.remarks);
    await audit(req, 'year_end.close', { organizationId: orgIdFor(req), targetType: 'year_end_closure', targetId: row.id, details: { year: row.year } });
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

router.post('/:year/reopen', requireFeaturePermission(['yearend.close', 'payroll.approve'], REOPENERS), async (req, res) => {
  try {
    const row = await yearEnd.reopenYear(orgIdFor(req), Number(req.params.year));
    await audit(req, 'year_end.reopen', { organizationId: orgIdFor(req), targetType: 'year_end_closure', targetId: row.id, details: { year: row.year } });
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

module.exports = router;

