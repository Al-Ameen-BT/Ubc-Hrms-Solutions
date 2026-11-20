'use strict';

/**
 * Overdraft Slab Master:
 *   GET    /overdraft-slabs            list slabs for this organisation
 *   GET    /overdraft-slabs/:id        single slab
 *   POST   /overdraft-slabs            create slab
 *   PUT    /overdraft-slabs/:id        update slab
 *   POST   /overdraft-slabs/:id/status toggle status (ACTIVE / INACTIVE)
 *   DELETE /overdraft-slabs/:id        delete slab
 */

const express = require('express');
const { requireFeaturePermission, resource } = require('../middleware/permissions');
const { OverdraftSlab } = require('../models');
const { authenticate } = require('../middleware/auth');
const { audit } = require('../services/audit');

const router = express.Router();
const VIEWERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'];
const WRITERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN'];

router.use(authenticate);

function orgIdFor(req) { return req.user.organizationId; }
function sendErr(res, err) { res.status(err.status || 500).json({ status: 'error', message: err.message }); }

async function loadOr404(req, res) {
  const row = await OverdraftSlab.findByPk(req.params.id);
  if (!row || (req.user.role !== 'SUPER_ADMIN' && String(row.organizationId) !== String(orgIdFor(req)))) {
    res.status(404).json({ status: 'error', message: 'Overdraft slab not found' });
    return null;
  }
  return row;
}

function validateSlabBody(b) {
  if (!b.slabName || !String(b.slabName).trim()) {
    const err = new Error('slabName is required.');
    err.status = 400;
    throw err;
  }
  const fromSalary = Number(b.fromSalary || 0);
  if (fromSalary < 0) {
    const err = new Error('fromSalary must be at least 0.');
    err.status = 400;
    throw err;
  }
  let toSalary = b.toSalary != null && b.toSalary !== '' ? Number(b.toSalary) : null;
  if (toSalary !== null && toSalary <= fromSalary) {
    const err = new Error('toSalary must be greater than fromSalary.');
    err.status = 400;
    throw err;
  }
  const multiplier = Number(b.multiplier);
  if (!(multiplier > 0 && multiplier <= 100)) {
    const err = new Error('multiplier must be a positive number up to 100.');
    err.status = 400;
    throw err;
  }
  const maxLimit = b.maxLimit != null && b.maxLimit !== '' ? Number(b.maxLimit) : null;
  if (maxLimit !== null && maxLimit <= 0) {
    const err = new Error('maxLimit must be positive.');
    err.status = 400;
    throw err;
  }
  const minLimit = b.minLimit != null && b.minLimit !== '' ? Number(b.minLimit) : null;
  if (minLimit !== null && minLimit < 0) {
    const err = new Error('minLimit must be at least 0.');
    err.status = 400;
    throw err;
  }
  const maxTenureMonths = b.maxTenureMonths != null && b.maxTenureMonths !== '' ? Number(b.maxTenureMonths) : 84;
  if (!Number.isInteger(maxTenureMonths) || maxTenureMonths < 1 || maxTenureMonths > 240) {
    const err = new Error('maxTenureMonths must be an integer between 1 and 240.');
    err.status = 400;
    throw err;
  }

  return {
    slabName: String(b.slabName).trim(),
    fromSalary,
    toSalary,
    multiplier,
    maxLimit,
    minLimit,
    maxTenureMonths,
    remarks: b.remarks ? String(b.remarks).slice(0, 500) : null,
  };
}

router.get('/', requireFeaturePermission('compensation.view', VIEWERS), async (req, res) => {
  try {
    const where = { organizationId: orgIdFor(req) };
    if (req.user.role === 'SUPER_ADMIN' && req.query.organizationId) where.organizationId = req.query.organizationId;
    const rows = await OverdraftSlab.findAll({
      where,
      order: [['fromSalary', 'ASC']],
    });
    res.json({ data: rows });
  } catch (err) { sendErr(res, err); }
});

router.get('/:id', requireFeaturePermission('compensation.view', VIEWERS, resource('OverdraftSlab')), async (req, res) => {
  try {
    const row = await loadOr404(req, res); if (!row) return;
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

router.post('/', requireFeaturePermission('compensation.prepare', WRITERS), async (req, res) => {
  try {
    const clean = validateSlabBody(req.body);
    const row = await OverdraftSlab.create({ ...clean, organizationId: orgIdFor(req) });
    await audit(req, 'overdraft_slab.create', {
      organizationId: row.organizationId,
      targetType: 'overdraft_slab',
      targetId: row.id,
      details: { slabName: row.slabName, multiplier: row.multiplier, maxLimit: row.maxLimit },
    });
    res.status(201).json({ data: row });
  } catch (err) { sendErr(res, err); }
});

router.put('/:id', requireFeaturePermission('compensation.prepare', WRITERS, resource('OverdraftSlab')), async (req, res) => {
  try {
    const row = await loadOr404(req, res); if (!row) return;
    const clean = validateSlabBody({ ...row.toJSON(), ...req.body });
    await row.update(clean);
    await audit(req, 'overdraft_slab.update', {
      organizationId: row.organizationId,
      targetType: 'overdraft_slab',
      targetId: row.id,
      details: { slabName: row.slabName },
    });
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

router.post('/:id/status', requireFeaturePermission('compensation.prepare', WRITERS, resource('OverdraftSlab')), async (req, res) => {
  try {
    const row = await loadOr404(req, res); if (!row) return;
    const status = req.body && req.body.status;
    if (!['ACTIVE', 'INACTIVE'].includes(status)) return res.status(400).json({ status: 'error', message: 'status must be ACTIVE or INACTIVE.' });
    await row.update({ status });
    await audit(req, 'overdraft_slab.status', {
      organizationId: row.organizationId,
      targetType: 'overdraft_slab',
      targetId: row.id,
      details: { status, slabName: row.slabName },
    });
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

router.delete('/:id', requireFeaturePermission('compensation.prepare', WRITERS, resource('OverdraftSlab')), async (req, res) => {
  try {
    const row = await loadOr404(req, res); if (!row) return;
    await row.destroy();
    await audit(req, 'overdraft_slab.delete', {
      organizationId: row.organizationId,
      targetType: 'overdraft_slab',
      targetId: row.id,
      details: { slabName: row.slabName },
    });
    res.json({ status: 'ok', message: 'Overdraft slab deleted.' });
  } catch (err) { sendErr(res, err); }
});

module.exports = router;
