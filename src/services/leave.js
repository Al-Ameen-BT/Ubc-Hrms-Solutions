'use strict';

/**
 * Leave Policy + Leave Management — see models/leaveType.js,
 * employeeLeaveBalance.js, leaveApplication.js.
 *
 * Applications can be filed by HR on an employee's behalf or by the
 * employee through /me. The existing approver flow decides both.
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

const { sequelize, LeaveType, OrgLeaveSetting, OrganizationHoliday, EmployeeLeaveBalance, LeaveApplication, Employee, OrgPayrollSetting, Organization, User, OrganizationBranch, EmployeeOrganizationAssignment, OrganizationResponsibilityAssignment } = require('../models');
const { Op } = require('sequelize');
const { todayIST } = require('./orgAccess');
const { effectiveAccess, can, scopedWhere } = require('./accessControl');
const { getSettings } = require('./payrollSettings');
const { yearLabelFor } = require('./dateUtils');

class LeaveError extends Error {
  constructor(message, status) { super(message); this.status = status || 400; }
}

function round1(n) { return Math.round((Number(n) || 0) * 10) / 10; }

const DEFAULT_LEAVE_TYPES = [
  { code: 'CL', name: 'Casual Leave', accrualMethod: 'FIXED_ANNUAL', annualDays: 20, carryForward: false, maxAccumulation: null, encashable: false, paidPercent: 100, includeHolidays: false, isLop: false },
  { code: 'EL', name: 'Earned Leave', accrualMethod: 'ACCRUAL_PER_MONTH', annualDays: 30, carryForward: true, maxAccumulation: 300, encashable: true, paidPercent: 100, includeHolidays: true, isLop: false },
  { code: 'HPL', name: 'Half Pay Leave', accrualMethod: 'ACCRUAL_PER_MONTH', annualDays: 20, carryForward: true, maxAccumulation: null, encashable: false, paidPercent: 50, includeHolidays: true, isLop: false },
  { code: 'ML', name: 'Maternity Leave', accrualMethod: 'FIXED_ANNUAL', annualDays: 180, carryForward: false, maxAccumulation: null, encashable: false, paidPercent: 100, includeHolidays: true, isLop: false },
  { code: 'SPL', name: 'Special Casual Leave', accrualMethod: 'NONE', annualDays: 0, carryForward: false, maxAccumulation: null, encashable: false, paidPercent: 100, requiresApproval: true, includeHolidays: false, isLop: false },
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
  const code = String(b.code).trim().toUpperCase().slice(0, 16);
  const isLop = b.isLop === true || code === 'LOP';
  let includeHolidays = b.includeHolidays;
  if (includeHolidays === undefined) {
    includeHolidays = code !== 'CL' && !isLop;
  } else {
    includeHolidays = Boolean(includeHolidays);
  }
  return {
    code,
    name: String(b.name).trim(),
    accrualMethod: b.accrualMethod,
    annualDays,
    maxAccumulation: b.maxAccumulation != null && b.maxAccumulation !== '' ? Number(b.maxAccumulation) : null,
    carryForward: b.carryForward !== false,
    encashable: b.encashable === true,
    paidPercent,
    includeHolidays,
    isLop,
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
async function currentYearLabel(organizationId, onDate, transaction) {
  const settings = transaction ? await OrgPayrollSetting.findOne({ where: { organizationId }, transaction }) || await OrgPayrollSetting.create({ organizationId }, { transaction }) : await getSettings(organizationId);
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

async function getLeaveSettings(organizationId, transaction) {
  const [row] = await OrgLeaveSetting.findOrCreate({
    where: { organizationId },
    defaults: { organizationId },
    transaction,
  });
  return row;
}

async function updateLeaveSettings(organizationId, body, transaction) {
  const row = await getLeaveSettings(organizationId, transaction);
  const payload = {};
  if (body.sandwichRuleEnabled !== undefined) payload.sandwichRuleEnabled = Boolean(body.sandwichRuleEnabled);
  if (body.excludeHolidaysCasualLeave !== undefined) payload.excludeHolidaysCasualLeave = Boolean(body.excludeHolidaysCasualLeave);
  if (body.excludeHolidaysLop !== undefined) payload.excludeHolidaysLop = Boolean(body.excludeHolidaysLop);
  if (body.countSundaysAsHolidays !== undefined) payload.countSundaysAsHolidays = Boolean(body.countSundaysAsHolidays);
  if (body.weekendPolicy && ['SUNDAY_ONLY', 'SATURDAY_SUNDAY', 'SECOND_FOURTH_SATURDAY_SUNDAY'].includes(body.weekendPolicy)) {
    payload.weekendPolicy = body.weekendPolicy;
  }
  if (body.remarks !== undefined) payload.remarks = body.remarks ? String(body.remarks).slice(0, 500) : null;
  await row.update(payload, { transaction });
  return row;
}

function isWeekendDay(dateObj, weekendPolicy) {
  const dayOfWeek = dateObj.getUTCDay(); // 0 is Sunday, 6 is Saturday
  if (dayOfWeek === 0) return true;
  if (weekendPolicy === 'SATURDAY_SUNDAY') {
    return dayOfWeek === 6;
  }
  if (weekendPolicy === 'SECOND_FOURTH_SATURDAY_SUNDAY') {
    if (dayOfWeek === 6) {
      const dateOfMonth = dateObj.getUTCDate();
      return (dateOfMonth >= 8 && dateOfMonth <= 14) || (dateOfMonth >= 22 && dateOfMonth <= 28);
    }
  }
  return false;
}

async function calculateLeaveBreakdown(organizationId, leaveType, fromDate, toDate, transaction) {
  if (!fromDate || !toDate) throw new LeaveError('fromDate and toDate are required.');
  const cur = new Date(String(fromDate) + 'T00:00:00Z');
  const end = new Date(String(toDate) + 'T00:00:00Z');
  if (isNaN(cur.getTime()) || isNaN(end.getTime())) throw new LeaveError('Invalid date format for fromDate or toDate.');
  if (cur.getTime() > end.getTime()) throw new LeaveError('toDate must be on or after fromDate.');

  const settings = await getLeaveSettings(organizationId, transaction);
  const holidays = await OrganizationHoliday.findAll({
    where: {
      organizationId,
      status: 'ACTIVE',
      date: { [Op.between]: [fromDate, toDate] },
    },
    transaction,
  });

  const holidayMap = new Map();
  for (const h of holidays) {
    holidayMap.set(h.date, h.name);
  }

  const code = leaveType.code ? String(leaveType.code).toUpperCase() : '';
  const isCasual = code === 'CL';
  const isLop = leaveType.isLop === true || code === 'LOP';

  let shouldInclude = false;
  if (settings.sandwichRuleEnabled) {
    if (isCasual) {
      shouldInclude = !settings.excludeHolidaysCasualLeave;
    } else if (isLop) {
      shouldInclude = !settings.excludeHolidaysLop;
    } else {
      shouldInclude = leaveType.includeHolidays !== false;
    }
  } else {
    shouldInclude = false;
  }

  const holidaysDetected = [];
  const weekendsDetected = [];
  let calendarDays = 0;
  let chargeableDays = 0;
  let workingDays = 0;

  const iter = new Date(cur.getTime());
  while (iter.getTime() <= end.getTime()) {
    calendarDays += 1;
    const dateStr = iter.toISOString().slice(0, 10);
    const holidayName = holidayMap.get(dateStr);
    const isHoliday = !!holidayName;
    const isWeekend = settings.countSundaysAsHolidays && isWeekendDay(iter, settings.weekendPolicy);

    if (isHoliday) {
      holidaysDetected.push({ date: dateStr, name: holidayName });
    }
    if (isWeekend && !isHoliday) {
      weekendsDetected.push({ date: dateStr, day: iter.getUTCDay() === 0 ? 'Sunday' : 'Saturday' });
    }

    const isNonWorking = isHoliday || isWeekend;
    if (!isNonWorking) {
      workingDays += 1;
    }

    if (shouldInclude) {
      // Common holidays & weekends in range count as leave taken dates
      chargeableDays += 1;
    } else {
      // Excluded: only working days count
      if (!isNonWorking) {
        chargeableDays += 1;
      }
    }

    iter.setUTCDate(iter.getUTCDate() + 1);
  }

  return {
    days: chargeableDays,
    calendarDays,
    workingDays,
    holidaysDetected,
    weekendsDetected,
    includeHolidays: shouldInclude,
    sandwichRuleApplied: shouldInclude,
    policyName: shouldInclude ? 'Sandwich Rule (Holidays Included)' : 'Working Days Only (Holidays Excluded)',
    policyNotice: shouldInclude
      ? `Common holidays (${holidaysDetected.length}) and weekly offs (${weekendsDetected.length}) are counted as leave taken.`
      : `Common holidays (${holidaysDetected.length}) and weekly offs (${weekendsDetected.length}) are excluded from leave deduction.`,
  };
}

function inclusiveDays(fromDate, toDate) {
  const a = new Date(String(fromDate) + 'T00:00:00Z');
  const b = new Date(String(toDate) + 'T00:00:00Z');
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

const currentResponsibility = date => ({ status: 'ACTIVE', effectiveFrom: { [Op.lte]: date }, [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: date } }] });
async function selectedLeaveApprover(employee, submittedBy, transaction) {
  const date = todayIST(), organizationId = employee.organizationId;
  const placements = await EmployeeOrganizationAssignment.findAll({ where: { organizationId, employeeId: employee.id, ...currentResponsibility(date) }, transaction, lock: transaction.LOCK.UPDATE });
  if (placements.length !== 1 || !await OrganizationBranch.count({ where: { id: placements[0].branchId, organizationId, status: 'ACTIVE' }, transaction })) throw new LeaveError('A current branch assignment is required to select an approver.', 409);
  const branchId = placements[0].branchId;
  const responsibilities = await OrganizationResponsibilityAssignment.findAll({ where: { organizationId, ...currentResponsibility(date) }, transaction, lock: transaction.LOCK.UPDATE });
  const inScope = row => row.scopeType === 'ORGANISATION' || row.scopeType === 'BRANCH' && String(row.branchId) === String(branchId);
  const own = responsibilities.filter(row => String(row.employeeId) === String(employee.id) && inScope(row));
  const target = own.some(row => row.responsibility === 'SENIOR_MANAGER') ? 'GENERAL_MANAGER' : own.some(row => row.responsibility === 'BRANCH_MANAGER') ? 'SENIOR_MANAGER' : 'BRANCH_MANAGER';
  const holders = responsibilities.filter(row => row.responsibility === target && inScope(row));
  if (holders.length !== 1) throw new LeaveError('Exactly one current in-scope approver is required.', 409);
  const holder = holders[0];
  const users = await User.findAll({ where: { organizationId, employeeId: holder.employeeId, status: 'ACTIVE', ...(holder.userId ? { id: holder.userId } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
  if (users.length !== 1 || String(holder.employeeId) === String(employee.id) || String(users[0].id) === String(submittedBy)) throw new LeaveError('A separate active linked approver is required.', 409);
  const access = await effectiveAccess(users[0].id, date, transaction);
  if (!can(access, 'leave.approve') || !await Employee.count({ where: { [Op.and]: [{ id: employee.id }, scopedWhere(access, 'leave.approve', 'Employee')] }, transaction })) throw new LeaveError('The selected approver is outside the permitted scope.', 409);
  return users[0].id;
}

async function applyLeave(employee, { leaveTypeId, fromDate, toDate, reason }, userId) {
  const leaveType = await LeaveType.findByPk(leaveTypeId);
  if (!leaveType || String(leaveType.organizationId) !== String(employee.organizationId)) throw new LeaveError('Leave type not found.', 404);
  if (leaveType.status !== 'ACTIVE') throw new LeaveError('This leave type is inactive.', 400);
  if (!fromDate || !toDate) throw new LeaveError('fromDate and toDate are required.');

  const breakdown = await calculateLeaveBreakdown(employee.organizationId, leaveType, fromDate, toDate);
  const days = breakdown.days;
  if (!(days >= 1)) {
    throw new LeaveError('The selected leave period contains only common holidays or weekly offs; no leave days need to be deducted.', 400);
  }

  if (leaveType.accrualMethod !== 'NONE') {
    const year = await currentYearLabel(employee.organizationId, fromDate);
    const bal = await getOrCreateBalance(employee.id, leaveType.id, year);
    const pendingSameType = await LeaveApplication.sum('days', { where: { employeeId: employee.id, leaveTypeId: leaveType.id, status: 'PENDING' } });
    const available = Number(bal.closingBalance) - Number(pendingSameType || 0);
    if (days > available) {
      throw new LeaveError(`Insufficient ${leaveType.code} balance: ${available} day(s) available, ${days} requested.`, 400);
    }
  }

  return sequelize.transaction(async transaction => {
    const org = await Organization.findByPk(employee.organizationId, { transaction, lock: transaction.LOCK.UPDATE });
    const currentEmployee = await Employee.findOne({ where: { id: employee.id, organizationId: org.id, status: 'ACTIVE' }, transaction, lock: transaction.LOCK.UPDATE });
    if (!currentEmployee) throw new LeaveError('Employee not found.', 404);
    const selectedApproverUserId = org.accessControlMode === 'PERMISSIONS' && leaveType.requiresApproval ? await selectedLeaveApprover(currentEmployee, userId, transaction) : null;
    const application = await LeaveApplication.create({
      employeeId: employee.id, leaveTypeId: leaveType.id, fromDate, toDate, days,
      reason: reason ? String(reason).slice(0, 500) : null, appliedBy: userId || null,
      selectedApproverUserId, status: 'PENDING',
    }, { transaction });
    if (!leaveType.requiresApproval) await settleApproval(application, leaveType, employee, 'APPROVED', userId, null, transaction);
    return application;
  });
}

async function settleApproval(application, leaveType, employee, decision, userId, reason, transaction) {
  const year = decision === 'APPROVED' && leaveType.accrualMethod !== 'NONE'
    ? await currentYearLabel(employee.organizationId, application.fromDate, transaction) : null;
  const settle = async t => {
    const [changed] = await LeaveApplication.update({
      status: decision, decidedBy: userId || null, decidedAt: new Date(),
      decisionReason: reason ? String(reason).slice(0, 500) : null,
    }, { where: { id: application.id, status: 'PENDING' }, transaction: t });
    if (!changed) throw new LeaveError('This application has already been decided.', 409);
    if (decision === 'APPROVED' && leaveType.accrualMethod !== 'NONE') {
      const bal = await getOrCreateBalance(employee.id, leaveType.id, year, t);
      if (Number(application.days) > Number(bal.closingBalance)) {
        throw new LeaveError(`Insufficient ${leaveType.code} balance at approval time: ${bal.closingBalance} day(s) available, ${application.days} requested.`, 409);
      }
      bal.availed = round1(Number(bal.availed) + Number(application.days));
      recomputeClosing(bal);
      await bal.save({ transaction: t });
    }
    await application.reload({ transaction: t });
    return application;
  };
  return transaction ? settle(transaction) : sequelize.transaction(settle);
}

async function decideLeave(application, decision, userId, reason) {
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new LeaveError('decision must be APPROVED or REJECTED.');
  return sequelize.transaction(async transaction => {
    await application.reload({ transaction, lock: transaction.LOCK.UPDATE });
    if (application.status !== 'PENDING') throw new LeaveError(`This application is already ${application.status}.`, 409);
    const employee = await Employee.findByPk(application.employeeId, { transaction, lock: transaction.LOCK.UPDATE });
    const org = employee && await Organization.findByPk(employee.organizationId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!org) throw new LeaveError('Employee not found.', 404);
    if (org.accessControlMode === 'PERMISSIONS') {
      const actor = await User.findOne({ where: { id: userId, organizationId: org.id, status: 'ACTIVE' }, transaction, lock: transaction.LOCK.UPDATE });
      if (!actor || String(application.selectedApproverUserId) !== String(userId) || String(actor.employeeId) === String(employee.id) || String(application.appliedBy) === String(userId)) throw new LeaveError('Only the selected separate approver may decide this request.', 403);
      const access = await effectiveAccess(actor.id, todayIST(), transaction);
      if (!can(access, 'leave.approve') || !await Employee.count({ where: { [Op.and]: [{ id: employee.id }, scopedWhere(access, 'leave.approve', 'Employee')] }, transaction })) throw new LeaveError('The selected approver is inactive, unlinked or outside scope.', 403);
    }
    const leaveType = await LeaveType.findOne({ where: { id: application.leaveTypeId, organizationId: org.id }, transaction });
    if (!leaveType) throw new LeaveError('Leave type not found.', 404);
    return settleApproval(application, leaveType, employee, decision, userId, reason, transaction);
  });
}

async function cancelLeave(application, userId) {
  if (!['PENDING', 'APPROVED'].includes(application.status)) throw new LeaveError(`This application is already ${application.status}.`, 409);
  const wasApproved = application.status === 'APPROVED';
  const leaveType = wasApproved ? await LeaveType.findByPk(application.leaveTypeId) : null;
  const year = wasApproved && leaveType.accrualMethod !== 'NONE'
    ? await currentYearLabel((await Employee.findByPk(application.employeeId)).organizationId, application.fromDate) : null;
  return sequelize.transaction(async (t) => {
    const [changed] = await LeaveApplication.update(
      { status: 'CANCELLED', decidedBy: userId || null, decidedAt: new Date() },
      { where: { id: application.id, status: application.status }, transaction: t },
    );
    if (!changed) throw new LeaveError('This application has already changed.', 409);
    if (wasApproved) {
      if (leaveType.accrualMethod !== 'NONE') {
        const bal = await getOrCreateBalance(application.employeeId, application.leaveTypeId, year, t);
        bal.availed = round1(Math.max(0, Number(bal.availed) - Number(application.days)));
        recomputeClosing(bal);
        await bal.save({ transaction: t });
      }
    }
    await application.reload({ transaction: t });
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
  getLeaveSettings, updateLeaveSettings, calculateLeaveBreakdown, isWeekendDay,
};
