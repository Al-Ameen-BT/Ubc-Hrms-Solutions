'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  sequelize, Organization, PostCadre, Employee, EmployeeOfficeInformation,
  EmployeeServiceInformation, EmployeeContactAddress,
} = require('../src/models');
const { normalizeEmployeeMasterData } = require('../src/services/employeeMasterData');

let employee;

before(async () => {
  await sequelize.sync({ force: true });
  const organization = await Organization.create({ code: 'MASTER', name: 'Master Data Bank' });
  const post = await PostCadre.create({ organizationId: organization.id, code: 'CLERK', name: 'Clerk' });
  employee = await Employee.create({
    organizationId: organization.id,
    postCadreId: post.id,
    empCode: 'E001',
    name: 'Employee One',
    dob: '1990-01-01',
    doj: '2020-01-01',
  });
});

after(async () => sequelize.close());

test('normalizes supplied office, service and address/contact fields without treating application numbers as flags', () => {
  const value = normalizeEmployeeMasterData({
    pfApplicationNumber: '0007-A',
    ptApplicationNumber: 'PT-09',
    vpfApplicationNumber: 'VPF-2',
    cbsBranchCode: '0012',
    cbsAccountType: 'SAV-REG',
    vpfDeclaredAmount: '1250',
    vpfDeclaredPercent: '7.5',
    probationPeriodDays: '365',
    probationDate: '2020-12-31',
    residentialEmail: 'employee@example.invalid',
    residentialWebsite: 'https://example.invalid/profile',
    residentialContactNumber: '+91 98765 43210',
  }, { dob: '1990-01-01', doj: '2020-01-01' });

  assert.deepEqual(value.errors, []);
  assert.equal(value.office.pfApplicationNumber, '0007-A');
  assert.equal(value.office.ptApplicationNumber, 'PT-09');
  assert.equal(value.office.vpfApplicationNumber, 'VPF-2');
  assert.equal(value.office.cbsBranchCode, '0012');
  assert.equal(value.office.cbsAccountType, 'SAV-REG');
  assert.equal(value.office.vpfDeclaredAmount, 1250);
  assert.equal(value.office.vpfDeclaredPercent, 7.5);
  assert.equal(value.service.probationPeriodDays, 365);
  assert.equal(value.contacts[0].addressType, 'RESIDENTIAL');
});

test('rejects invalid chronology, percentage, email, website and period values', () => {
  const value = normalizeEmployeeMasterData({
    confirmationDate: '2019-12-31',
    probationPeriodDays: '-1',
    vpfDeclaredPercent: '101',
    permanentEmail: 'not-an-email',
    permanentWebsite: 'javascript:alert(1)',
    permanentContactNumber: 'call me',
    probationDate: '2025-02-30',
  }, { dob: '1990-01-01', doj: '2020-01-01' });

  assert.match(value.errors.join(' '), /Confirmation Date/i);
  assert.match(value.errors.join(' '), /Probation Period/i);
  assert.match(value.errors.join(' '), /VPF Percentage/i);
  assert.match(value.errors.join(' '), /Permanent Email/i);
  assert.match(value.errors.join(' '), /Permanent Website/i);
  assert.match(value.errors.join(' '), /Permanent Contact Number/i);
  assert.match(value.errors.join(' '), /Probation Date/i);
});

test('stores one office row, one service row and typed contact rows per employee', async () => {
  await EmployeeOfficeInformation.create({ employeeId: employee.id, pfApplicationNumber: 'PF-APP-1' });
  await EmployeeServiceInformation.create({ employeeId: employee.id, probationPeriodDays: 365 });
  await EmployeeContactAddress.create({ employeeId: employee.id, addressType: 'RESIDENTIAL', city: 'Manjeri' });

  await assert.rejects(
    EmployeeOfficeInformation.create({ employeeId: employee.id, pfApplicationNumber: 'PF-APP-2' }),
    /unique/i,
  );
  await assert.rejects(
    EmployeeContactAddress.create({ employeeId: employee.id, addressType: 'RESIDENTIAL', city: 'Kozhikode' }),
    /unique/i,
  );
});
