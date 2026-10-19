'use strict';

/**
 * Year-End Process — see services/yearEnd.js.
 *   GET  /organizations/:orgId/year-end             every year this org has touched (closed or not)
 *   GET  /organizations/:orgId/year-end/:year        one year's summary (creates the OPEN row on first look, if none exists yet)
 *   POST /organizations/:orgId/year-end/:year/close  close the year (APPROVERS only — a governance action)
 *   POST /organizations/:orgId/year-end/:year/reopen SUPER_ADMIN/ORG_ADMIN only
 */

const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const yearEnd = require('../services/yearEnd');

const router = express.Router({ mergeParams: true });

const VIEWERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'];
const APPROVERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'APPROVING_AUTHORITY'];
const REOPENERS = ['SUPER_ADMIN', 'ORG_ADMIN'];

router.use(authenticate, requireRole(...VIEWERS));

function orgIdFor(req) {
  return req.user.role === 'SUPER_ADMIN' ? req.params.orgId : req.user.organizationId;
}

function sendErr(res, err) { res.status(err.status || 500).json({ status: 'error', message: err.message }); }

router.get('/', async (req, res) => {
  try { res.json({ data: await yearEnd.listYears(orgIdFor(req)) }); } catch (err) { sendErr(res, err); }
});

router.get('/:year', async (req, res) => {
  try { res.json({ data: await yearEnd.summary(orgIdFor(req), Number(req.params.year)) }); } catch (err) { sendErr(res, err); }
});

router.post('/:year/close', async (req, res) => {
  if (!APPROVERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot close a year.' });
  try {
    const row = await yearEnd.closeYear(orgIdFor(req), Number(req.params.year), req.user.id, req.body && req.body.remarks);
    await audit(req, 'year_end.close', { organizationId: orgIdFor(req), targetType: 'year_end_closure', targetId: row.id, details: { year: row.year } });
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

router.post('/:year/reopen', async (req, res) => {
  if (!REOPENERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot reopen a closed year.' });
  try {
    const row = await yearEnd.reopenYear(orgIdFor(req), Number(req.params.year));
    await audit(req, 'year_end.reopen', { organizationId: orgIdFor(req), targetType: 'year_end_closure', targetId: row.id, details: { year: row.year } });
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

module.exports = router;
