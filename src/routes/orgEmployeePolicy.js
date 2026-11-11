'use strict';
const express = require('express');
const { EmployeePolicy } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const router = express.Router();
router.use(authenticate, requireRole('ORG_ADMIN'));
const current = (organizationId) => EmployeePolicy.findOne({ where: { organizationId }, order: [['version', 'DESC']] });
router.get('/', async (req, res) => {
  try { res.json({ data: await current(req.user.organizationId) }); }
  catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});
router.post('/', async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!title || title.length > 255 || !body || body.length > 50000) return res.status(400).json({ status: 'error', message: 'A title and policy body are required (maximum 255 and 50000 characters).' });
    const latest = await current(req.user.organizationId);
    if (latest?.title === title && latest?.body === body) return res.json({ data: latest });
    const policy = await EmployeePolicy.create({ organizationId: req.user.organizationId, version: (latest?.version || 0) + 1, title, body, publishedBy: req.user.id });
    await audit(req, 'employee_policy.publish', { targetType: 'employee_policy', targetId: policy.id, details: { version: policy.version } });
    res.status(201).json({ data: policy });
  } catch (err) { res.status(err.name === 'SequelizeUniqueConstraintError' ? 409 : 500).json({ status: 'error', message: err.message }); }
});
module.exports = router;
