'use strict';
process.env.DB_DIALECT = 'sqlite'; process.env.DB_STORAGE = ':memory:'; process.env.JWT_SECRET = 'org-transfer-api-secret';
const { test, before, after } = require('node:test'); const assert = require('node:assert/strict'); const express = require('express');
const m = require('../src/models'); const { signToken } = require('../src/services/authService'); const { todayIST } = require('../src/services/orgAccess');
let server, base, serial = 0;
before(async () => { await m.sequelize.sync(); const app = express(); app.use(express.json()); app.use('/api/v1', require('../src/routes')); server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.on('error', reject); }); base = `http://127.0.0.1:${server.address().port}/api/v1`; });
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await m.sequelize.close(); });
async function fixture() { const n = ++serial, org = await m.Organization.create({ code: `TRAPI${n}`, name: 'Bank' }); const a = i => m.User.create({ organizationId: org.id, name: 'Admin', email: `a${n}-${i}@transfer.invalid`, role: 'ORG_ADMIN', passwordHash: 'unused' }); const admin = await a(1), approver = await a(2); const post = await m.PostCadre.create({ organizationId: org.id, code: 'P', name: 'Post' }); const branch = await m.OrganizationBranch.create({ organizationId: org.id, number: '001', code: 'BR', name: 'Branch', unitType: 'BRANCH' }); const old = await m.OrganizationBranch.create({ organizationId: org.id, number: '000', code: 'HO', name: 'Head Office', unitType: 'HEAD_OFFICE', isHeadOffice: true }); const employee = await m.Employee.create({ organizationId: org.id, postCadreId: post.id, empCode: 'E1', name: 'Employee', doj: '2020-01-01', branchId: old.id }); await m.EmployeeOrganizationAssignment.create({ organizationId: org.id, employeeId: employee.id, branchId: old.id, effectiveFrom: '2020-01-01' }); return { org, admin, approver, branch, employee }; }
async function request(actor, path, method = 'GET', body) { const r = await fetch(`${base}/org/transfers${path}`, { method, headers: { authorization: `Bearer ${signToken(await actor.reload())}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: r.headers.get('content-type')?.includes('application/json') ? await r.json() : await r.text() }; }
test('transfers use service authorization, isolate tenants, retain maker checker and return safe metadata', async () => {
  const f = await fixture(), other = await fixture(), input = { employeeId: f.employee.id, branchId: f.branch.id, effectiveDate: todayIST(), reason: 'Move' };
  assert.equal((await request(f.admin, '', 'POST', { ...input, branchId: other.branch.id })).status, 404);
  assert.equal((await request(f.admin, '', 'POST', { ...input, amount: 999 })).status, 400);
  const staff = await m.User.create({ organizationId: f.org.id, name: 'Staff', email: 'staff@transfer.invalid', role: 'HR_OFFICER', passwordHash: 'unused' });
  assert.equal((await request(staff, '', 'POST', input)).status, 403);
  const result = await request(f.admin, '', 'POST', input); assert.equal(result.status, 201); assert.equal(result.body.data.status, 'PENDING'); assert.equal(Object.hasOwn(result.body.data, 'amount'), false);
  assert.equal((await request(other.admin, `/${result.body.data.id}`)).status, 404);
  assert.equal((await request(f.admin, `/${result.body.data.id}/approve`, 'POST', {})).status, 403);
  const approval = await request(f.approver, `/${result.body.data.id}/approve`, 'POST', { reason: 'Approved' }); assert.equal(approval.status, 200); assert.equal(approval.body.data.status, 'ACTIVATED');
  assert.equal((await f.employee.reload()).branchId, f.branch.id);
});
