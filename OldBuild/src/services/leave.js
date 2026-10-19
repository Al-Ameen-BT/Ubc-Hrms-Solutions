'use strict';

/**
 * Leave Policy + Leave Management — see models/leaveType.js,
 * employeeLeaveBalance.js, leaveApplication.js.
 *
 * This product has no employee self-service login (every screen is used
 * by HR/payroll staff), so a "leave application" here is filed by HR on
 * the employee's behalf — the same shape as attendance/LOP marking — and
 * decided by an approver, rather than a self-serve request/inbox flow.
 *
 * Rule verification required: the default leave types this service can
 * seed (seedDefaultLeaveTypes) follow the commonly-cited Kerala Service
 * Rules (KSR) figures — Casual Leave 20 days/year non-cumulative, Earned
 * Leave accruing 2.5 days/month cumulative up to 300 days (encashable),
 * Half Pay Leave 2.5 days/month cumulative at 50% pay, Maternity Leave a
 * 180-day fixed block, Special Casual Leave case-by-case/not
 * balance-tracked — as a starting point only. Confirm the exact
 * entitlements against the bank's own certified service rules/bipartite
 * settlement before relying on them for real leave administration; every
 * figure is editable per organisation once created.
 */

const { sequelize, LeaveType, EmployeeLeaveBalance, LeaveApplication, Employee } = require('../models');
const { getSettings } = require('./payrollSettings');
const { yearLabelFor } = require('./dateUtils');

class LeaveError extends Error {
  constructor(message, status) { super(message); this.status = status || 400; }
}

function round1(n) { return Math.round((Number(n) || 0) * 10) / 10; }

const DEFAULT_LEAVE_TYPES = [
  { code: 'CL', name: 'Casual Leave', accrualMethod: 'FIXED_ANNUAL', annualDays: 20, carryForward: false, maxAccumulation: null, encashable: false, paidPercent: 100 },
  { code: 'EL', name: 'Earned Leave', accrualMethod: 'ACCRUAL_PER_MONTH', annualDays: 30, carryForward: true, maxAccumulation: 300, encashable: true, paidPercent: 100 },
  { code: 'HPL', name: 'Half Pay Leave', accrualMethod: 'ACCRUAL_PER_MONTH', annualDays: 20, carryForward: true, maxAccumulation: null, encashable: false, paidPercent: 50 },
  { code: 'ML', name: 'Maternity Leave', accrualMethod: 'FIXED_ANNUAL', annualDays: 180, carryForward: false, maxAccumulation: null, encashable: false, paidPercent: 100 },
  { code: 'SPL', name: 'Special Casual Leave', accrualMethod: 'NONE', annualDays: 0, carryForward: false, maxAccumulation: null, encashable: false, paidPercent: 100, requiresApproval: true },
];

async function seedDefaultLeaveTypes(organizationId) {
  const existing = await LeaveType.findAll({ where: { organizationId } });
  const haveCodes = new Set(existing.map((r) => r.code));
  const toCreate = DEFAULT_LEAVE_TYPES.filter((t) => !haveCodes.has(t.code)).map((t) => ({ ...t, organizationId, remarks: 'Seeded starting point (KSR-style figures) — verify against this bank\'s own service rules and adjust as needed.' }));
  if (toCreate.length) await LeaveType.bulkCreate(toCreate);
  return LeaveType.findAll({ where: { organizationId }, order: [['code', 'ASC']] });
}

function validateTypeBody(b) {
  if (!b.code || !String(b.code).trim()) throw new LeaveError('code is required.');
  if (!b.name || !String(b.name).trim()) throw new LeaveError('name is required.');
  if (!['FIXED_ANNUAL', 'ACCRUAL_PER_MONTH', 'NONE'].includes(b.accrualMethod)) {
    throw new LeaveError('accrualMethod must be FIXED_ANNUAL, ACCRUAL_PER_MONTH or NONE.');
  }
  const annualDays = b.accrualMethod === 'NONE' ? 0 : Number(b.annualDays);
  if (b.accrualMethod !== 'NONE' && !(annualDays > 0)) throw new LeaveError('annualDays must be a positive number for this accrual method.');
  const paidPercent = b.paidPercent != null && b.paidPercent !== '' ? Number(b.paidPercent) : 100;
  if (!(paidPercent >= 0 && paidPercent <= 100)) throw new LeaveError('paidPercent must be between 0 and 100.');
  return {
    code: String(b.code).trim().toUpperCase().slice(0, 16),
    name: String(b.name).trim(),
    accrualMethod: b.accrualMethod,
    annualDays,
    maxAccumulation: b.maxAccumulation != null && b.maxAccumulation !== '' ? Number(b.maxAccumulation) : null,
    carryForward: b.carryForward !== false,
    encashable: b.encashable === true,
    paidPercent,
    requiresApproval: b.requiresApproval !== false,
  };
}

async function createType(organizationId, body) {
  const clean = validateTypeBody(body);
  return LeaveType.create({ ...clean, organizationId, remarks: body.remarks ? String(body.remarks).slice(0, 500) : null });
}

async function updateType(row, body) {
  const clean = validateTypeBody({ ...row.toJSON(), ...body });
  await row.update({ ...clean, remarks: body.remarks !== undefined ? (body.remarks ? String(body.remarks).slice(0, 500) : null) : row.remarks });
  return row;
}

/** Current org "year" label for a given date, per the org's yearType. */
async function currentYearLabel(organizationId, onDate) {
  const settings = await getSettings(organizationId);
  const d = onDate ? new Date(onDate) : new Date();
  return yearLabelFor(settings.yearType, d.getUTCFullYear(), d.getUTCMonth() + 1);
}

async function getOrCreateBalance(employeeId, leaveTypeId, year, t) {
  const [row] = await EmployeeLeaveBalance.findOrCreate({
    where: { employeeId, leaveTypeId, year }, defaults: { employeeId, leaveTypeId, year }, transaction: t,
  });
  return row;
}

function recomputeClosing(row) {
  row.closingBalance = round1(Number(row.openingBalance) + Number(row.accrued) - Number(row.availed));
}

/**
 * Credits one month's accrual (ACCRUAL_PER_MONTH types) or the full
 * annual amount (FIXED_ANNUAL, only if not already credited this year) for
 * every ACTIVE employee of an org, for one leave type. Idempotent per
 * (employee, leaveType, year, month) via lastAccrualMonth, so re-running
 * the same month twice is a no-op.
 */
async function accrueForMonth(organizationId, leaveTypeId, year, month) {
  const leaveType = await LeaveType.findByPk(leaveTypeId);
  if (!leaveType || String(leaveType.organizationId) !== String(organizationId)) throw new LeaveError('Leave type not found.', 404);
  if (leaveType.accrualMethod === 'NONE') throw new LeaveError('This leave type is not balance-tracked — nothing to accrue.', 400);
  const employees = await Employee.findAll({ where: { organizationId, status: 'ACTIVE' } });
  let credited = 0;
  await sequelize.transaction(async (t) => {
    for (const emp of employees) {
      // eslint-disable-next-line no-await-in-loop
      const bal = await getOrCreateBalance(emp.id, leaveTypeId, year, t);
      if (leaveType.accrualMethod === 'FIXED_ANNUAL') {
        if (bal.lastAccrualMonth) continue; // already credited this year
        bal.accrued = round1(Number(bal.accrued) + Number(leaveType.annualDays));
        bal.lastAccrualMonth = month;
      } else {
        if (Number(bal.lastAccrualMonth) === Number(month)) continue; // already credited this month
        bal.accrued = round1(Number(bal.accrued) + Number(leaveType.annualDays) / 12);
        bal.lastAccrualMonth = month;
      }
      if (leaveType.maxAccumulation != null) {
        const cap = Number(leaveType.maxAccumulation);
        const wouldBe = Number(bal.openingBalance) + Number(bal.accrued);
        if (wouldBe > cap) bal.accrued = round1(cap - Number(bal.openingBalance));
      }
      recomputeClosing(bal);
      // eslint-disable-next-line no-await-in-loop
      await bal.save({ transaction: t });
      credited += 1;
    }
  });
  return { leaveType: leaveType.code, year, month, employeesCredited: credited };
}

function inclusiveDays(fromDate, toDate) {
  const a = new Date(String(fromDate) + 'T00:00:00Z');
  const b = new Date(String(toDate) + 'T00:00:00Z');
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

async function applyLeave(employee, { leaveTypeId, fromDate, toDate, reason }, userId) {
  const leaveType = await LeaveType.findByPk(leaveTypeId);
  if (!leaveType || String(leaveType.organizationId) !== String(employee.organizationId)) throw new LeaveError('Leave type not found.', 404);
  if (leaveType.status !== 'ACTIVE') throw new LeaveError('This leave type is inactive.', 400);
  if (!fromDate || !toDate) throw new LeaveError('fromDate and toDate are required.');
  const days = inclusiveDays(fromDate, toDate);
  if (!(days >= 1)) throw new LeaveError('toDate must be on or after fromDate.');

  if (leaveType.accrualMethod !== 'NONE') {
    const year = await currentYearLabel(employee.organizationId, fromDate);
    const bal = await getOrCreateBalance(employee.id, leaveType.id, year);
    const pendingSameType = await LeaveApplication.sum('days', { where: { employeeId: employee.id, leaveTypeId: leaveType.id, status: 'PENDING' } });
    const available = Number(bal.closingBalance) - Number(pendingSameType || 0);
    if (days > available) {
      throw new LeaveError(`Insufficient ${leaveType.code} balance: ${available} day(s) available, ${days} requested.`, 400);
    }
  }

  const application = await LeaveApplication.create({
    employeeId: employee.id, leaveTypeId: leaveType.id, fromDate, toDate, days,
    reason: reason ? String(reason).slice(0, 500) : null, appliedBy: userId || null,
    status: leaveType.requiresApproval ? 'PENDING' : 'APPROVED',
  });
  if (!leaveType.requiresApproval) {
    await settleApproval(application, leaveType, employee, 'APPROVED', userId, null);
  }
  return application;
}

async function settleApproval(application, leaveType, employee, decision, userId, reason) {
  return sequelize.transaction(async (t) => {
    if (decision === 'APPROVED' && leaveType.accrualMethod !== 'NONE') {
      const year = await currentYearLabel(employee.organizationId, application.fromDate);
      const bal = await getOrCreateBalance(employee.id, leaveType.id, year, t);
      if (Number(application.days) > Number(bal.closingBalance)) {
        throw new LeaveError(`Insufficient ${leaveType.code} balance at approval time: ${bal.closingBalance} day(s) available, ${application.days} requested.`, 409);
      }
      bal.availed = round1(Number(bal.availed) + Number(application.days));
      recomputeClosing(bal);
      await bal.save({ transaction: t });
    }
    await application.update({
      status: decision, decidedBy: userId || null, decidedAt: new Date(),
      decisionReason: reason ? String(reason).slice(0, 500) : null,
    }, { transaction: t });
    return application;
  });
}

async function decideLeave(application, decision, userId, reason) {
  if (application.status !== 'PENDING') throw new LeaveError(`This application is already ${application.status}.`, 409);
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new LeaveError('decision must be APPROVED or REJECTED.');
  const [leaveType, employee] = await Promise.all([
    LeaveType.findByPk(application.leaveTypeId),
    Employee.findByPk(application.employeeId),
  ]);
  return settleApproval(application, leaveType, employee, decision, userId, reason);
}

async function cancelLeave(application, userId) {
  if (!['PENDING', 'APPROVED'].includes(application.status)) throw new LeaveError(`This application is already ${application.status}.`, 409);
  const wasApproved = application.status === 'APPROVED';
  return sequelize.transaction(async (t) => {
    if (wasApproved) {
      const leaveType = await LeaveType.findByPk(application.leaveTypeId);
      if (leaveType.accrualMethod !== 'NONE') {
        const year = await currentYearLabel((await Employee.findByPk(application.employeeId)).organizationId, application.fromDate);
        const bal = await getOrCreateBalance(application.employeeId, application.leaveTypeId, year, t);
        bal.availed = round1(Math.max(0, Number(bal.availed) - Number(application.days)));
        recomputeClosing(bal);
        await bal.save({ transaction: t });
      }
    }
    await application.update({ status: 'CANCELLED', decidedBy: userId || null, decidedAt: new Date() }, { transaction: t });
    return application;
  });
}

async function balancesFor(employeeId, year) {
  return EmployeeLeaveBalance.findAll({
    where: { employeeId, year },
    include: [{ model: LeaveType }],
    order: [['id', 'ASC']],
  });
}

module.exports = {
  LeaveError, DEFAULT_LEAVE_TYPES, seedDefaultLeaveTypes,
  createType, updateType, currentYearLabel,
  accrueForMonth, applyLeave, decideLeave, cancelLeave, balancesFor,
  inclusiveDays,
};
