'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'leave-rollover-test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const {
  sequelize, Organization, Employee, PostCadre, LeaveType,
  EmployeeLeaveBalance, LeaveYearEndSnapshot, User,
} = models;
const leave = require('../src/services/leave');

let serial = 0;

before(async () => {
  await sequelize.sync();
});

after(async () => {
  await sequelize.close();
});

test('leave year-end rollover enforces KSR rules: CL lapses, EL carries forward capped at 300 days', async () => {
  const org = await Organization.create({
    code: `LVE_${++serial}`,
    name: 'Leave Bank',
    status: 'ACTIVE',
  });

  const post = await PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });

  // Employee 1: has normal balances
  const emp1 = await Employee.create({
    organizationId: org.id,
    postCadreId: post.id,
    empCode: 'EMP001',
    name: 'Anand Kumar',
    doj: '2020-01-01',
    status: 'ACTIVE',
  });

  // Employee 2: has high EL balance exceeding 300 days
  const emp2 = await Employee.create({
    organizationId: org.id,
    postCadreId: post.id,
    empCode: 'EMP002',
    name: 'Bina Varma',
    doj: '2020-01-01',
    status: 'ACTIVE',
  });

  // Leave types: CL (non-cumulative) and EL (cumulative, maxAccumulation 300)
  const clType = await LeaveType.create({
    organizationId: org.id,
    code: 'CL',
    name: 'Casual Leave',
    accrualMethod: 'FIXED_ANNUAL',
    annualDays: 20,
    carryForward: false,
    maxAccumulation: null,
  });

  const elType = await LeaveType.create({
    organizationId: org.id,
    code: 'EL',
    name: 'Earned Leave',
    accrualMethod: 'ACCRUAL_PER_MONTH',
    annualDays: 30,
    carryForward: true,
    maxAccumulation: 300,
  });

  const year2025 = 2025;

  // Emp 1 in 2025: CL closing = 7 (availed 13 of 20), EL closing = 110
  await EmployeeLeaveBalance.create({
    employeeId: emp1.id,
    leaveTypeId: clType.id,
    year: year2025,
    openingBalance: 0,
    accrued: 20,
    availed: 13,
    closingBalance: 7,
  });

  await EmployeeLeaveBalance.create({
    employeeId: emp1.id,
    leaveTypeId: elType.id,
    year: year2025,
    openingBalance: 90,
    accrued: 30,
    availed: 10,
    closingBalance: 110,
  });

  // Emp 2 in 2025: EL closing = 315 (exceeds 300 days)
  await EmployeeLeaveBalance.create({
    employeeId: emp2.id,
    leaveTypeId: elType.id,
    year: year2025,
    openingBalance: 290,
    accrued: 30,
    availed: 5,
    closingBalance: 315,
  });

  // 1. Preview Rollover for 2025 -> 2026
  const preview = await leave.previewLeaveYearEndRollover(org.id, year2025);
  assert.equal(preview.fromYear, 2025);
  assert.equal(preview.toYear, 2026);
  assert.equal(preview.cycleType, 'CALENDAR');
  assert.equal(preview.employeesCount, 2);

  // Check Emp 1 CL
  const emp1Cl = preview.records.find((r) => r.employeeId === emp1.id && r.leaveTypeCode === 'CL');
  assert.equal(emp1Cl.previousClosing, 7);
  assert.equal(emp1Cl.lapsedDays, 7); // CL lapses!
  assert.equal(emp1Cl.carriedForwardDays, 0);
  assert.equal(emp1Cl.newOpeningBalance, 0);
  assert.equal(emp1Cl.initialAccrual, 20); // Fresh 20 days credited
  assert.equal(emp1Cl.projectedClosing, 20);

  // Check Emp 1 EL
  const emp1El = preview.records.find((r) => r.employeeId === emp1.id && r.leaveTypeCode === 'EL');
  assert.equal(emp1El.previousClosing, 110);
  assert.equal(emp1El.lapsedDays, 0);
  assert.equal(emp1El.carriedForwardDays, 110);
  assert.equal(emp1El.newOpeningBalance, 110);

  // Check Emp 2 EL (Capped at 300)
  const emp2El = preview.records.find((r) => r.employeeId === emp2.id && r.leaveTypeCode === 'EL');
  assert.equal(emp2El.previousClosing, 315);
  assert.equal(emp2El.carriedForwardDays, 300); // Capped at 300
  assert.equal(emp2El.cappedDays, 15); // 15 days surplus above cap
  assert.equal(emp2El.newOpeningBalance, 300);

  const admin = await User.create({
    organizationId: org.id,
    name: 'Admin',
    email: `admin_${serial}@bank.invalid`,
    role: 'ORG_ADMIN',
    passwordHash: 'hash',
  });

  // 2. Execute Rollover
  const snapshot = await leave.executeLeaveYearEndRollover(org.id, year2025, admin.id, '2025-2026 Annual Leave Rollover');
  assert.ok(snapshot.id);
  assert.equal(snapshot.fromYear, 2025);
  assert.equal(snapshot.toYear, 2026);
  assert.equal(Number(snapshot.totalLapsedDays), 7);
  assert.equal(Number(snapshot.totalCarriedForwardDays), 410); // 110 + 300
  assert.equal(Number(snapshot.totalCappedDays), 15);

  // Verify DB records for 2026
  const emp1Cl2026 = await EmployeeLeaveBalance.findOne({
    where: { employeeId: emp1.id, leaveTypeId: clType.id, year: 2026 },
  });
  assert.equal(Number(emp1Cl2026.openingBalance), 0);
  assert.equal(Number(emp1Cl2026.accrued), 20);
  assert.equal(Number(emp1Cl2026.closingBalance), 20);

  const emp2El2026 = await EmployeeLeaveBalance.findOne({
    where: { employeeId: emp2.id, leaveTypeId: elType.id, year: 2026 },
  });
  assert.equal(Number(emp2El2026.openingBalance), 300);

  // 3. Re-execution protection (Idempotency)
  await assert.rejects(
    leave.executeLeaveYearEndRollover(org.id, year2025, admin.id, 'Duplicate'),
    /already been executed/
  );

  // 4. List historical snapshots
  const history = await leave.listLeaveYearEndSnapshots(org.id);
  assert.equal(history.length, 1);
  assert.equal(history[0].toYear, 2026);
});
