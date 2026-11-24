'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'employee-workbook-test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const Excel = require('exceljs');
const { sequelize, Organization, PostCadre, PayRevision, PayScale, Employee, User } = require('../src/models');
const { signToken } = require('../src/services/authService');
const { writeEmployeeBulkTemplate, parseEmployeeWorkbook, EMPLOYEE_FIELD_GROUPS } = require('../src/services/employeeWorkbook');
const routes = require('../src/routes');

let server;
let base;
let org;
let post;
let scale;
let hrUser;
let hrToken;

const request = async (path, token, method = 'GET', body, headers = {}) => {
  const isBinary = headers['Content-Type'] === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(!isBinary && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isBinary ? body : JSON.stringify(body),
  });
  const contentType = response.headers.get('content-type') || '';
  return {
    status: response.status,
    headers: response.headers,
    body: contentType.includes('application/json')
      ? await response.json()
      : Buffer.from(await response.arrayBuffer()),
  };
};

before(async () => {
  await sequelize.sync();
  org = await Organization.create({ code: 'WBTEST', name: 'Workbook Test Bank' });
  post = await PostCadre.create({ organizationId: org.id, code: 'CLERK_TEST', name: 'Junior Clerk' });
  const revision = await PayRevision.create({ organizationId: org.id, name: 'WB Revision', effectiveDate: '2020-01-01' });
  scale = await PayScale.create({
    organizationId: org.id,
    payRevisionId: revision.id,
    code: 'SCALE_TEST',
    name: 'Clerical Scale',
    scaleExpression: '20000-500/5-22500',
    effectiveFrom: '2020-01-01',
  });

  const emp = await Employee.create({
    organizationId: org.id,
    empCode: 'HR001',
    name: 'HR Officer',
    doj: '2020-01-01',
    postCadreId: post.id,
    currentBasicPay: 25000,
  });

  hrUser = await User.create({
    organizationId: org.id,
    email: 'hr@wbtest.invalid',
    name: 'HR Officer User',
    role: 'HR_ADMIN',
    employeeId: emp.id,
    passwordHash: 'unused',
  });
  hrToken = signToken(hrUser);

  const app = express();
  app.use(express.json({ limit: '8mb' }));
  app.use('/api/v1', routes);
  server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await sequelize.close();
});

test('writeEmployeeBulkTemplate produces a well-structured workbook with 2 sheets and category bands', async () => {
  const buffer = await writeEmployeeBulkTemplate({ organizationId: org.id });
  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 1000);

  const wb = new Excel.Workbook();
  await wb.xlsx.load(buffer);
  assert.equal(wb.worksheets.length, 2);

  const masterSheet = wb.getWorksheet('Employee Master');
  assert.ok(masterSheet, 'Employee Master sheet exists');
  assert.equal(masterSheet.rowCount >= 4, true);

  // Row 1 has merged category headers
  const row1CellA = masterSheet.getCell('A1');
  assert.match(row1CellA.value, /1\. BASIC IDENTITY/i);

  // Row 2 has column headers
  const headers = [];
  masterSheet.getRow(2).eachCell((cell) => headers.push(cell.value));
  assert.ok(headers.some((h) => h.includes('Employee Code')));
  assert.ok(headers.some((h) => h.includes('Full Name')));
  assert.ok(headers.some((h) => h.includes('Date of Joining')));
  assert.ok(headers.some((h) => h.includes('Post Code')));

  // Reference sheet exists and lists active post & scale codes
  const refSheet = wb.getWorksheet('Reference Codes & Guide');
  assert.ok(refSheet, 'Reference sheet exists');
  let foundPost = false;
  let foundScale = false;
  refSheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (cell.value === 'CLERK_TEST') foundPost = true;
      if (cell.value === 'SCALE_TEST') foundScale = true;
    });
  });
  assert.ok(foundPost, 'CLERK_TEST found in Reference sheet');
  assert.ok(foundScale, 'SCALE_TEST found in Reference sheet');
});

test('parseEmployeeWorkbook extracts normalized employee rows from an Excel buffer', async () => {
  const wb = new Excel.Workbook();
  const ws = wb.addWorksheet('Employee Master');
  // Row 1: Category headers
  ws.addRow(['1. BASIC IDENTITY', '', '', '2. CADRE', '', '', '']);
  // Row 2: Field headers
  ws.addRow(['Employee Code *', 'Full Name *', 'Date of Birth (YYYY-MM-DD)', 'Date of Joining *', 'Date of Appointment', 'Employment Type', 'Post Code *']);
  // Row 3: Data row
  ws.addRow(['WB001', 'Alice Worker', '1992-03-15', '2021-04-01', '2021-04-01', 'REGULAR', 'CLERK_TEST']);
  // Row 4: Data row with date object
  ws.addRow(['WB002', 'Bob Builder', new Date('1988-06-20T00:00:00Z'), '2022-07-15', '', 'PART_TIME_CONTINGENT', 'CLERK_TEST']);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const rows = await parseEmployeeWorkbook(buffer);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].empCode, 'WB001');
  assert.equal(rows[0].name, 'Alice Worker');
  assert.equal(rows[0].dob, '1992-03-15');
  assert.equal(rows[0].doj, '2021-04-01');
  assert.equal(rows[0].postCode, 'CLERK_TEST');

  assert.equal(rows[1].empCode, 'WB002');
  assert.equal(rows[1].name, 'Bob Builder');
  assert.equal(rows[1].dob, '1988-06-20');
  assert.equal(rows[1].employmentType, 'PART_TIME_CONTINGENT');
});

test('GET /employees/bulk-template.xlsx downloads styled Excel template', async () => {
  const res = await request('/employees/bulk-template.xlsx', hrToken);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /spreadsheetml\.sheet/);
  assert.ok(res.body.length > 1000);

  const wb = new Excel.Workbook();
  await wb.xlsx.load(res.body);
  assert.equal(wb.worksheets.length, 2);
});

test('GET /employees/bulk-references returns active posts, scales and structured field groups', async () => {
  const res = await request('/employees/bulk-references', hrToken);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.posts));
  assert.ok(res.body.data.posts.some((p) => p.code === 'CLERK_TEST'));
  assert.ok(Array.isArray(res.body.data.scales));
  assert.ok(res.body.data.scales.some((s) => s.code === 'SCALE_TEST'));
  assert.ok(Array.isArray(res.body.data.fieldGroups));
  assert.equal(res.body.data.fieldGroups.length, 7);
});

test('bulk import page consumes the reference API posts and scales fields', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../frontend/src/features/employees/BulkImportPage.jsx'), 'utf8');
  assert.match(source, /referenceData\?\.posts\s*\|\|\s*\[\]/);
  assert.match(source, /referenceData\?\.scales\s*\|\|\s*\[\]/);
});

test('POST /employees/bulk-import/preview validates rows and detects missing or invalid fields', async () => {
  const previewInput = {
    rows: [
      { empCode: 'PV001', name: 'Valid Worker', doj: '2023-01-01', postCode: 'CLERK_TEST' },
      { empCode: 'HR001', name: 'Existing Code Worker', doj: '2023-01-01', postCode: 'CLERK_TEST' },
      { empCode: 'PV002', name: 'Bad Post Worker', doj: '2023-01-01', postCode: 'NON_EXISTENT_POST' },
      { empCode: '', name: 'Missing Code', doj: '2023-01-01', postCode: 'CLERK_TEST' },
    ],
  };
  const res = await request('/employees/bulk-import/preview', hrToken, 'POST', previewInput);
  assert.equal(res.status, 200);
  assert.equal(res.body.summary.total, 4);
  assert.equal(res.body.summary.valid, 1);
  assert.equal(res.body.summary.invalid, 3);
  assert.equal(res.body.data[0].valid, true);
  assert.equal(res.body.data[1].valid, false);
  assert.match(res.body.data[1].message, /already exists/i);
  assert.equal(res.body.data[2].valid, false);
  assert.match(res.body.data[2].message, /not found/i);
  assert.equal(res.body.data[3].valid, false);
  assert.match(res.body.data[3].message, /required/i);
});

test('POST /employees/bulk-import creates employees from Excel fileBase64 upload', async () => {
  const wb = new Excel.Workbook();
  const ws = wb.addWorksheet('Employee Master');
  ws.addRow(['1. IDENTITY', '', '', '2. CADRE', '', '', '']);
  ws.addRow(['Employee Code *', 'Full Name *', 'Date of Birth (YYYY-MM-DD)', 'Date of Joining *', 'Date of Appointment', 'Employment Type', 'Post Code *']);
  ws.addRow(['XLS_001', 'Excel Employee One', '1995-01-01', '2023-05-01', '2023-05-01', 'REGULAR', 'CLERK_TEST']);
  ws.addRow(['XLS_002', 'Excel Employee Two', '1996-02-02', '2023-06-01', '', 'REGULAR', 'CLERK_TEST']);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const fileBase64 = buffer.toString('base64');

  const res = await request('/employees/bulk-import', hrToken, 'POST', { fileBase64 });
  assert.equal(res.status, 200);
  assert.equal(res.body.summary.created, 2);
  assert.equal(res.body.summary.failed, 0);

  const emp1 = await Employee.findOne({ where: { organizationId: org.id, empCode: 'XLS_001' } });
  assert.ok(emp1);
  assert.equal(emp1.name, 'Excel Employee One');

  const emp2 = await Employee.findOne({ where: { organizationId: org.id, empCode: 'XLS_002' } });
  assert.ok(emp2);
  assert.equal(emp2.name, 'Excel Employee Two');
});
