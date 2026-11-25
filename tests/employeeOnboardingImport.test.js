'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'employee-onboarding-import-test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  sequelize, Organization, PostCadre, OrganizationBranch, OrganizationDepartment,
  OrganizationPosition, Employee, User, OrganizationRole, UserRoleAssignment,
  EmployeeOrganizationAssignment,
  EmployeeOfficeInformation, EmployeeServiceInformation, EmployeeContactAddress,
  EmployeeBankAccount,
} = require('../src/models');
const onboarding = require('../src/services/employeeOnboardingImport');

let organization, actor, source;
before(async () => {
  await sequelize.sync({ force: true });
  organization = await Organization.create({ code: 'ONB', name: 'Onboarding Bank', accessControlMode: 'PERMISSIONS' });
  const post = await PostCadre.create({ organizationId: organization.id, code: 'CLERK', name: 'Clerk' });
  const branch = await OrganizationBranch.create({ organizationId: organization.id, code: 'HO', number: '001', name: 'Head Office', unitType: 'HEAD_OFFICE', isHeadOffice: true });
  const department = await OrganizationDepartment.create({ organizationId: organization.id, branchId: branch.id, code: 'OPS', name: 'Operations' });
  await OrganizationPosition.create({ organizationId: organization.id, branchId: branch.id, departmentId: department.id, code: 'CLERK-01', name: 'Clerk', postCadreId: post.id, capacity: 2 });
  const actorUser = await User.create({ organizationId: organization.id, email: 'hr@example.invalid', name: 'HR Admin', role: 'ORG_ADMIN', passwordHash: 'unused' });
  actor = { id: actorUser.id, organizationId: organization.id, email: actorUser.email };
  source = { filename: 'employees.xlsx', sha256: 'b'.repeat(64), byteLength: 200 };
});
after(async () => sequelize.close());

function rows() {
  return [{
    empCode: 'E100', name: 'Employee Only', doj: '2026-11-01', postCode: 'CLERK',
    branchCode: 'HO', departmentCode: 'OPS', positionCode: 'CLERK-01',
    educationalQualification: 'B.Com', educationVerified: 'YES', createLogin: 'YES',
    loginEmail: 'employee.only@example.invalid', role: 'ORG_ADMIN',
    pfApplicationNumber: '0007-A', cbsBranchCode: '001', cbsAccountType: 'SAVINGS',
    salaryBankName: 'Onboarding Bank', salaryAccountNumber: '0000123456', bankIfsc: 'TEST0000001',
    probationPeriodDays: '365', confirmationDate: '2027-11-01',
    residentialAddress1: 'House 1', residentialCity: 'Manjeri', residentialEmail: 'employee@example.invalid',
  }];
}

test('controlled onboarding creates only an EMPLOYEE own-scope account and authoritative assignment', async () => {
  const preview = await onboarding.validatePreview(rows(), { organizationId: organization.id, source });
  assert.equal(preview.summary.valid, 1);
  const applied = await onboarding.applyPreview(preview, actor);
  assert.equal(applied.summary.created, 1, JSON.stringify(applied));
  assert.equal(applied.credentials.length, 1);
  assert.ok(applied.credentials[0].temporaryPassword);
  const employee = await Employee.findOne({ where: { organizationId: organization.id, empCode: 'E100' } });
  const user = await User.findOne({ where: { employeeId: employee.id } });
  assert.equal(user.role, 'EMPLOYEE');
  const role = await OrganizationRole.findOne({ where: { organizationId: organization.id, code: 'EMPLOYEE' } });
  assert.equal(role.isProtected, true);
  assert.equal((await UserRoleAssignment.findOne({ where: { userId: user.id } })).scopeType, 'OWN');
  assert.equal(await EmployeeOrganizationAssignment.count({ where: { employeeId: employee.id } }), 1);
  assert.equal((await EmployeeOfficeInformation.findOne({ where: { employeeId: employee.id } })).pfApplicationNumber, '0007-A');
  assert.equal((await EmployeeServiceInformation.findOne({ where: { employeeId: employee.id } })).probationPeriodDays, 365);
  assert.equal((await EmployeeContactAddress.findOne({ where: { employeeId: employee.id, addressType: 'RESIDENTIAL' } })).city, 'Manjeri');
  const bankAccount = await EmployeeBankAccount.findOne({ where: { employeeId: employee.id } });
  assert.equal(bankAccount.accountNumber, '0000123456');
  assert.equal(bankAccount.accountType, 'SB');
  assert.equal(bankAccount.cbsBranchCode, '001');
  assert.equal((await employee.reload()).salaryCreditAccountId, bankAccount.id);
});

test('controlled onboarding rejects positions outside the creator branch scope', async () => {
  const branch = await OrganizationBranch.findOne({ where: { organizationId: organization.id, code: 'HO' } });
  const department = await OrganizationDepartment.findOne({ where: { organizationId: organization.id, code: 'OPS' } });
  const access = {
    userId: actor.id,
    organizationId: organization.id,
    accessControlMode: 'PERMISSIONS',
    employeeId: null,
    grants: [{ action: 'people.create', scope: 'SELECTED_BRANCHES', branchIds: [999999], departmentIds: [] }],
    activeBranchIds: [branch.id],
    activeDepartmentIds: [department.id],
  };
  const preview = await onboarding.validatePreview([{ ...rows()[0], empCode: 'E099', loginEmail: 'scope@example.invalid' }], { organizationId: organization.id, source, access });
  assert.match(preview.rows[0].errors.join(' '), /outside your permitted organisation scope/i);
});

test('controlled onboarding validates impossible dates and statutory identifier formats before writes', async () => {
  const preview = await onboarding.validatePreview([{
    ...rows()[0], empCode: 'E098', loginEmail: 'invalid-fields@example.invalid',
    dob: '2025-02-30', panNumber: 'BADPAN', aadhaarNumber: '123', uanNumber: 'ABC',
  }], { organizationId: organization.id, source });
  assert.equal(preview.summary.invalid, 1);
  assert.match(preview.rows[0].errors.join(' '), /Date of Birth/i);
  assert.match(preview.rows[0].errors.join(' '), /PAN Number/i);
  assert.match(preview.rows[0].errors.join(' '), /Aadhaar Number/i);
  assert.match(preview.rows[0].errors.join(' '), /UAN Number/i);
  assert.equal(await Employee.count({ where: { organizationId: organization.id, empCode: 'E098' } }), 0);
});

test('retry does not create duplicate employees or reveal another password', async () => {
  const preview = await onboarding.validatePreview([{ ...rows()[0], empCode: 'E101', loginEmail: 'employee.two@example.invalid' }], { organizationId: organization.id, source: { ...source, sha256: 'c'.repeat(64) } });
  const first = await onboarding.applyPreview(preview, actor);
  const second = await onboarding.applyPreview(preview, actor);
  assert.equal(first.summary.created, 1, JSON.stringify(first));
  assert.equal(second.summary.unchanged, 1);
  assert.equal(second.credentials.length, 0);
  assert.equal(await Employee.count({ where: { organizationId: organization.id, empCode: 'E101' } }), 1);
});
