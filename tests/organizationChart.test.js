'use strict';
process.env.DB_DIALECT = 'sqlite'; process.env.DB_STORAGE = ':memory:'; process.env.JWT_SECRET = 'organization-chart-test-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const m = require('../src/models');
const { signToken } = require('../src/services/authService');
let server, base, n = 0;
const png = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/favicon.png'));
before(async () => { await m.sequelize.sync(); const app = express(); app.use(express.json()); app.use('/api/v1', require('../src/routes')); server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }); base = `http://127.0.0.1:${server.address().port}/api/v1`; });
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await m.sequelize.close(); });
async function fixture() {
  const org = await m.Organization.create({ code: `CH${++n}`, name: 'Chart Bank' });
  const admin = await m.User.create({ organizationId: org.id, name: 'Admin', email: `admin${n}@chart.invalid`, role: 'ORG_ADMIN', passwordHash: 'unused' });
  const units = {};
  for (const code of ['HO', 'A', 'B']) {
    const branch = await m.OrganizationBranch.create({ organizationId: org.id, code, name: code, unitType: code === 'HO' ? 'HEAD_OFFICE' : 'BRANCH' });
    const department = await m.OrganizationDepartment.create({ organizationId: org.id, branchId: branch.id, code: 'OPS', name: `${code} Operations` });
    const position = await m.OrganizationPosition.create({ organizationId: org.id, branchId: branch.id, departmentId: department.id, code: 'CLERK', name: `${code} Officer`, capacity: 4, leadershipVisible: code === 'HO' });
    units[code] = { branch, department, position };
  }
  const post = await m.PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Legacy Clerk' });
  const people = {};
  for (const [name, unit] of [['Self', 'A'], ['Colleague', 'A'], ['Other', 'B'], ['Leader', 'HO'], ['PrivateHO', 'HO'], ['Unassigned', null]]) {
    const employee = await m.Employee.create({ organizationId: org.id, empCode: name, name, postCadreId: post.id, doj: '2020-01-01', branchName: 'Misleading legacy branch', department: 'Legacy department', designation: 'Legacy role', currentBasicPay: 12345, panNumber: 'AAAAA1234A', email: 'private@chart.invalid', mobile: '1234567890' });
    const user = await m.User.create({ organizationId: org.id, employeeId: employee.id, name, email: `${name}${n}@chart.invalid`, role: 'EMPLOYEE', passwordHash: 'unused' });
    let assignment;
    if (unit) {
      let position = units[unit].position;
      if (name === 'PrivateHO') position = await m.OrganizationPosition.create({ organizationId: org.id, branchId: units.HO.branch.id, departmentId: units.HO.department.id, code: 'PRIVATE', name: 'Private Office' });
      assignment = await m.EmployeeOrganizationAssignment.create({ organizationId: org.id, employeeId: employee.id, branchId: units[unit].branch.id, departmentId: units[unit].department.id, positionId: position.id, effectiveFrom: '2026-01-01' });
    }
    people[name] = { employee, user, assignment };
  }
  await units.A.position.update({ reportsToPositionId: units.HO.position.id });
  const board = await m.OrganizationBoardMember.create({ organizationId: org.id, name: 'External Chair', role: 'CHAIRMAN', photoMimeType: 'image/png', photoData: png, photoSizeBytes: png.length, displayOrder: 1 });
  return { org, admin, units, people, board };
}
async function chart(actor, options = {}) { return require('../src/services/organizationChart').organizationChart({ actor, at: '2026-06-01', ...options }); }
async function call(actor, path) { const response = await fetch(base + path, { headers: actor ? { Authorization: `Bearer ${signToken(actor)}` } : {} }); const bytes = Buffer.from(await response.arrayBuffer()); return { status: response.status, headers: response.headers, bytes, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(bytes) : null }; }
const names = data => data.employees.map(e => e.name).sort();

test('organisation chart selects work identity only, current occupants and reporting positions without vacancies', async () => {
  const f = await fixture();
  await m.OrganizationPosition.create({ organizationId: f.org.id, branchId: f.units.A.branch.id, departmentId: f.units.A.department.id, code: 'EMPTY', name: 'Vacant confidential role', capacity: 20 });
  const foreign = await fixture();
  const result = await chart(f.admin);
  assert.deepEqual(names(result), ['Colleague', 'Leader', 'Other', 'PrivateHO', 'Self']);
  assert.equal(result.employees.find(e => e.name === 'Self').position.reportsToPositionId, f.units.HO.position.id);
  assert.equal(result.employees.filter(e => e.position.id === f.units.A.position.id).length, 2);
  assert.equal(result.leadership[0].name, 'External Chair');
  assert.equal(result.leadership[0].photoRef, `/api/v1/org/structure/board/${f.board.id}/photo`);
  for (const employee of result.employees) {
    assert.deepEqual(Object.keys(employee).sort(), ['branch', 'department', 'empCode', 'id', 'name', 'photoRef', 'position']);
    assert.deepEqual(Object.keys(employee.position).sort(), ['code', 'id', 'name', 'reportsToPositionId']);
    assert.deepEqual(Object.keys(employee.branch).sort(), ['code', 'id', 'name', 'unitType']);
    assert.deepEqual(Object.keys(employee.department).sort(), ['code', 'id', 'name']);
  }
  assert.deepEqual(Object.keys(result.leadership[0]).sort(), ['displayOrder', 'id', 'name', 'photoRef', 'role', 'roleOther']);
  assert.equal(JSON.stringify(result).includes('Vacant confidential role'), false);
  assert.equal(JSON.stringify(result).includes('12345'), false);
  assert.equal(result.employees.some(e => e.id === foreign.people.Self.employee.id), false);
});

test('employee chart shows own current branch and flagged Head Office leadership; unassigned employees get safe context', async () => {
  const f = await fixture();
  const result = await chart(f.people.Self.user, { view: 'employee' });
  assert.deepEqual(names(result), ['Colleague', 'Leader', 'Self']);
  assert.equal(result.context.assigned, true); assert.equal(result.context.branch.id, f.units.A.branch.id);
  const unassigned = await chart(f.people.Unassigned.user, { view: 'employee' });
  assert.deepEqual(names(unassigned), ['Leader']);
  assert.deepEqual(unassigned.context, { assigned: false, branch: null, department: null, position: null });
  assert.equal(unassigned.leadership.length, 1);
});

async function scopedActor(f, type, unit) {
  await f.org.update({ accessControlMode: 'PERMISSIONS' });
  const user = f.people.Self.user;
  const role = await m.OrganizationRole.create({ organizationId: f.org.id, code: `SCOPED${++n}`, name: 'Scoped chart', templateCode: type === 'DEPARTMENT' ? 'DEPARTMENT_HEAD' : 'BRANCH_MANAGER', isProtected: false });
  await m.OrganizationRolePermission.create({ organizationId: f.org.id, roleId: role.id, permissionCode: 'chart.view' });
  const assignment = await m.UserRoleAssignment.create({ organizationId: f.org.id, userId: user.id, roleId: role.id, scopeType: type, effectiveFrom: '2026-01-01' });
  const Model = type === 'DEPARTMENT' ? m.UserRoleDepartment : m.UserRoleBranch;
  await Model.create({ organizationId: f.org.id, userRoleAssignmentId: assignment.id, [type === 'DEPARTMENT' ? 'departmentId' : 'branchId']: unit.id });
  return user;
}

test('branch and department grants constrain assignment queries and include only flagged leadership outside scope', async () => {
  for (const type of ['SELECTED_BRANCHES', 'DEPARTMENT']) {
    const f = await fixture();
    const actor = await scopedActor(f, type, type === 'DEPARTMENT' ? f.units.B.department : f.units.B.branch);
    const seen = [];
    m.EmployeeOrganizationAssignment.addHook('afterFind', 'captureChartAssignments', rows => { if (Array.isArray(rows)) seen.push(...rows.map(row => row.employeeId)); });
    let result;
    try { result = await chart(actor); } finally { m.EmployeeOrganizationAssignment.removeHook('afterFind', 'captureChartAssignments'); }
    assert.deepEqual(names(result), ['Leader', 'Other', 'Self']);
    assert.equal(seen.includes(f.people.Colleague.employee.id), false);
    assert.equal(seen.includes(f.people.PrivateHO.employee.id), false);
  }
});

test('progressive chart filters branch and department in the scoped query and reveals employees only at employee level', async () => {
  const f = await fixture();
  const employees = await chart(f.admin, { branchId: f.units.B.branch.id, departmentId: f.units.B.department.id, level: 'employee' });
  assert.deepEqual(names(employees), ['Other']);
  assert.deepEqual(employees.scope, { branchId: f.units.B.branch.id, departmentId: f.units.B.department.id, level: 'employee' });
  assert.doesNotMatch(JSON.stringify(employees), /currentBasicPay|panNumber|aadhaarNumber|bankAccount|mobile|email/i);

  const positions = await chart(f.admin, { branchId: f.units.B.branch.id, departmentId: f.units.B.department.id, level: 'position' });
  assert.deepEqual(positions.employees, []);
  assert.deepEqual(positions.positions.map(row => row.id), [f.units.B.position.id]);
  assert.deepEqual(positions.departments.map(row => row.id), [f.units.B.department.id]);
  assert.deepEqual(positions.branches.map(row => row.id), [f.units.B.branch.id]);
});

test('effective dates move employee view on transfer day and exclude future, closed, inactive occupants', async () => {
  const f = await fixture();
  await f.people.Self.assignment.update({ effectiveTo: '2026-06-14' });
  await m.EmployeeOrganizationAssignment.create({ organizationId: f.org.id, employeeId: f.people.Self.employee.id, branchId: f.units.B.branch.id, departmentId: f.units.B.department.id, positionId: f.units.B.position.id, effectiveFrom: '2026-06-15' });
  assert.deepEqual(names(await chart(f.people.Self.user, { view: 'employee', at: '2026-06-14' })), ['Colleague', 'Leader', 'Self']);
  assert.deepEqual(names(await chart(f.people.Self.user, { view: 'employee', at: '2026-06-15' })), ['Leader', 'Other', 'Self']);
  await f.people.Other.employee.update({ status: 'INACTIVE' });
  await f.people.Leader.assignment.update({ status: 'INACTIVE' });
  assert.deepEqual(names(await chart(f.people.Self.user, { view: 'employee', at: '2026-06-15' })), ['Self']);
  await assert.rejects(chart(f.admin, { at: '2026-02-30' }), { status: 400 });
  await assert.rejects(chart(f.admin, { view: 'everyone' }), { status: 400 });
});

test('chart API authorizes tenant users and denies platform or anonymous access', async () => {
  const f = await fixture();
  assert.equal((await call(f.admin, '/org/structure/chart?at=2026-06-01')).status, 200);
  const own = await call(f.people.Self.user, '/me/chart?at=2026-06-01');
  assert.equal(own.status, 200); assert.deepEqual(names(own.body.data), ['Colleague', 'Leader', 'Self']);
  assert.equal((await call(null, '/org/structure/chart')).status, 401);
  const platform = await m.User.create({ name: 'Platform', email: `platform${n}@chart.invalid`, role: 'SUPER_ADMIN', passwordHash: 'unused' });
  await assert.rejects(chart(platform), { status: 403 });
  assert.equal((await call(f.admin, '/org/structure/chart?branchId=foreign')).status, 400);
  assert.equal((await call(f.admin, '/org/structure/chart?level=unknown')).status, 400);
});

test('employee and board photo endpoints enforce chart visibility, tenant ownership, current photo binding and private bytes', async () => {
  const f = await fixture(), foreign = await fixture();
  const doc = await m.EmployeeDocument.create({ employeeId: f.people.Colleague.employee.id, docType: 'PHOTO', mimeType: 'image/png', data: png, sizeBytes: png.length, sha256: 'a'.repeat(64) });
  await f.people.Colleague.employee.update({ photoAssetId: doc.id });
  const self = f.people.Self.user;
  const url = `/employees/${f.people.Colleague.employee.id}/photo?at=2026-06-01`;
  const result = await call(self, url);
  assert.equal(result.status, 200); assert.deepEqual(result.bytes, png); assert.match(result.headers.get('cache-control'), /private|no-store/);
  assert.equal((await chart(self, { view: 'employee' })).employees.find(e => e.name === 'Colleague').photoRef, `/api/v1/employees/${f.people.Colleague.employee.id}/photo?at=2026-06-01&view=employee`);
  assert.equal((await call(null, url)).status, 401);
  assert.equal((await call(foreign.people.Self.user, url)).status, 404);
  assert.equal((await call(f.people.Other.user, url)).status, 404);
  assert.equal((await call(self, '/employees/999999/photo')).status, 404);
  assert.equal((await call(self, '/employees/..%2F1/photo')).status, 404);
  const boardUrl = `/org/structure/board/${f.board.id}/photo`;
  assert.equal((await call(self, boardUrl)).status, 200);
  assert.equal((await call(foreign.admin, boardUrl)).status, 404);
  assert.equal((await call(null, boardUrl)).status, 401);
  assert.equal((await call(null, `/public/org/${f.org.code}/board/${f.board.id}/photo`)).status, 404);
  await f.people.Colleague.employee.update({ photoAssetId: (await m.EmployeeDocument.create({ employeeId: foreign.people.Self.employee.id, docType: 'PHOTO', mimeType: 'image/png', data: png, sizeBytes: png.length, sha256: 'b'.repeat(64) })).id });
  assert.equal((await call(self, url)).status, 404);
  await f.people.Colleague.employee.update({ photoAssetId: doc.id }); await doc.update({ docType: 'PAN' });
  assert.equal((await call(self, url)).status, 404);
  await doc.update({ docType: 'PHOTO', data: Buffer.from('%PDF-private document'), mimeType: 'image/png' });
  assert.equal((await call(self, url)).status, 404);
  await doc.update({ data: png, mimeType: 'application/pdf' });
  const sniffed = await call(self, url);
  assert.equal(sniffed.status, 200); assert.equal(sniffed.headers.get('content-type'), 'image/png');
  await f.board.update({ photoData: Buffer.from('<svg>private</svg>'), photoMimeType: 'image/png' });
  assert.equal((await call(self, boardUrl)).status, 404);
});

test('legacy board-photo asset URL is unavailable on the real server while public branding remains accessible', async () => {
  const f = await fixture();
  const app = require('../src/server');
  const actual = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const root = `http://127.0.0.1:${actual.address().port}`;
    const response = await fetch(`${root}/assets/org/${f.org.code}/board/${f.board.id}/photo`);
    assert.equal(response.status, 404);
    assert.equal((await fetch(`${root}/api/v1/public/org/${f.org.code}`)).status, 200);
  } finally { await new Promise(resolve => actual.close(resolve)); }
});

test('inactive branches, departments and positions cannot supply current chart occupants', async () => {
  const f = await fixture();
  await f.units.A.department.update({ status: 'INACTIVE' });
  await f.units.B.branch.update({ status: 'INACTIVE' });
  await f.units.HO.position.update({ status: 'INACTIVE' });
  assert.deepEqual(names(await chart(f.admin)), ['PrivateHO']);
  const self = await chart(f.people.Self.user, { view: 'employee' });
  assert.deepEqual(self.context, { assigned: false, branch: null, department: null, position: null });
  assert.deepEqual(names(self), []);
});

test('a requested historical chart date does not revive expired operational access', async () => {
  const f = await fixture();
  const actor = await scopedActor(f, 'SELECTED_BRANCHES', f.units.B.branch);
  await m.UserRoleAssignment.update({ effectiveTo: '2026-06-02' }, { where: { organizationId: f.org.id, userId: actor.id } });
  assert.deepEqual(names(await chart(actor, { at: '2026-06-01' })), ['Colleague', 'Leader', 'Self']);
});

test('scoped staff can fetch photos returned by their separate employee chart after a historical transfer', async () => {
  const f = await fixture();
  const actor = await scopedActor(f, 'SELECTED_BRANCHES', f.units.B.branch);
  const colleague = f.people.Colleague.employee;
  const doc = await m.EmployeeDocument.create({ employeeId: colleague.id, docType: 'PHOTO', mimeType: 'image/png', data: png, sizeBytes: png.length, sha256: 'c'.repeat(64) });
  await colleague.update({ photoAssetId: doc.id });
  await f.people.Colleague.assignment.update({ effectiveTo: '2026-06-14' });
  const employeeView = await chart(actor, { view: 'employee', at: '2026-06-01' });
  const photo = employeeView.employees.find(e => e.id === colleague.id).photoRef;
  const response = await call(actor, photo.replace('/api/v1', ''));
  assert.equal(response.status, 200);
  assert.deepEqual(response.bytes, png);
});
