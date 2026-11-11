'use strict';
const express = require('express');
const { Op } = require('sequelize');
const { sequelize, EmployeeTimeEntry, Employee, AuditLog } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate, requireRole('ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER'));
router.get('/', async (req, res) => {
  try {
    const year = Number(req.query.year || new Date().getUTCFullYear());
    const month = Number(req.query.month || new Date().getUTCMonth() + 1);
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) return res.status(400).json({ status: 'error', message: 'Invalid year or month.' });
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const rows = await EmployeeTimeEntry.findAll({ where: { organizationId: req.user.organizationId, localDate: { [Op.between]: [start, end] } }, include: [{ model: Employee, attributes: ['id', 'empCode', 'name'] }], order: [['localDate', 'DESC'], ['id', 'DESC']] });
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});
router.put('/:id/correct', async (req, res) => {
  try {
    const row = await EmployeeTimeEntry.findOne({ where: { id: req.params.id, organizationId: req.user.organizationId } });
    if (!row) return res.status(404).json({ status: 'error', message: 'Time entry not found.' });
    const reason = String(req.body?.reason || '').trim();
    if (!reason || reason.length > 500) return res.status(400).json({ status: 'error', message: 'Correction reason is required.' });
    const checkInAt = req.body.checkInAt === undefined ? row.checkInAt : new Date(req.body.checkInAt);
    const checkOutAt = req.body.checkOutAt === undefined ? row.checkOutAt : (req.body.checkOutAt ? new Date(req.body.checkOutAt) : null);
    if (Number.isNaN(checkInAt?.getTime()) || (checkOutAt && (Number.isNaN(checkOutAt.getTime()) || checkOutAt < checkInAt))) return res.status(400).json({ status: 'error', message: 'Invalid check-in/out timestamps.' });
    const previous = { checkInAt: row.checkInAt, checkOutAt: row.checkOutAt };
    const changed = await sequelize.transaction(async transaction => {
      const [count] = await EmployeeTimeEntry.update({ checkInAt, checkOutAt, correctedBy: req.user.id, correctionReason: reason }, {
        where: { id: row.id, organizationId: req.user.organizationId, checkInAt: row.checkInAt, checkOutAt: row.checkOutAt }, transaction,
      });
      if (!count) return false;
      await AuditLog.create({ organizationId: req.user.organizationId, actorUserId: req.user.id, actorEmail: req.user.email,
        action: 'employee_time.correct', targetType: 'employee_time_entry', targetId: String(row.id),
        details: { previous, current: { checkInAt, checkOutAt }, reason }, ip: req.ip }, { transaction });
      return true;
    });
    if (!changed) return res.status(409).json({ status: 'error', message: 'This time entry has already changed. Reload before correcting it.' });
    await row.reload();
    res.json({ data: row });
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});
module.exports = router;
