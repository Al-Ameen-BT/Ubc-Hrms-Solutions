'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'structure-workbook-test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Excel = require('exceljs');
const {
  sequelize, Organization, PostCadre, OrganizationBranch, OrganizationDepartment,
  OrganizationPosition, Employee, User, EmployeeOrganizationAssignment,
  OrganizationResponsibilityAssignment,
} = require('../src/models');
const structureWb = require('../src/services/structureWorkbook');
const onboarding = require('../src/services/employeeOnboardingImport');

let organization, actor, cadre;

before(async () => {
  await sequelize.sync({ force: true });
  organization = await Organization.create({ code: 'STR', name: 'Structure Bank', accessControlMode: 'PERMISSIONS' });
  cadre = await PostCadre.create({ organizationId: organization.id, code: 'CLERK', name: 'Clerk' });
  await OrganizationBranch.create({ organizationId: organization.id, code: 'HO', number: '001', name: 'Head Office', unitType: 'HEAD_OFFICE', isHeadOffice: true });
  const user = await User.create({ organizationId: organization.id, email: 'admin@str.invalid', name: 'Admin', role: 'ORG_ADMIN', passwordHash: 'x' });
  actor = { id: user.id, organizationId: organization.id, email: user.email };
});

after(async () => sequelize.close());

async function buildWorkbook(entity, rows) {
  const tpl = await structureWb.writeStructureTemplate(entity);
  const wb = new Excel.Workbook();
  await wb.xlsx.load(tpl);
  const ws = wb.getWorksheet(1);
  rows.forEach(r => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('structure workbook imports departments, positions, staffing, and responsibilities', async () => {
  const deptBuf = await buildWorkbook('departments', [['HO', 'OPS', 'Operations', '1']]);
  const deptPrev = await structureWb.previewStructureWorkbook('departments', deptBuf, actor);
  assert.equal(deptPrev.errors.length, 0);
  assert.ok(deptPrev.previewSignature);
  await structureWb.applyStructureWorkbook('departments', deptPrev, actor);
  const dept = await OrganizationDepartment.findOne({ where: { organizationId: organization.id, code: 'OPS' } });
  assert.ok(dept);

  const posBuf = await buildWorkbook('positions', [['HO', 'OPS', 'CLK1', 'Junior Clerk', 'CLERK', '2', '', 'NO']]);
  const posPrev = await structureWb.previewStructureWorkbook('positions', posBuf, actor);
  assert.equal(posPrev.errors.length, 0);
  await structureWb.applyStructureWorkbook('positions', posPrev, actor);
  const pos = await OrganizationPosition.findOne({ where: { organizationId: organization.id, code: 'CLK1' } });
  assert.ok(pos);

  const emp = await Employee.create({ organizationId: organization.id, empCode: 'E001', name: 'Staff One', doj: '2026-01-01', postCadreId: cadre.id });
  const staffBuf = await buildWorkbook('staffing', [['E001', 'HO', 'OPS', 'CLK1', '2026-01-01', '']]);
  const staffPrev = await structureWb.previewStructureWorkbook('staffing', staffBuf, actor);
  assert.equal(staffPrev.errors.length, 0);
  await structureWb.applyStructureWorkbook('staffing', staffPrev, actor);
  assert.equal(await EmployeeOrganizationAssignment.count({ where: { employeeId: emp.id } }), 1);

  const respBuf = await buildWorkbook('responsibilities', [['E001', 'BRANCH_MANAGER', 'BRANCH', 'HO', '2026-01-01', '']]);
  const respPrev = await structureWb.previewStructureWorkbook('responsibilities', respBuf, actor);
  assert.equal(respPrev.errors.length, 0);
  await structureWb.applyStructureWorkbook('responsibilities', respPrev, actor);
  assert.equal(await OrganizationResponsibilityAssignment.count({ where: { employeeId: emp.id, responsibility: 'BRANCH_MANAGER' } }), 1);
});

test('employee onboarding import auto-creates missing branch, department, position, staffing, and responsibility', async () => {
  const source = { filename: 'auto-sync.xlsx', sha256: 'd'.repeat(64), byteLength: 300 };
  const preview = await onboarding.validatePreview([{
    empCode: 'E200', name: 'Auto Sync Employee', doj: '2026-06-01', postCode: 'CLERK',
    branchCode: 'BR02', branchName: 'Kondotty Branch', branchNumber: '002',
    departmentCode: 'CREDIT', departmentName: 'Credit Dept',
    positionCode: 'BM01', positionName: 'Branch Manager',
    responsibility: 'BRANCH_MANAGER', responsibilityScope: 'BRANCH',
    educationalQualification: 'MBA', educationVerified: 'YES', createLogin: 'NO',
  }], { organizationId: organization.id, source });

  assert.equal(preview.summary.valid, 1, JSON.stringify(preview.rows[0].errors));
  const applied = await onboarding.applyPreview(preview, actor);
  assert.equal(applied.summary.created, 1, JSON.stringify(applied));

  const branch = await OrganizationBranch.findOne({ where: { organizationId: organization.id, code: 'BR02' } });
  const dept = await OrganizationDepartment.findOne({ where: { organizationId: organization.id, branchId: branch.id, code: 'CREDIT' } });
  const pos = await OrganizationPosition.findOne({ where: { organizationId: organization.id, branchId: branch.id, departmentId: dept.id, code: 'BM01' } });
  const emp = await Employee.findOne({ where: { organizationId: organization.id, empCode: 'E200' } });

  assert.ok(branch && dept && pos && emp);
  assert.equal(emp.branchId, branch.id);
  assert.equal(emp.departmentId, dept.id);
  assert.equal(emp.positionId, pos.id);
  assert.equal(await EmployeeOrganizationAssignment.count({ where: { employeeId: emp.id, branchId: branch.id, departmentId: dept.id, positionId: pos.id } }), 1);
  assert.equal(await OrganizationResponsibilityAssignment.count({ where: { employeeId: emp.id, branchId: branch.id, responsibility: 'BRANCH_MANAGER' } }), 1);
});

test('structure workbook prevents intra-workbook and database duplicates and exports structured data', async () => {
  const dupDeptBuf = await buildWorkbook('departments', [
    ['HO', 'FIN', 'Finance', '2'],
    ['HO', 'FIN2', 'Finance', '3'],
  ]);
  const dupDeptPrev = await structureWb.previewStructureWorkbook('departments', dupDeptBuf, actor);
  assert.ok(dupDeptPrev.errors.some(e => e.field === 'name' && /Duplicate department name/i.test(e.message)));

  const dupStaffBuf = await buildWorkbook('staffing', [
    ['E001', 'HO', 'OPS', 'CLK1', '2026-01-01', ''],
  ]);
  const dupStaffPrev = await structureWb.previewStructureWorkbook('staffing', dupStaffBuf, actor);
  assert.ok(dupStaffPrev.errors.some(e => e.field === 'empCode' && /overlapping active assignment/i.test(e.message)));

  for (const entity of ['branches', 'departments', 'positions', 'staffing', 'responsibilities']) {
    const exported = await structureWb.exportStructureWorkbook(entity, organization.id);
    assert.ok(Buffer.isBuffer(exported) && exported.length > 500, `Expected non-empty export for ${entity}`);
    const wb = new Excel.Workbook();
    await wb.xlsx.load(exported);
    assert.ok(wb.getWorksheet(1).rowCount >= 2, `Expected exported data rows for ${entity}`);
  }
});

test('employee onboarding import rejects duplicate PAN, Aadhaar, and UAN numbers', async () => {
  const source = { filename: 'dup-statutory.xlsx', sha256: 'e'.repeat(64), byteLength: 300 };
  const preview = await onboarding.validatePreview([
    {
      empCode: 'E301', name: 'Emp One', doj: '2026-06-01', postCode: 'CLERK',
      branchCode: 'HO', departmentCode: 'OPS', positionCode: 'CLK1',
      panNumber: 'ABCDE1234F', aadhaarNumber: '123456789012', uanNumber: '100000000001',
      educationalQualification: 'B.Com', educationVerified: 'YES', createLogin: 'NO',
    },
    {
      empCode: 'E302', name: 'Emp Two', doj: '2026-06-01', postCode: 'CLERK',
      branchCode: 'HO', departmentCode: 'OPS', positionCode: 'CLK1',
      panNumber: 'ABCDE1234F', aadhaarNumber: '123456789012', uanNumber: '100000000001',
      educationalQualification: 'B.Com', educationVerified: 'YES', createLogin: 'NO',
    },
  ], { organizationId: organization.id, source });

  assert.equal(preview.summary.invalid, 1);
  const errs = preview.rows[1].errors.join(' ');
  assert.match(errs, /PAN Number already exists or is duplicated/i);
  assert.match(errs, /Aadhaar Number already exists or is duplicated/i);
  assert.match(errs, /UAN Number already exists or is duplicated/i);
});
