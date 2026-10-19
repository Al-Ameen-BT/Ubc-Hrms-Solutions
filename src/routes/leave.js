'use strict';

/**
 * Leave Policy + Leave Management — see services/leave.js.
 *   GET    /leave-types                       list this org's leave types
 *   POST   /leave-types                       create
 *   PUT    /leave-types/:id                   edit
 *   POST   /leave-types/:id/status            ACTIVE <-> INACTIVE
 *   POST   /leave-types/seed-defaults          create the KSR-style starting set (skips any code already present)
 *   POST   /leave-types/:id/accrue             { year, month } — credit one month/year's accrual org-wide for this type
 *
 *   GET    /employees/:id/leave-balances       ?year= (defaults to the org's current year)
 *   GET    /employees/:id/leave-applications   this employee's applications
 *   POST   /employees/:id/leave-applications   file one (HR files on the employee's behalf — no employee self-service login in this product)
 *   POST   /leave-applications/:id/decide      { decision: APPROVED|REJECTED, reason? }
 *   POST   /leave-applications/:id/cancel
 */

const express = require('express');
const { LeaveType, LeaveApplication, Employee } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const leave = require('../services/leave');

const VIEWERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'];
const WRITERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER'];
const APPROVERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'APPROVING_AUTHORITY'];

function sendErr(res, err) { res.status(err.status || 500).json({ status: 'error', message: err.message }); }
function orgIdFor(req) { return req.user.organizationId; }

// ------------------------------------------------------------- Leave types

const types = express.Router();
types.use(authenticate, requireRole(...VIEWERS));

async function loadTypeOr404(req, res) {
  const row = await LeaveType.findByPk(req.params.id);
  if (!row || (req.user.role !== 'SUPER_ADMIN' && String(row.organizationId) !== String(orgIdFor(req)))) {
    res.status(404).json({ status: 'error', message: 'Leave type not found' });
    return null;
  }
  return row;
}

types.get('/', async (req, res) => {
  try {
    const where = { organizationId: orgIdFor(req) };
    if (req.user.role === 'SUPER_ADMIN' && req.query.organizationId) where.organizationId = req.query.organizationId;
    res.json({ data: await LeaveType.findAll({ where, order: [['code', 'ASC']] }) });
  } catch (err) { sendErr(res, err); }
});

types.post('/', async (req, res) => {
  if (!WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot create a leave type.' });
  try {
    const row = await leave.createType(orgIdFor(req), req.body);
    await audit(req, 'leave_type.create', { organizationId: row.organizationId, targetType: 'leave_type', targetId: row.id, details: { code: row.code } });
    res.status(201).json({ data: row });
  } catch (err) { sendErr(res, err); }
});

types.post('/seed-defaults', async (req, res) => {
  if (!WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot do this.' });
  try {
    const rows = await leave.seedDefaultLeaveTypes(orgIdFor(req));
    await audit(req, 'leave_type.seed_defaults', { organizationId: orgIdFor(req) });
    res.json({ data: rows });
  } catch (err) { sendErr(res, err); }
});

types.put('/:id', async (req, res) => {
  if (!WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot edit this leave type.' });
  try {
    const row = await loadTypeOr404(req, res); if (!row) return;
    await leave.updateType(row, req.body);
    await audit(req, 'leave_type.update', { organizationId: row.organizationId, targetType: 'leave_type', targetId: row.id });
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

types.post('/:id/status', async (req, res) => {
  if (!WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot change this.' });
  try {
    const row = await loadTypeOr404(req, res); if (!row) return;
    const status = req.body && req.body.status;
    if (!['ACTIVE', 'INACTIVE'].includes(status)) return res.status(400).json({ status: 'error', message: 'status must be ACTIVE or INACTIVE.' });
    await row.update({ status });
    await audit(req, 'leave_type.status', { organizationId: row.organizationId, targetType: 'leave_type', targetId: row.id, details: { status } });
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

types.post('/:id/accrue', async (req, res) => {
  if (!WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot run accrual.' });
  try {
    const row = await loadTypeOr404(req, res); if (!row) return;
    const { year, month } = req.body || {};
    if (!(year >= 2000 && year <= 2100)) return res.status(400).json({ status: 'error', message: 'year is required.' });
    if (!(month >= 1 && month <= 12)) return res.status(400).json({ status: 'error', message: 'month (1-12) is required.' });
    const result = await leave.accrueForMonth(row.organizationId, row.id, Number(year), Number(month));
    await audit(req, 'leave_type.accrue', { organizationId: row.organizationId, targetType: 'leave_type', targetId: row.id, details: result });
    res.json({ data: result });
  } catch (err) { sendErr(res, err); }
});

// -------------------------------------------------------- Leave applications

const applications = express.Router();
applications.use(authenticate, requireRole(...VIEWERS));

async function loadAppOr404(req, res) {
  const row = await LeaveApplication.findByPk(req.params.id, { include: [{ model: Employee }, { model: LeaveType }] });
  if (!row) { res.status(404).json({ status: 'error', message: 'Leave application not found' }); return null; }
  if (req.user.role !== 'SUPER_ADMIN' && String(row.Employee.organizationId) !== String(orgIdFor(req))) {
    res.status(404).json({ status: 'error', message: 'Leave application not found' });
    return null;
  }
  return row;
}

applications.post('/:id/decide', async (req, res) => {
  if (!APPROVERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot decide a leave application.' });
  try {
    const row = await loadAppOr404(req, res); if (!row) return;
    const { decision, reason } = req.body || {};
    const updated = await leave.decideLeave(row, decision, req.user.id, reason);
    await audit(req, 'leave_application.decide', { organizationId: row.Employee.organizationId, targetType: 'leave_application', targetId: row.id, details: { decision } });
    res.json({ data: updated });
  } catch (err) { sendErr(res, err); }
});

applications.post('/:id/cancel', async (req, res) => {
  if (!WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot cancel this.' });
  try {
    const row = await loadAppOr404(req, res); if (!row) return;
    const updated = await leave.cancelLeave(row, req.user.id);
    await audit(req, 'leave_application.cancel', { organizationId: row.Employee.organizationId, targetType: 'leave_application', targetId: row.id });
    res.json({ data: updated });
  } catch (err) { sendErr(res, err); }
});

// --------------------------------------------- Per-employee balances/applications

const employeeLeave = express.Router();
employeeLeave.use(authenticate, requireRole(...VIEWERS));

async function loadEmployeeOr404(req, res) {
  const row = await Employee.findByPk(req.params.id);
  if (!row || (req.user.role !== 'SUPER_ADMIN' && String(row.organizationId) !== String(orgIdFor(req)))) {
    res.status(404).json({ status: 'error', message: 'Employee not found' });
    return null;
  }
  return row;
}

employeeLeave.get('/:id/leave-balances', async (req, res) => {
  try {
    const employee = await loadEmployeeOr404(req, res); if (!employee) return;
    const year = req.query.year ? Number(req.query.year) : await leave.currentYearLabel(employee.organizationId);
    res.json({ data: await leave.balancesFor(employee.id, year), year });
  } catch (err) { sendErr(res, err); }
});

employeeLeave.get('/:id/leave-applications', async (req, res) => {
  try {
    const employee = await loadEmployeeOr404(req, res); if (!employee) return;
    const rows = await LeaveApplication.findAll({
      where: { employeeId: employee.id }, include: [{ model: LeaveType }], order: [['fromDate', 'DESC'], ['id', 'DESC']],
    });
    res.json({ data: rows });
  } catch (err) { sendErr(res, err); }
});

employeeLeave.post('/:id/leave-applications', async (req, res) => {
  if (!WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot file a leave application.' });
  try {
    const employee = await loadEmployeeOr404(req, res); if (!employee) return;
    const b = req.body || {};
    const row = await leave.applyLeave(employee, { leaveTypeId: b.leaveTypeId, fromDate: b.fromDate, toDate: b.toDate, reason: b.reason }, req.user.id);
    await audit(req, 'leave_application.create', { organizationId: employee.organizationId, targetType: 'employee', targetId: employee.id, details: { leaveTypeId: b.leaveTypeId, days: row.days } });
    res.status(201).json({ data: row });
  } catch (err) { sendErr(res, err); }
});

module.exports = { types, applications, employeeLeave };
