'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sequelize,
  Organization,
  LeaveType,
  OrgLeaveSetting,
  OrganizationHoliday,
  Employee,
  User,
  EmployeeLeaveBalance,
  LeaveApplication,
} = require('../src/models');
const leave = require('../src/services/leave');
const { migrate } = require('../src/scripts/migrate');

test.before(async () => {
  await sequelize.sync();
  await migrate();
});

async function createFixture() {
  const code = `TEST_LEAVE_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const org = await Organization.create({
    code,
    name: 'Leave Test Bank',
    status: 'ACTIVE',
  });

  const post = await sequelize.models.PostCadre.create({
    organizationId: org.id,
    code: `POST_${code}`,
    name: 'Clerk',
  });

  const emp = await Employee.create({
    organizationId: org.id,
    postCadreId: post.id,
    empCode: `EMP_${code}`,
    name: 'Leave Test Employee',
    status: 'ACTIVE',
    doj: '2020-01-01',
  });

  const user = await User.create({
    organizationId: org.id,
    employeeId: emp.id,
    name: 'Admin User',
    email: `admin_${code}@bank.example`,
    role: 'ORG_ADMIN',
    passwordHash: 'hash',
    status: 'ACTIVE',
  });

  // Default seeded types
  const types = await leave.seedDefaultLeaveTypes(org.id);
  const clType = types.find((t) => t.code === 'CL');
  const elType = types.find((t) => t.code === 'EL');
  const hplType = types.find((t) => t.code === 'HPL');

  // Add a common holiday in between
  // 2026-08-14 is Friday
  // 2026-08-15 is Saturday (Independence Day)
  // 2026-08-16 is Sunday (Weekly off)
  // 2026-08-17 is Monday
  await OrganizationHoliday.create({
    organizationId: org.id,
    date: '2026-08-15',
    name: 'Independence Day',
    status: 'ACTIVE',
  });

  return { org, emp, user, clType, elType, hplType };
}

test('Casual Leave (CL) excludes common holidays and weekly offs from leave taken dates', async () => {
  const { org, emp, clType } = await createFixture();

  // Range: 2026-08-14 (Fri) to 2026-08-17 (Mon) = 4 calendar days
  // 2026-08-15 is Independence Day (Holiday)
  // 2026-08-16 is Sunday (Weekly off)
  // Casual Leave excludes holidays and Sundays -> 2 working days (Fri + Mon)
  const breakdown = await leave.calculateLeaveBreakdown(org.id, clType, '2026-08-14', '2026-08-17');

  assert.equal(breakdown.calendarDays, 4);
  assert.equal(breakdown.days, 2);
  assert.equal(breakdown.workingDays, 2);
  assert.equal(breakdown.holidaysDetected.length, 1);
  assert.equal(breakdown.holidaysDetected[0].name, 'Independence Day');
  assert.equal(breakdown.weekendsDetected.length, 1);
  assert.equal(breakdown.includeHolidays, false);
});

test('Earned Leave (EL) and other leaves include common holidays as leave taken dates (Sandwich Rule)', async () => {
  const { org, emp, elType } = await createFixture();

  // Range: 2026-08-14 (Fri) to 2026-08-17 (Mon) = 4 calendar days
  // EL has includeHolidays = true -> all 4 days count as leave taken
  const breakdown = await leave.calculateLeaveBreakdown(org.id, elType, '2026-08-14', '2026-08-17');

  assert.equal(breakdown.calendarDays, 4);
  assert.equal(breakdown.days, 4);
  assert.equal(breakdown.holidaysDetected.length, 1);
  assert.equal(breakdown.weekendsDetected.length, 1);
  assert.equal(breakdown.includeHolidays, true);
  assert.equal(breakdown.sandwichRuleApplied, true);
});

test('Loss of Pay (LOP) leave type excludes common holidays and weekly offs', async () => {
  const { org, emp } = await createFixture();

  const lopType = await LeaveType.create({
    organizationId: org.id,
    code: 'LOP',
    name: 'Loss of Pay',
    accrualMethod: 'NONE',
    annualDays: 0,
    isLop: true,
    includeHolidays: false,
  });

  const breakdown = await leave.calculateLeaveBreakdown(org.id, lopType, '2026-08-14', '2026-08-17');
  assert.equal(breakdown.days, 2); // Excludes holiday and Sunday
  assert.equal(breakdown.includeHolidays, false);
});

test('Applying leave validates and deducts correct calculated days', async () => {
  const { org, emp, user, elType, clType } = await createFixture();

  // Give balance for EL and CL in 2026
  await EmployeeLeaveBalance.create({
    employeeId: emp.id,
    leaveTypeId: elType.id,
    year: 2026,
    openingBalance: 10,
    closingBalance: 10,
  });
  await EmployeeLeaveBalance.create({
    employeeId: emp.id,
    leaveTypeId: clType.id,
    year: 2026,
    openingBalance: 10,
    closingBalance: 10,
  });

  // Apply EL (Fri to Mon): 4 calendar days, holidays included -> 4 days
  const elApp = await leave.applyLeave(emp, {
    leaveTypeId: elType.id,
    fromDate: '2026-08-14',
    toDate: '2026-08-17',
    reason: 'Vacation',
  }, user.id);
  assert.equal(Number(elApp.days), 4);

  // Apply CL (Fri to Mon): 4 calendar days, holidays excluded -> 2 days
  const clApp = await leave.applyLeave(emp, {
    leaveTypeId: clType.id,
    fromDate: '2026-08-14',
    toDate: '2026-08-17',
    reason: 'Personal',
  }, user.id);
  assert.equal(Number(clApp.days), 2);
});

test('Applying Casual Leave on only holidays/weekends fails with descriptive error', async () => {
  const { org, emp, user, clType } = await createFixture();

  await EmployeeLeaveBalance.create({
    employeeId: emp.id,
    leaveTypeId: clType.id,
    year: 2026,
    openingBalance: 10,
    closingBalance: 10,
  });

  // 2026-08-15 (Holiday) to 2026-08-16 (Sunday) -> 0 chargeable days for CL
  await assert.rejects(
    () => leave.applyLeave(emp, {
      leaveTypeId: clType.id,
      fromDate: '2026-08-15',
      toDate: '2026-08-16',
    }, user.id),
    (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /only common holidays or weekly offs/);
      return true;
    }
  );
});

test('Leave calculation settings can be customized per organization', async () => {
  const { org, elType } = await createFixture();

  // Fetch settings
  const settings = await leave.getLeaveSettings(org.id);
  assert.equal(settings.sandwichRuleEnabled, true);

  // Disable sandwich rule org-wide
  await leave.updateLeaveSettings(org.id, {
    sandwichRuleEnabled: false,
    weekendPolicy: 'SATURDAY_SUNDAY',
  });

  // Now even EL excludes holidays and weekends
  const breakdown = await leave.calculateLeaveBreakdown(org.id, elType, '2026-08-14', '2026-08-17');
  assert.equal(breakdown.includeHolidays, false);
  // Fri is working (1), Sat is weekend, Sun is weekend, Mon is working (1) -> 2 days
  assert.equal(breakdown.days, 2);
});
