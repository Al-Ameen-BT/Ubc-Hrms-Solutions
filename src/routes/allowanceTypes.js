'use strict';

/**
 * Allowance master — see services/allowances.js.
 *   GET    /allowance-types            list this org's allowance types
 *   GET    /allowance-types/:id        one, with its applicable posts
 *   POST   /allowance-types            create
 *   PUT    /allowance-types/:id        edit
 *   POST   /allowance-types/:id/status ACTIVE <-> INACTIVE
 *   PUT    /allowance-types/:id/posts  replace the set of applicable Post Cadres ({ postCadreIds: [...] }, [] = all posts)
 */

const express = require('express');
const { AllowanceType, AllowanceTypePost } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const allowances = require('../services/allowances');

const router = express.Router();
const VIEWERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'];
const WRITERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN'];

router.use(authenticate, requireRole(...VIEWERS));

function orgIdFor(req) { return req.user.organizationId; }

function sendErr(res, err) { res.status(err.status || 500).json({ status: 'error', message: err.message }); }

async function loadOr404(req, res) {
  const row = await AllowanceType.findByPk(req.params.id, { include: [{ model: AllowanceTypePost }] });
  if (!row || (req.user.role !== 'SUPER_ADMIN' && String(row.organizationId) !== String(orgIdFor(req)))) {
    res.status(404).json({ status: 'error', message: 'Allowance type not found' });
    return null;
  }
  return row;
}

router.get('/', async (req, res) => {
  try {
    const where = { organizationId: orgIdFor(req) };
    if (req.user.role === 'SUPER_ADMIN' && req.query.organizationId) where.organizationId = req.query.organizationId;
    const rows = await AllowanceType.findAll({ where, include: [{ model: AllowanceTypePost }], order: [['name', 'ASC']] });
    res.json({ data: rows });
  } catch (err) { sendErr(res, err); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await loadOr404(req, res); if (!row) return;
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

router.post('/', async (req, res) => {
  if (!WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot create an allowance type.' });
  try {
    const row = await allowances.create(orgIdFor(req), req.body);
    if (Array.isArray(req.body.postCadreIds)) await allowances.setPosts(row, req.body.postCadreIds);
    await audit(req, 'allowance_type.create', { organizationId: row.organizationId, targetType: 'allowance_type', targetId: row.id, details: { name: row.name } });
    res.status(201).json({ data: await loadOr404({ params: { id: row.id }, user: req.user }, res) });
  } catch (err) { sendErr(res, err); }
});

router.put('/:id', async (req, res) => {
  if (!WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot edit this allowance type.' });
  try {
    const row = await loadOr404(req, res); if (!row) return;
    await allowances.update(row, req.body);
    await audit(req, 'allowance_type.update', { organizationId: row.organizationId, targetType: 'allowance_type', targetId: row.id });
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

router.post('/:id/status', async (req, res) => {
  if (!WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot change this.' });
  try {
    const row = await loadOr404(req, res); if (!row) return;
    const status = req.body && req.body.status;
    if (!['ACTIVE', 'INACTIVE'].includes(status)) return res.status(400).json({ status: 'error', message: 'status must be ACTIVE or INACTIVE.' });
    await row.update({ status });
    await audit(req, 'allowance_type.status', { organizationId: row.organizationId, targetType: 'allowance_type', targetId: row.id, details: { status } });
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

router.put('/:id/posts', async (req, res) => {
  if (!WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot change this.' });
  try {
    const row = await loadOr404(req, res); if (!row) return;
    await allowances.setPosts(row, (req.body && req.body.postCadreIds) || []);
    await audit(req, 'allowance_type.posts', { organizationId: row.organizationId, targetType: 'allowance_type', targetId: row.id });
    res.json({ data: await loadOr404(req, res) });
  } catch (err) { sendErr(res, err); }
});

module.exports = router;
