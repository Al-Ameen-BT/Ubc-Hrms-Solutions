'use strict';
const express = require('express');
const { OrganizationHoliday } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { isDateOnly } = require('../services/dateUtils');
const router = express.Router();
router.use(authenticate, requireRole('ORG_ADMIN', 'HR_ADMIN'));
router.get('/', async (req, res) => {
  try { res.json({ data: await OrganizationHoliday.findAll({ where: { organizationId: req.user.organizationId }, order: [['date', 'ASC']] }) }); }
  catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});
router.post('/', async (req, res) => {
  try {
    const { date, name, remarks } = req.body || {};
    if (!isDateOnly(date) || !String(name || '').trim()) return res.status(400).json({ status: 'error', message: 'Valid date and name are required.' });
    if (await OrganizationHoliday.findOne({ where: { organizationId: req.user.organizationId, date } })) return res.status(409).json({ status: 'error', message: 'A holiday is already recorded for this date.' });
    const row = await OrganizationHoliday.create({ organizationId: req.user.organizationId, date, name: String(name).trim().slice(0, 255), remarks: remarks ? String(remarks).slice(0, 500) : null });
    await audit(req, 'holiday.create', { targetType: 'organization_holiday', targetId: row.id });
    res.status(201).json({ data: row });
  } catch (err) { res.status(err.name === 'SequelizeUniqueConstraintError' ? 409 : 500).json({ status: 'error', message: err.message }); }
});
router.put('/:id', async (req, res) => {
  try {
    const row = await OrganizationHoliday.findOne({ where: { id: req.params.id, organizationId: req.user.organizationId } });
    if (!row) return res.status(404).json({ status: 'error', message: 'Holiday not found.' });
    const { date, name, remarks, status } = req.body || {};
    if (date !== undefined && !isDateOnly(date)) return res.status(400).json({ status: 'error', message: 'Invalid date.' });
    if (name !== undefined && !String(name).trim()) return res.status(400).json({ status: 'error', message: 'Name is required.' });
    if (status !== undefined && !['ACTIVE', 'INACTIVE'].includes(status)) return res.status(400).json({ status: 'error', message: 'Invalid status.' });
    if (date && date !== row.date && await OrganizationHoliday.findOne({ where: { organizationId: req.user.organizationId, date } })) return res.status(409).json({ status: 'error', message: 'A holiday is already recorded for this date.' });
    await row.update({ date: date ?? row.date, name: name === undefined ? row.name : String(name).trim().slice(0, 255), remarks: remarks === undefined ? row.remarks : (remarks ? String(remarks).slice(0, 500) : null), status: status ?? row.status });
    await audit(req, 'holiday.update', { targetType: 'organization_holiday', targetId: row.id });
    res.json({ data: row });
  } catch (err) { res.status(err.name === 'SequelizeUniqueConstraintError' ? 409 : 500).json({ status: 'error', message: err.message }); }
});
module.exports = router;
