'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'dashboard-analytics-test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const {
  sequelize,
  Organization,
  OrganizationBranch,
  PostCadre,
  Employee,
  User,
  EmployeeTimeEntry,
  LeaveType,
  LeaveApplication,
  EmployeeServiceHistory,
} = require('../src/models');
const { signToken } = require('../src/services/authService');
const { getDashboardAnalytics } = require('../src/services/dashboardAnalytics');
const routes = require('../src/routes');

let server;
let base;
let org;
let branch1;
let branch2;
let post;
let adminUser;
let adminToken;

const request = async (path, token) => {
  const response = await fetch(`${base}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return {
    status: response.status,
    body: await response.json(),
  };
};

before(async () => {
  await sequelize.sync();
  org = await Organization.create({ code: 'DASHTEST', name: 'Dashboard Test Bank' });
  branch1 = await OrganizationBranch.create({
    organizationId: org.id,
    name: 'Main Branch',
    code: 'MB01',
    unitType: 'HEAD_OFFICE',
    isHeadOffice: true,
  });
  branch2 = await OrganizationBranch.create({
    organizationId: org.id,
    name: 'Town Branch',
    code: 'TB02',
    unitType: 'BRANCH',
    isHeadOffice: false,
  });
  post = await PostCadre.create({ organizationId: org.id, code: 'OFFICER', name: 'Branch Officer' });

  const emp1 = await Employee.create({
    organizationId: org.id,
    branchId: branch1.id,
    postCadreId: post.id,
    empCode: 'E101',
    name: 'Alice Officer',
    doj: '2021-01-01',
    currentBasicPay: 35000,
  });

  const emp2 = await Employee.create({
    organizationId: org.id,
    branchId: branch2.id,
    postCadreId: post.id,
    empCode: 'E102',
    name: 'Bob Clerk',
    doj: '2022-01-01',
    currentBasicPay: 22000,
  });

  await Employee.create({
    organizationId: org.id,
    branchId: branch1.id,
    postCadreId: post.id,
    empCode: 'E103',
    name: 'Carol Unmarked',
    doj: '2026-11-01',
    currentBasicPay: 18000,
  });

  adminUser = await User.create({
    organizationId: org.id,
    email: 'admin@dashtest.invalid',
    name: 'Bank Admin',
    role: 'ORG_ADMIN',
    employeeId: emp1.id,
    passwordHash: 'unused',
  });
  adminToken = signToken(adminUser);

  const today = new Date().toISOString().slice(0, 10);

  // Time entry for emp1
  await EmployeeTimeEntry.create({
    organizationId: org.id,
    employeeId: emp1.id,
    localDate: today,
    checkInAt: new Date(),
  });

  // Leave for emp2
  const leaveType = await LeaveType.create({
    organizationId: org.id,
    code: 'CL',
    name: 'Casual Leave',
    annualDays: 12,
  });

  await LeaveApplication.create({
    employeeId: emp2.id,
    leaveTypeId: leaveType.id,
    fromDate: today,
    toDate: today,
    days: 1,
    status: 'APPROVED',
  });

  // Promotion event for emp1
  await EmployeeServiceHistory.create({
    employeeId: emp1.id,
    eventType: 'PROMOTION',
    eventDate: today,
    remarks: 'Promoted to Branch Officer',
    orderRef: 'GO/2026/01',
  });

  const app = express();
  app.use(express.json());
  app.use('/api/v1', routes);
  server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await sequelize.close();
});

test('getDashboardAnalytics aggregates branches, attendance presence, leaves and promotions', async () => {
  const data = await getDashboardAnalytics(org.id);

  assert.equal(data.totalEmployees, 3);
  assert.equal(data.totalBranches, 2);
  assert.equal(data.attendance.presentToday, 1);
  assert.equal(data.attendance.onLeaveToday, 1);
  assert.equal(data.attendance.absentToday, 1);
  assert.equal(data.attendance.presenceRate, 33);

  // Check branch matrix
  assert.equal(data.branches.length, 2);
  const b1 = data.branches.find((b) => b.code === 'MB01');
  assert.equal(b1.totalEmployees, 2);
  assert.equal(b1.presentToday, 1);
  assert.equal(b1.presenceRate, 50);

  const b2 = data.branches.find((b) => b.code === 'TB02');
  assert.equal(b2.totalEmployees, 1);
  assert.equal(b2.onLeaveToday, 1);
  assert.equal(b2.presenceRate, 0);

  // Check colorful pie charts
  assert.ok(Array.isArray(data.attendance.pieChartData));
  assert.equal(data.attendance.pieChartData.find((p) => p.label === 'Present Today').value, 1);
  assert.equal(data.attendance.pieChartData.find((p) => p.label === 'On Approved Leave').value, 1);

  assert.ok(Array.isArray(data.leaves.pieChartData));
  assert.ok(data.leaves.pieChartData.length > 0);

  assert.ok(Array.isArray(data.promotions.cadrePieChart));
  assert.equal(data.promotions.recentEvents.length, 1);
  assert.equal(data.promotions.recentEvents[0].empCode, 'E101');
});

test('operational dashboard separates unmarked staff and never invents shift exceptions', async () => {
  const data = await getDashboardAnalytics(org.id);

  assert.equal(data.summary.attendance.present, 1);
  assert.equal(data.summary.attendance.onLeave, 1);
  assert.equal(data.summary.attendance.unmarked, 1);
  assert.equal(data.summary.attendance.absent, 0);
  assert.equal(data.summary.attendance.late, 0);
  assert.equal(data.summary.attendance.shiftMismatch, 0);
  assert.equal(data.summary.attendance.shiftConfigured, false);
  assert.deepEqual(data.workspaces.attendanceExceptions.map((row) => row.employeeId), [3]);
  assert.match(data.workspaces.attendanceExceptions[0].reason, /not marked/i);
});

test('operational dashboard filters every summary and action row by branch', async () => {
  const data = await getDashboardAnalytics(org.id, { branchId: branch2.id });

  assert.equal(data.summary.attendance.total, 1);
  assert.equal(data.summary.attendance.onLeave, 1);
  assert.equal(data.summary.attendance.unmarked, 0);
  assert.ok(data.actions.every((row) => row.branchId === branch2.id));
  assert.deepEqual(data.filterOptions.branches.map((row) => row.id), [branch1.id, branch2.id]);
});

test('payroll readiness reports missing fields without exposing sensitive values', async () => {
  const data = await getDashboardAnalytics(org.id);
  const serialized = JSON.stringify(data);

  assert.equal(data.summary.payroll.totalEmployees, 3);
  assert.equal(data.summary.payroll.recordsNeedingReview, 3);
  assert.ok(data.workspaces.payrollBlockers.some((row) => row.details.includes('salary bank account')));
  assert.doesNotMatch(serialized, /bankAccountNumber|aadhaarNumber|panNumber/i);
});

test('GET /org/dashboard-analytics returns 200 with complete analytics structure', async () => {
  const res = await request('/org/dashboard-analytics', adminToken);
  assert.equal(res.status, 200);
  assert.ok(res.body.data);
  assert.equal(res.body.data.totalEmployees, 3);
  assert.ok(res.body.data.branches);
  assert.ok(res.body.data.attendance);
  assert.ok(res.body.data.leaves);
  assert.ok(res.body.data.promotions);
  assert.ok(res.body.data.summary);
  assert.ok(res.body.data.actions);
  assert.ok(res.body.data.alerts);
  assert.ok(res.body.data.analytics);
  assert.ok(res.body.data.workspaces);
});

test('GET /org/dashboard-analytics rejects invalid operational filters', async () => {
  const res = await request('/org/dashboard-analytics?branchId=not-a-number', adminToken);
  assert.equal(res.status, 400);
  assert.match(res.body.message, /branch/i);
});

test('dashboard reporting derives today and year from the India bank date', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/services/dashboardAnalytics.js'), 'utf8');
  assert.match(source, /todayIST\(\)/);
  assert.match(source, /currentYearStart\s*=\s*`\$\{today\.slice\(0, 4\)\}-01-01`/);
  assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});
