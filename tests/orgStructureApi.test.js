'use strict';
process.env.DB_DIALECT = 'sqlite'; process.env.DB_STORAGE = ':memory:'; process.env.JWT_SECRET = 'org-structure-api-secret';
const { test, before, after } = require('node:test'); const assert = require('node:assert/strict'); const express = require('express');
const m = require('../src/models'); const { signToken } = require('../src/services/authService'); const Excel = require('exceljs');
let server, base, serial = 0;
before(async () => { await m.sequelize.sync(); const app = express(); app.use(express.json()); app.use('/api/v1', require('../src/routes')); server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.on('error', reject); }); base = `http://127.0.0.1:${server.address().port}/api/v1`; });
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await m.sequelize.close(); });
async function fixture() { const n = ++serial, org = await m.Organization.create({ code: `API${n}`, name: 'Bank' }), admin = await m.User.create({ organizationId: org.id, name: 'Admin', email: `a${n}@structure.invalid`, role: 'ORG_ADMIN', passwordHash: 'unused' }); return { org, admin }; }
async function request(f, path, method = 'GET', body, type = 'application/json') { const r = await fetch(base + path, { method, headers: { authorization: `Bearer ${signToken(await f.admin.reload())}`, 'content-type': type }, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) }); return { status: r.status, body: r.headers.get('content-type')?.includes('application/json') ? await r.json() : Buffer.from(await r.arrayBuffer()) }; }

test('structure API uses structure services including legacy branch paths, ownership and dependent deactivation', async () => {
  const f = await fixture(), other = await fixture();
  assert.equal((await request(f, '/org/structure/branches', 'POST', { number: '001', code: 'BR', name: 'Branch' })).status, 400);
  const ho = await request(f, '/org/structure/head-office', 'POST', { number: '000', code: 'HO', name: 'Head Office' }); assert.equal(ho.status, 201);
  const branch = await request(f, '/org/profile/branches', 'POST', { number: '001', branchCode: 'BR', name: 'Branch' }); assert.equal(branch.status, 201);
  const department = await request(f, '/org/structure/departments', 'POST', { branchId: branch.body.data.id, code: 'OPS', name: 'Operations' }); assert.equal(department.status, 201);
  const position = await request(f, '/org/structure/positions', 'POST', { branchId: branch.body.data.id, departmentId: department.body.data.id, code: 'CLERK', name: 'Clerk' }); assert.equal(position.status, 201);
  assert.equal((await request(f, `/org/profile/branches/${branch.body.data.id}`, 'DELETE')).status, 400);
  assert.equal((await request(other, `/org/structure/branches/${branch.body.data.id}`, 'PUT', { name: 'Foreign' })).status, 404);
  assert.equal((await request(f, '/org/structure/branches', 'POST', { number: '002', code: 'X', name: 'Bad', organizationId: other.org.id })).status, 400);
  assert.equal((await request(f, '/org/structure/branches')).body.data.length, 2);
  const staff = await m.User.create({ organizationId: f.org.id, name: 'Staff', email: 'staff@structure.invalid', role: 'HR_OFFICER', passwordHash: 'unused' });
  assert.equal((await request({ admin: staff }, '/org/structure/branches', 'POST', { number: '002', code: 'X', name: 'No' })).status, 403);
});

test('workbook endpoints enforce in-memory XLSX boundary and signed tenant preview/apply', async () => {
  const f = await fixture(), other = await fixture();
  for (const target of [f, other]) await request(target, '/org/structure/head-office', 'POST', { number: '000', code: 'HO', name: 'Head Office' });
  const template = await request(f, '/org/structure/branches/import/template'); assert.equal(template.status, 200);
  const book = new Excel.Workbook(); await book.xlsx.load(template.body); book.worksheets[0].addRow(['001', 'BR1', 'New Branch', 'Address', '000123']);
  const bytes = Buffer.from(await book.xlsx.writeBuffer()), mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  assert.equal((await request(f, '/org/structure/branches/import/preview', 'POST', bytes, 'text/plain')).status, 415);
  assert.equal((await request(f, '/org/structure/branches/import/preview', 'POST', Buffer.alloc(2 * 1024 * 1024 + 1), mime)).status, 413);
  assert.equal((await request(f, '/org/structure/branches/import/preview', 'POST', Buffer.from('not xlsx'), mime)).status, 400);
  const auditsBeforePreview = await m.AuditLog.count();
  const preview = await request(f, '/org/structure/branches/import/preview', 'POST', bytes, mime); assert.equal(preview.status, 200); assert.equal(preview.body.data.errors.length, 0); assert.equal(await m.AuditLog.count(), auditsBeforePreview);
  assert.equal(await m.OrganizationBranch.count({ where: { organizationId: f.org.id } }), 1);
  assert.equal((await request(other, '/org/structure/branches/import/apply', 'POST', preview.body.data)).status, 400);
  m.AuditLog.addHook('beforeCreate', 'importAuditFailure', row => { if (row.action === 'org.branch.import.apply') throw new Error('import aggregate audit failure'); });
  try { assert.equal((await request(f, '/org/structure/branches/import/apply', 'POST', preview.body.data)).status, 500); } finally { m.AuditLog.removeHook('beforeCreate', 'importAuditFailure'); }
  assert.equal(await m.OrganizationBranch.count({ where: { organizationId: f.org.id } }), 1);
  assert.equal(await m.AuditLog.count(), auditsBeforePreview);
  assert.equal((await request(f, '/org/structure/branches/import/apply', 'POST', preview.body.data)).status, 201);
  assert.equal(await m.OrganizationBranch.count({ where: { organizationId: f.org.id } }), 2);
  assert.equal(await m.AuditLog.count({ where: { organizationId: f.org.id, action: 'org.branch.import.apply' } }), 1);
  assert.equal((await request(f, '/org/structure/branches/import/apply', 'POST', preview.body.data)).status, 400);
});
