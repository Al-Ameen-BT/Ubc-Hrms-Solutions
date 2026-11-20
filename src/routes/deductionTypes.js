'use strict';

/**
 * Deduction master — see services/deductions.js.
 *   GET    /deduction-types            list this org's deduction types
 *   GET    /deduction-types/:id        one, with its applicable posts
 *   POST   /deduction-types            create
 *   PUT    /deduction-types/:id        edit
 *   POST   /deduction-types/:id/status ACTIVE <-> INACTIVE
 *   PUT    /deduction-types/:id/posts  replace the set of applicable Post Cadres ({ postCadreIds: [...] }, [] = all posts)
 *   DELETE /deduction-types/:id        delete deduction type (only if not used in frozen payrolls)
 */

const express = require('express');
const { requireFeaturePermission, resource } = require('../middleware/permissions');
const { DeductionType, DeductionTypePost } = require('../models');
const { authenticate } = require('../middleware/auth');
const { audit } = require('../services/audit');
const deductions = require('../services/deductions');

const router = express.Router();
const VIEWERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'];
const WRITERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN'];

router.use(authenticate);

function orgIdFor(req) { return req.user.organizationId; }
function sendErr(res, err) { res.status(err.status || 500).json({ status: 'error', message: err.message }); }

async function loadOr404(req, res) {
  const row = await DeductionType.findByPk(req.params.id, { include: [{ model: DeductionTypePost }] });
  if (!row || (req.user.role !== 'SUPER_ADMIN' && String(row.organizationId) !== String(orgIdFor(req)))) {
    res.status(404).json({ status: 'error', message: 'Deduction type not found' });
    return null;
  }
  return row;
}

router.get('/', requireFeaturePermission('compensation.view', VIEWERS), async (req, res) => {
  try {
    const where = { organizationId: orgIdFor(req) };
    if (req.user.role === 'SUPER_ADMIN' && req.query.organizationId) where.organizationId = req.query.organizationId;
    const rows = await DeductionType.findAll({
      where,
      include: [{ model: DeductionTypePost }],
      order: [['category', 'ASC'], ['name', 'ASC']],
    });
    res.json({ data: rows, categories: deductions.VALID_CATEGORIES });
  } catch (err) { sendErr(res, err); }
});

router.get('/:id', requireFeaturePermission('compensation.view', VIEWERS, resource('DeductionType')), async (req, res) => {
  try {
    const row = await loadOr404(req, res); if (!row) return;
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

router.post('/', requireFeaturePermission('compensation.prepare', WRITERS), async (req, res) => {
  try {
    const row = await deductions.create(orgIdFor(req), req.body);
    if (Array.isArray(req.body.postCadreIds)) await deductions.setPosts(row, req.body.postCadreIds);
    await audit(req, 'deduction_type.create', {
      organizationId: row.organizationId,
      targetType: 'deduction_type',
      targetId: row.id,
      details: { name: row.name, category: row.category, amount: row.amount },
    });
    res.status(201).json({ data: await loadOr404({ params: { id: row.id }, user: req.user }, res) });
  } catch (err) { sendErr(res, err); }
});

router.put('/:id', requireFeaturePermission('compensation.prepare', WRITERS, resource('DeductionType')), async (req, res) => {
  try {
    const row = await loadOr404(req, res); if (!row) return;
    await deductions.update(row, req.body);
    if (Array.isArray(req.body.postCadreIds)) await deductions.setPosts(row, req.body.postCadreIds);
    await audit(req, 'deduction_type.update', {
      organizationId: row.organizationId,
      targetType: 'deduction_type',
      targetId: row.id,
      details: { name: row.name, category: row.category },
    });
    res.json({ data: await loadOr404(req, res) });
  } catch (err) { sendErr(res, err); }
});

router.post('/:id/status', requireFeaturePermission('compensation.prepare', WRITERS, resource('DeductionType')), async (req, res) => {
  try {
    const row = await loadOr404(req, res); if (!row) return;
    const status = req.body && req.body.status;
    if (!['ACTIVE', 'INACTIVE'].includes(status)) return res.status(400).json({ status: 'error', message: 'status must be ACTIVE or INACTIVE.' });
    await row.update({ status });
    await audit(req, 'deduction_type.status', {
      organizationId: row.organizationId,
      targetType: 'deduction_type',
      targetId: row.id,
      details: { status, name: row.name },
    });
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

router.put('/:id/posts', requireFeaturePermission('compensation.prepare', WRITERS, resource('DeductionType')), async (req, res) => {
  try {
    const row = await loadOr404(req, res); if (!row) return;
    await deductions.setPosts(row, (req.body && req.body.postCadreIds) || []);
    await audit(req, 'deduction_type.posts', {
      organizationId: row.organizationId,
      targetType: 'deduction_type',
      targetId: row.id,
    });
    res.json({ data: await loadOr404(req, res) });
  } catch (err) { sendErr(res, err); }
});

router.delete('/:id', requireFeaturePermission('compensation.prepare', WRITERS, resource('DeductionType')), async (req, res) => {
  try {
    const row = await loadOr404(req, res); if (!row) return;
    await DeductionTypePost.destroy({ where: { deductionTypeId: row.id } });
    await row.destroy();
    await audit(req, 'deduction_type.delete', {
      organizationId: row.organizationId,
      targetType: 'deduction_type',
      targetId: row.id,
      details: { name: row.name },
    });
    res.json({ status: 'ok', message: 'Deduction type deleted.' });
  } catch (err) { sendErr(res, err); }
});

module.exports = router;
