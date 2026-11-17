'use strict';
process.env.DB_DIALECT = 'sqlite'; process.env.DB_STORAGE = ':memory:'; process.env.JWT_SECRET = 'permission-feature-test-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const m = require('../src/models');
const { signToken } = require('../src/services/authService');
let server, base, n = 0;
before(async () => { await m.sequelize.sync(); const app = express(); app.use(express.json()); app.use('/api/v1', require('../src/routes')); server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }); base = `http://127.0.0.1:${server.address().port}/api/v1`; });
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await m.sequelize.close(); });
async function fixture(mode = 'PERMISSIONS', legacyRole = 'EMPLOYEE', template = 'HR_OFFICER', codes = ['people.view', 'attendance.view', 'documents.view']) {
  const org = await m.Organization.create({ code: `PR${++n}`, name: 'Permission Bank', accessControlMode: mode });
  const post = await m.PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });
  const a = await m.OrganizationBranch.create({ organizationId: org.id, code: 'A', name: 'A' });
  const b = await m.OrganizationBranch.create({ organizationId: org.id, code: 'B', name: 'B' });
  const people = [];
  for (const [i, unit] of [a, a, b].entries()) {
    const employee = await m.Employee.create({ organizationId: org.id, empCode: `E${i}`, name: `Employee ${i}`, doj: '2020-01-01', postCadreId: post.id, branchId: a.id });
    await m.EmployeeOrganizationAssignment.create({ organizationId: org.id, employeeId: employee.id, branchId: unit.id, effectiveFrom: '2026-01-01' });
    people.push(employee);
  }
  const actor = await m.User.create({ organizationId: org.id, employeeId: people[0].id, name: 'Actor', email: `actor${n}@routes.invalid`, passwordHash: 'unused', role: legacyRole });
  if (codes.length) {
    const role = await m.OrganizationRole.create({ organizationId: org.id, code: 'CUSTOM', name: 'Custom', templateCode: template });
    for (const permissionCode of codes) await m.OrganizationRolePermission.create({ organizationId: org.id, roleId: role.id, permissionCode });
    const scopeType = template === 'HR_OFFICER' ? 'SELECTED_BRANCHES' : 'ORGANISATION';
    const assignment = await m.UserRoleAssignment.create({ organizationId: org.id, userId: actor.id, roleId: role.id, scopeType, effectiveFrom: '2026-01-01' });
    if (scopeType === 'SELECTED_BRANCHES') await m.UserRoleBranch.create({ organizationId: org.id, userRoleAssignmentId: assignment.id, branchId: a.id });
  }
  return { org, post, a, b, people, actor };
}
async function call(actor, path, method = 'GET', body) { const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${signToken(actor)}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: response.status, body: await response.json() }; }
test('custom HR employee lists use authoritative current assignments in SQL and deny foreign/other-branch items', async () => {
  const f = await fixture(), foreign = await fixture();
  const loaded = [];
  m.Employee.addHook('afterFind', 'captureScopedEmployees', rows => { if (Array.isArray(rows)) loaded.push(...rows.map(row => row.id)); });
  let result;
  try { result = await call(f.actor, '/employees'); } finally { m.Employee.removeHook('afterFind', 'captureScopedEmployees'); }
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(result.body.data.map(row => row.id), f.people.slice(0, 2).map(row => row.id));
  assert.equal(loaded.includes(f.people[2].id), false);
  assert.equal((await call(f.actor, `/employees/${f.people[2].id}`)).status, 403);
  assert.equal((await call(f.actor, `/employees/${foreign.people[0].id}`)).status, 404);
  assert.equal((await call(f.actor, '/employees/999999')).status, 404);
});
test('permission mode rejects legacy financial/HR powers absent from custom assignments', async () => {
  const f = await fixture('PERMISSIONS', 'HR_ADMIN');
  assert.equal((await call(f.actor, '/org/compensation', 'POST', {})).status, 403);
  assert.equal((await call(f.actor, '/pay-scales', 'POST', {})).status, 403);
  assert.equal((await call(f.actor, `/employees/${f.people[1].id}`, 'PUT', { name: 'Changed' })).status, 403);
});
test('legacy HR keeps tenant-wide employee visibility and compensation proposal parity', async () => {
  const f = await fixture('LEGACY', 'HR_OFFICER');
  assert.deepEqual((await call(f.actor, '/employees')).body.data.map(row => row.id), f.people.map(row => row.id));
  assert.notEqual((await call(f.actor, '/org/compensation', 'POST', {})).status, 403);
});
test('operational users retain own self-service baseline and cannot read colleagues service book documents', async () => {
  const f = await fixture('PERMISSIONS', 'PAYROLL_OFFICER', 'PAYROLL_OFFICER', ['payroll.view']);
  assert.equal((await call(f.actor, '/me/context')).status, 200);
  assert.equal((await call(f.actor, '/me/payslips')).status, 200);
  assert.equal((await call(f.actor, `/employees/${f.people[0].id}/service-book`)).status, 200);
  assert.equal((await call(f.actor, `/employees/${f.people[1].id}/service-book`)).status, 403);
});
test('legacy linked operational roles retain employee-scoped self service while unlinked and platform users fail closed', async () => {
  assert.deepEqual(m.User.EMPLOYEE_SELF_SERVICE_ROLES, m.User.ROLES.filter(value => value !== 'SUPER_ADMIN'));
  for (const role of m.User.ROLES.filter(value => value !== 'SUPER_ADMIN')) {
    const f = await fixture('LEGACY', role, 'EMPLOYEE', []);
    const context = await call(f.actor, `/me/context?employeeId=${f.people[1].id}`);
    assert.equal(context.status, 200, `${role}: ${JSON.stringify(context.body)}`);
    assert.equal(context.body.data.employee.id, f.people[0].id, role);
    assert.equal((await call(f.actor, '/me/payslips')).status, 200, role);
    assert.equal((await call(f.actor, '/me/chart')).status, 200, role);
  }
  const f = await fixture('LEGACY', 'EMPLOYEE', 'EMPLOYEE', []);
  const unlinked = await m.User.create({ organizationId: f.org.id, name: 'Unlinked operator', email: `unlinked${++n}@routes.invalid`, role: 'HR_OFFICER', passwordHash: 'unused' });
  assert.equal((await call(unlinked, '/me/payslips')).status, 409);
  assert.equal((await call(unlinked, '/me/chart')).status, 409);
  const platform = await m.User.create({ name: 'Platform', email: `platform${++n}@routes.invalid`, role: 'SUPER_ADMIN', passwordHash: 'unused' });
  assert.equal((await call(platform, '/me/context')).status, 403);
});
test('auth me exposes only effective permission codes and safe scope summary', async () => {
  const f = await fixture();
  const result = await call(f.actor, '/auth/me');
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.ok(result.body.data.permissionCodes.includes('people.view'));
  assert.ok(result.body.data.permissionCodes.includes('self.payslips'));
  assert.deepEqual(Object.keys(result.body.data.scopeSummary).sort(), ['branchIds', 'departmentIds', 'organization', 'own']);
  assert.equal(result.body.data.grants, undefined);
});
test('permission-mode onboarding atomically creates the scoped authoritative assignment and rolls back invalid destinations', async () => {
  const f = await fixture('PERMISSIONS', 'EMPLOYEE', 'HR_OFFICER', ['people.create', 'people.view', 'people.edit']);
  await f.org.update({ mandatoryEmployeeFields: Object.fromEntries(require('../src/services/orgFields').MANDATORY_FIELD_DEFS.map(field => [field.key, false])) });
  const deptA = await m.OrganizationDepartment.create({ organizationId: f.org.id, branchId: f.a.id, code: 'OPS', name: 'Operations A' });
  const deptB = await m.OrganizationDepartment.create({ organizationId: f.org.id, branchId: f.b.id, code: 'OPS', name: 'Operations B' });
  const positionA = await m.OrganizationPosition.create({ organizationId: f.org.id, branchId: f.a.id, departmentId: deptA.id, code: 'CLERK', name: 'Clerk A', postCadreId: f.post.id });
  const positionB = await m.OrganizationPosition.create({ organizationId: f.org.id, branchId: f.b.id, departmentId: deptB.id, code: 'CLERK', name: 'Clerk B', postCadreId: f.post.id });
  const payload = { empCode: 'New', name: 'New employee', doj: '2026-11-16', organizationAssignment: { branchId: f.a.id, departmentId: deptA.id, positionId: positionA.id, effectiveFrom: '2026-11-16' } };
  const created = await call(f.actor, '/employees', 'POST', payload);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const employee = await m.Employee.findByPk(created.body.data.id);
  assert.equal(employee.branchId, f.a.id);
  assert.equal(employee.postCadreId, f.post.id);
  assert.equal(employee.designation, positionA.name);
  assert.equal(await m.EmployeeOrganizationAssignment.count({ where: { employeeId: employee.id, branchId: f.a.id } }), 1);
  const denied = await call(f.actor, '/employees', 'POST', { ...payload, empCode: 'Forbidden', organizationAssignment: { branchId: f.b.id, departmentId: deptB.id, positionId: positionB.id, effectiveFrom: '2026-11-16' } });
  assert.equal(denied.status, 403);
  assert.equal(await m.Employee.count({ where: { organizationId: f.org.id, empCode: 'Forbidden' } }), 0);
  assert.equal((await call(f.actor, '/employees', 'POST', { ...payload, empCode: 'NoBranch', organizationAssignment: undefined })).status, 400);
  assert.equal((await call(f.actor, `/employees/${f.people[1].id}`, 'PUT', { currentBasicPay: 50000 })).status, 403);
  assert.equal((await call(f.actor, '/employees', 'POST', { ...payload, empCode: 'Salary', currentBasicPay: 50000 })).status, 403);
});
test('people.create can read only safe branch options within its effective scope without branches.view', async () => {
  const officer = await fixture('PERMISSIONS', 'EMPLOYEE', 'HR_OFFICER', ['people.create']);
  const scoped = await call(officer.actor, '/org/structure/branch-options');
  assert.equal(scoped.status, 200, JSON.stringify(scoped.body));
  assert.deepEqual(scoped.body.data, [{ id: officer.a.id, name: 'A', status: 'ACTIVE' }]);
  assert.equal((await call(officer.actor, '/org/structure/branches')).status, 403);
  assert.equal((await call(officer.actor, '/org/structure/branches', 'POST', { code: 'NEW', name: 'New branch' })).status, 403);
  const officerDeptA = await m.OrganizationDepartment.create({ organizationId: officer.org.id, branchId: officer.a.id, code: 'OPS', name: 'Operations A' });
  const officerDeptB = await m.OrganizationDepartment.create({ organizationId: officer.org.id, branchId: officer.b.id, code: 'OPS', name: 'Operations B' });
  const officerPositionA = await m.OrganizationPosition.create({ organizationId: officer.org.id, branchId: officer.a.id, departmentId: officerDeptA.id, code: 'CLERK', name: 'Clerk A', postCadreId: officer.post.id });
  await m.OrganizationPosition.create({ organizationId: officer.org.id, branchId: officer.a.id, departmentId: officerDeptA.id, code: 'NOPOST', name: 'No post', postCadreId: null });
  await m.OrganizationPosition.create({ organizationId: officer.org.id, branchId: officer.a.id, departmentId: officerDeptA.id, code: 'INACTIVE', name: 'Inactive', postCadreId: officer.post.id, status: 'INACTIVE' });
  await m.OrganizationPosition.create({ organizationId: officer.org.id, branchId: officer.b.id, departmentId: officerDeptB.id, code: 'CLERK', name: 'Clerk B', postCadreId: officer.post.id });
  const officerPositions = await call(officer.actor, `/org/structure/position-options?branchId=${officer.a.id}`);
  assert.equal(officerPositions.status, 200, JSON.stringify(officerPositions.body));
  assert.deepEqual(officerPositions.body.data, [{ id: officerPositionA.id, branchId: officer.a.id, departmentId: officerDeptA.id, postCadreId: officer.post.id, name: 'Clerk A', status: 'ACTIVE' }]);
  assert.deepEqual((await call(officer.actor, `/org/structure/position-options?branchId=${officer.b.id}`)).body.data, []);

  const hrAdmin = await fixture('PERMISSIONS', 'EMPLOYEE', 'HR_ADMIN', ['people.create']);
  const organisationWide = await call(hrAdmin.actor, '/org/structure/branch-options');
  assert.equal(organisationWide.status, 200, JSON.stringify(organisationWide.body));
  assert.deepEqual(organisationWide.body.data, [
    { id: hrAdmin.a.id, name: 'A', status: 'ACTIVE' },
    { id: hrAdmin.b.id, name: 'B', status: 'ACTIVE' },
  ]);
  const adminDeptA = await m.OrganizationDepartment.create({ organizationId: hrAdmin.org.id, branchId: hrAdmin.a.id, code: 'OPS', name: 'Operations A' });
  const adminDeptB = await m.OrganizationDepartment.create({ organizationId: hrAdmin.org.id, branchId: hrAdmin.b.id, code: 'OPS', name: 'Operations B' });
  const adminPositionA = await m.OrganizationPosition.create({ organizationId: hrAdmin.org.id, branchId: hrAdmin.a.id, departmentId: adminDeptA.id, code: 'CLERK', name: 'Clerk A', postCadreId: hrAdmin.post.id });
  const adminPositionB = await m.OrganizationPosition.create({ organizationId: hrAdmin.org.id, branchId: hrAdmin.b.id, departmentId: adminDeptB.id, code: 'CLERK', name: 'Clerk B', postCadreId: hrAdmin.post.id });
  const adminPositions = await call(hrAdmin.actor, '/org/structure/position-options');
  assert.equal(adminPositions.status, 200, JSON.stringify(adminPositions.body));
  assert.deepEqual(adminPositions.body.data.map(row => row.id), [adminPositionA.id, adminPositionB.id]);
});
test('ambiguous current employee placements fail closed and attendance lists exclude other branches at query time', async () => {
  const f = await fixture();
  await m.EmployeeOrganizationAssignment.create({ organizationId: f.org.id, employeeId: f.people[1].id, branchId: f.b.id, effectiveFrom: '2026-01-01' });
  assert.deepEqual((await call(f.actor, '/employees')).body.data.map(row => row.id), [f.people[0].id]);
  for (const employee of f.people) await m.EmployeeTimeEntry.create({ organizationId: f.org.id, employeeId: employee.id, localDate: '2026-11-16', checkInAt: new Date('2026-11-16T04:00:00Z') });
  const loaded = [];
  m.EmployeeTimeEntry.addHook('afterFind', 'timeScope', rows => { if (Array.isArray(rows)) loaded.push(...rows.map(row => row.employeeId)); });
  let result;
  try { result = await call(f.actor, '/org/time?year=2026&month=11'); } finally { m.EmployeeTimeEntry.removeHook('afterFind', 'timeScope'); }
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data.map(row => row.employeeId), [f.people[0].id]);
  assert.deepEqual(loaded, [f.people[0].id]);
});
test('permission-mode legacy bulk importer fails before creating any unassigned employees', async () => {
  const f = await fixture('PERMISSIONS', 'HR_OFFICER', 'HR_OFFICER', ['people.create']);
  const before = await m.Employee.count({ where: { organizationId: f.org.id } });
  const result = await call(f.actor, '/employees/bulk-import', 'POST', { csv: 'empCode,name,doj,postCode\nNEW,New,2026-11-16,CLERK' });
  assert.equal(result.status, 409);
  assert.match(result.body.message, /organizationAssignment/);
  assert.equal(await m.Employee.count({ where: { organizationId: f.org.id } }), before);
});
test('branch-scoped HR cannot publish organisation-wide policies, holidays or leave types', async () => {
  const f = await fixture('PERMISSIONS', 'EMPLOYEE', 'HR_OFFICER', ['hr.manage', 'leave.manage']);
  assert.equal((await call(f.actor, '/org/employee-policy', 'POST', { title: 'Policy', body: 'Global policy' })).status, 403);
  assert.equal((await call(f.actor, '/org/holidays', 'POST', { date: '2026-12-25', name: 'Holiday' })).status, 403);
  assert.equal((await call(f.actor, '/leave-types', 'POST', { code: 'CL', name: 'Leave', accrualMethod: 'NONE' })).status, 403);
});
test('legacy read parity remains exact across every existing staff role before activation', async () => {
  const f = await fixture('LEGACY', 'EMPLOYEE', 'EMPLOYEE', []);
  const staff = ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'DEPARTMENT_HEAD', 'EMPLOYEE'];
  const viewers = staff.filter(role => !['DEPARTMENT_HEAD', 'EMPLOYEE'].includes(role));
  const matrix = [
    ['/employees', staff.filter(role => role !== 'EMPLOYEE')],
    ['/org/time', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER']],
    ['/org/employee-policy', ['ORG_ADMIN']],
    ['/org/holidays', ['ORG_ADMIN', 'HR_ADMIN']],
    ['/org/compensation', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY']],
    ['/org/financial-changes', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY']],
    ['/allowance-types', viewers], ['/leave-types', viewers],
    [`/organizations/${f.org.id}/payroll-runs`, viewers],
    ['/org/settings', ['ORG_ADMIN']], ['/me/context', staff],
  ];
  for (const role of staff) {
    await f.actor.update({ role });
    for (const [path, allowed] of matrix) {
      const result = await call(f.actor, path);
      assert.equal(result.status, allowed.includes(role) ? 200 : 403, `${role} ${path}: ${JSON.stringify(result.body)}`);
    }
  }
});
test('Accounts sees approved payment totals and masked lines without payroll preparation or salary breakdowns', async () => {
  const f = await fixture('PERMISSIONS', 'EMPLOYEE', 'ACCOUNTS_OFFICER', ['payments.view', 'payments.export', 'payments.pay']);
  const pending = await m.PayrollRun.create({ organizationId: f.org.id, year: 2026, month: 1, status: 'PROCESSED' });
  const approved = await m.PayrollRun.create({ organizationId: f.org.id, year: 2026, month: 2, status: 'APPROVED', totalNetPay: 100, notes: 'Private note' });
  await m.PayrollRunLine.create({ payrollRunId: approved.id, employeeId: f.people[1].id, empCode: 'E1', employeeName: 'Employee 1', bankAccountNumber: '123456789', bankIfsc: 'BANK0000001', hasBankDetails: true, netPay: 100, payslipJson: '{"privateSalary":"secret"}' });
  const path = `/organizations/${f.org.id}/payroll-runs`;
  const list = await call(f.actor, path);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data.map(row => row.id), [approved.id]);
  assert.equal(list.body.data[0].totalGrossEarnings, undefined); assert.equal(list.body.data[0].notes, undefined);
  const lines = await call(f.actor, `${path}/${approved.id}/lines`);
  assert.equal(lines.status, 200); assert.equal(lines.body.data[0].bankAccountNumber, '****6789');
  assert.equal(lines.body.data[0].grossEarnings, undefined); assert.equal(lines.body.data[0].payslipJson, undefined);
  assert.equal((await call(f.actor, `${path}/${pending.id}`)).status, 404);
  assert.equal((await call(f.actor, path, 'POST', {})).status, 403);
  assert.equal((await call(f.actor, `${path}/${approved.id}/lines/${f.people[1].id}`)).status, 403);
});
test('Accounts reimbursement view exposes approved payment amounts and excludes pending claims/private purpose', async () => {
  const f = await fixture('PERMISSIONS', 'EMPLOYEE', 'ACCOUNTS_OFFICER', ['payments.view']);
  for (const status of ['SUBMITTED', 'APPROVED']) await m.ExpenseClaim.create({ organizationId: f.org.id, employeeId: f.people[1].id, expenseDate: '2026-11-16', category: 'Medical', purpose: 'Private diagnosis', amount: 100, status, submittedBy: f.actor.id });
  const result = await call(f.actor, '/org/expenses');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data.map(row => row.status), ['APPROVED']);
  assert.equal(result.body.data[0].purpose, undefined); assert.equal(result.body.data[0].category, undefined);
});
test('HR can onboard direct-pay staff using personal mandatory fields; payroll rejects unapproved compensation without persisting zero-pay lines', async () => {
  const f = await fixture('PERMISSIONS', 'EMPLOYEE', 'HR_OFFICER', ['people.create']);
  const department = await m.OrganizationDepartment.create({ organizationId: f.org.id, branchId: f.a.id, code: 'OPS', name: 'Operations' });
  const position = await m.OrganizationPosition.create({ organizationId: f.org.id, branchId: f.a.id, departmentId: department.id, code: 'CLERK', name: 'Clerk', postCadreId: f.post.id });
  const created = await call(f.actor, '/employees', 'POST', { empCode: 'DirectNew', name: 'New direct-pay staff', doj: '2026-11-16', dob: '1990-01-01', directPay: true, panNumber: 'AAAAA1234A', aadhaarNumber: '123412341234', personalEmail: 'new@staff.invalid', gender: 'FEMALE', organizationAssignment: { branchId: f.a.id, departmentId: department.id, positionId: position.id, effectiveFrom: '2026-11-16' } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.data.currentBasicPay, null);
  const role = await m.OrganizationRole.create({ organizationId: f.org.id, code: 'PAY', name: 'Payroll preparer', templateCode: 'PAYROLL_OFFICER' });
  await m.OrganizationRolePermission.create({ organizationId: f.org.id, roleId: role.id, permissionCode: 'payroll.prepare' });
  await m.UserRoleAssignment.create({ organizationId: f.org.id, userId: f.actor.id, roleId: role.id, scopeType: 'ORGANISATION', effectiveFrom: '2026-01-01' });
  const result = await call(f.actor, `/organizations/${f.org.id}/payroll-runs`, 'POST', { year: 2026, month: 11 });
  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.match(result.body.message, /approved salary assignment/i);
  assert.equal(await m.PayrollRun.count({ where: { organizationId: f.org.id } }), 0);
  assert.equal(await m.PayrollRunLine.count({ where: { employeeId: created.body.data.id } }), 0);
});
test('approved direct-pay compensation works after finance bank setup and fails atomically while payment details are missing', async () => {
  const f = await fixture('PERMISSIONS', 'EMPLOYEE', 'PAYROLL_OFFICER', ['payroll.prepare', 'compensation.prepare']);
  for (const employee of f.people) {
    await employee.update({ directPay: true });
    await m.EmployeeCompensationAssignment.create({ organizationId: f.org.id, employeeId: employee.id, amount: 1000, previousAmount: 0, effectiveDate: '2026-11-01', reason: 'Approved pay', status: 'APPROVED', preparedBy: f.actor.id });
  }
  const path = `/organizations/${f.org.id}/payroll-runs`;
  const missing = await call(f.actor, path, 'POST', { year: 2026, month: 11 });
  assert.equal(missing.status, 409, JSON.stringify(missing.body));
  assert.match(missing.body.message, /bank/i);
  assert.equal(await m.PayrollRun.count({ where: { organizationId: f.org.id } }), 0);
  for (const employee of f.people) {
    const account = await call(f.actor, `/employees/${employee.id}/bank-accounts`, 'POST', { accountType: 'SB', accountNumber: `${employee.id}123456789`, bankName: 'Bank', ifsc: 'BANK0000001' });
    assert.equal(account.status, 201, JSON.stringify(account.body));
    assert.equal((await call(f.actor, `/employees/${employee.id}/salary-credit-account`, 'PUT', { accountId: account.body.data.id })).status, 200);
  }
  const ready = await call(f.actor, path, 'POST', { year: 2026, month: 11 });
  assert.equal(ready.status, 201, JSON.stringify(ready.body));
  assert.equal(await m.PayrollRunLine.count({ where: { payrollRunId: ready.body.data.id } }), f.people.length);
});
test('government order metadata, upload, download and delete authenticate before authorization in both modes', async () => {
  const bytes = Buffer.from('%PDF-1.4\nGovernment order test');
  for (const mode of ['LEGACY', 'PERMISSIONS']) {
    const f = await fixture(mode, mode === 'LEGACY' ? 'ORG_ADMIN' : 'EMPLOYEE', 'PAYROLL_OFFICER', ['compensation.view', 'compensation.prepare']);
    const go = await m.GovernmentOrder.create({ organizationId: f.org.id, goNumber: 'GO-1', goDate: '2026-11-16', subject: 'Order' });
    const path = `/government-orders/${go.id}/document`;
    const before = await call(f.actor, path);
    assert.equal(before.status, 200, `${mode}: ${JSON.stringify(before.body)}`); assert.equal(before.body.data, null);
    const uploaded = await call(f.actor, path, 'POST', { label: 'Order scan', dataUrl: `data:application/pdf;base64,${bytes.toString('base64')}` });
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
    assert.equal((await call(f.actor, path)).body.data.label, 'Order scan');
    const downloaded = await fetch(base + path + '/file', { headers: { Authorization: `Bearer ${signToken(f.actor)}` } });
    assert.equal(downloaded.status, 200); assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
    assert.equal((await call(f.actor, path, 'DELETE')).status, 200);
    assert.equal((await call(f.actor, path)).body.data, null);
    assert.equal((await fetch(base + path)).status, 401);
  }
});
test('org role router falls through to independently authorized settings, payroll settings and audit routes', async () => {
  for (const [code, path] of [['settings.view', '/org/settings'], ['settings.view', '/org/profile'], ['compensation.view', '/org/settings/payroll'], ['audit.view', '/org/audit']]) {
    const f = await fixture('PERMISSIONS', 'EMPLOYEE', 'ORGANISATION_ADMIN', [code]);
    const result = await call(f.actor, path);
    assert.equal(result.status, 200, `${code} ${path}: ${JSON.stringify(result.body)}`);
    for (const denied of ['/org/roles', '/org/role-assignments', `/org/access-preview/${f.actor.id}`]) assert.equal((await call(f.actor, denied)).status, 403);
  }
});
test('permission payroll requires an active own authoritative bank account even when legacy bank text is populated', async () => {
  const f = await fixture('PERMISSIONS', 'EMPLOYEE', 'PAYROLL_OFFICER', ['payroll.prepare']);
  for (const employee of f.people) {
    await employee.update({ directPay: true, bankName: 'Legacy bank', bankAccountNumber: '123456789', bankIfsc: 'BANK0000001' });
    await m.EmployeeCompensationAssignment.create({ organizationId: f.org.id, employeeId: employee.id, amount: 1000, previousAmount: 0, effectiveDate: '2026-11-01', reason: 'Approved pay', status: 'APPROVED', preparedBy: f.actor.id });
  }
  const path = `/organizations/${f.org.id}/payroll-runs`;
  async function denied() {
    const result = await call(f.actor, path, 'POST', { year: 2026, month: 11 });
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.equal(await m.PayrollRun.count({ where: { organizationId: f.org.id } }), 0);
    assert.equal(await m.PayrollRunLine.count({ where: { employeeId: f.people.map(employee => employee.id) } }), 0);
  }
  await denied();
  const accounts = [];
  for (const employee of f.people) {
    const account = await m.EmployeeBankAccount.create({ employeeId: employee.id, accountType: 'SB', bankName: 'Bank', accountNumber: `${employee.id}123456789`, ifsc: 'BANK0000001' });
    accounts.push(account); await employee.update({ salaryCreditAccountId: account.id });
  }
  await accounts[0].update({ status: 'INACTIVE' }); await denied();
  await accounts[0].update({ status: 'ACTIVE' });
  await f.people[0].update({ salaryCreditAccountId: accounts[1].id }); await denied();
  await f.people[0].update({ salaryCreditAccountId: accounts[0].id });
  assert.equal((await call(f.actor, path, 'POST', { year: 2026, month: 11 })).status, 201);
});
