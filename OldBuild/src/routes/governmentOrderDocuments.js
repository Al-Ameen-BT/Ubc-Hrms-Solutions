'use strict';

/**
 * The scanned copy attached to a Government Order — at most one per GO
 * (uploading again replaces it). Mounted at /government-orders in
 * routes/index.js, BEFORE the generic crudRouter mount for the same path so
 * these fixed sub-paths aren't swallowed by its GET/PUT/DELETE /:id routes.
 * Same tenant-scoping and role split as the loan-style document routes in
 * serviceBook.js — see services/attachments.js for the storage itself.
 */
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { GovernmentOrder, GovernmentOrderDocument } = require('../models');
const attachments = require('../services/attachments');

const router = express.Router();

const READERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'DEPARTMENT_HEAD'];
const WRITERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN'];

async function loadOwnGO(req, res) {
  const go = await GovernmentOrder.findByPk(req.params.id);
  if (!go || (req.user.role !== 'SUPER_ADMIN' && String(go.organizationId) !== String(req.user.organizationId))) {
    res.status(404).json({ status: 'error', message: 'Government Order not found' });
    return null;
  }
  return go;
}

router.get('/:id/document', authenticate, async (req, res) => {
  if (!READERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot view this.' });
  try {
    const go = await loadOwnGO(req, res); if (!go) return;
    const meta = await attachments.info(GovernmentOrderDocument, 'governmentOrderId', go.id);
    res.json({ data: meta });
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

router.get('/:id/document/file', authenticate, async (req, res) => {
  if (!READERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot view this.' });
  try {
    const go = await loadOwnGO(req, res); if (!go) return;
    const row = await attachments.get(GovernmentOrderDocument, 'governmentOrderId', go.id);
    if (!row) return res.status(404).json({ status: 'error', message: 'No document uploaded for this Government Order' });
    attachments.send(res, row);
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

router.post('/:id/document', authenticate, async (req, res) => {
  if (!WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot upload a document.' });
  try {
    const go = await loadOwnGO(req, res); if (!go) return;
    const b = req.body || {};
    const meta = await attachments.save(GovernmentOrderDocument, 'governmentOrderId', go.id, { label: b.label, dataUrl: b.dataUrl }, req.user.id);
    await require('../services/audit').audit(req, 'go.document.upload', { organizationId: go.organizationId, targetType: 'government_order', targetId: go.id, details: { sizeBytes: meta.sizeBytes } });
    res.status(201).json({ data: meta });
  } catch (err) { res.status(err.status || 400).json({ status: 'error', message: err.message }); }
});

router.delete('/:id/document', authenticate, async (req, res) => {
  if (!WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot delete this document.' });
  try {
    const go = await loadOwnGO(req, res); if (!go) return;
    await attachments.remove(GovernmentOrderDocument, 'governmentOrderId', go.id);
    await require('../services/audit').audit(req, 'go.document.delete', { organizationId: go.organizationId, targetType: 'government_order', targetId: go.id, details: {} });
    res.json({ status: 'ok', deleted: true });
  } catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

module.exports = router;
