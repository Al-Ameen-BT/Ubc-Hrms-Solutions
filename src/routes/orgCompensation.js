'use strict';
const express = require('express');
const { requireFeaturePermission, resource } = require('../middleware/permissions');

const { EmployeeCompensationAssignment } = require('../models');
const { authenticate } = require('../middleware/auth');
const { audit } = require('../services/audit');
const assignments = require('../services/compensationAssignments');
const router = express.Router();
router.use(authenticate);
router.get('/', requireFeaturePermission('compensation.view', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY']), async (req, res) => {
  try {
    const where = { organizationId: req.user.organizationId };
    if (req.query.employeeId) where.employeeId = req.query.employeeId;
    res.json({ data: await EmployeeCompensationAssignment.findAll({ where, order: [['effectiveDate', 'DESC'], ['id', 'DESC']] }) });
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});
router.post('/', requireFeaturePermission('compensation.prepare', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'PAYROLL_OFFICER'], resource('Employee', 'employeeId', 'body')), async (req, res) => {
  try {
    const row = await assignments.proposeAssignment({ ...req.body, organizationId: req.user.organizationId, actorId: req.user.id });
    await audit(req, 'employee.salary.propose', { targetType: 'employee_compensation_assignment', targetId: row.id });
    res.status(201).json({ data: row });
  } catch (err) { res.status(err.status || 500).json({ status: 'error', message: err.message }); }
});
router.post('/:id/decide', requireFeaturePermission('compensation.approve', ['APPROVING_AUTHORITY'], resource('EmployeeCompensationAssignment')), async (req, res) => {
  try {
    const row = await assignments.decideAssignment({ organizationId: req.user.organizationId, proposalId: req.params.id, decision: req.body?.decision, actorId: req.user.id, reason: req.body?.reason });
    await audit(req, 'employee.salary.decide', { targetType: 'employee_compensation_assignment', targetId: row.id, details: { decision: row.status } });
    res.json({ data: row });
  } catch (err) { res.status(err.status || 500).json({ status: 'error', message: err.message }); }
});
module.exports = router;
