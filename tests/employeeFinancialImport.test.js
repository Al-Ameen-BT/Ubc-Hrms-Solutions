'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'employee-financial-import-test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sequelize, Organization, PostCadre, Employee, EmployeePayrollAdjustment, AuditLog } = require('../src/models');
const financialImport = require('../src/services/employeeFinancialImport');
const { applicableAllowancesFor } = require('../src/services/allowances');

let organization, employee, actor;
before(async () => {
  await sequelize.sync({ force: true });
  organization = await Organization.create({ code: 'FIMP', name: 'Financial Import Bank' });
  const post = await PostCadre.create({ organizationId: organization.id, code: 'EMP', name: 'Employee' });
  employee = await Employee.create({ organizationId: organization.id, empCode: 'E001', name: 'Import Worker', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 10000 });
  actor = { id: 91, organizationId: organization.id, email: 'payroll@example.invalid' };
});
after(async () => sequelize.close());

function parsed() {
  return {
    schemaVersion: 'employee-financial-workbook-v1',
    source: { filename: 'payroll.xlsx', sha256: 'a'.repeat(64), byteLength: 100 },
    rows: [
      { kind: 'EMPLOYEE_ALLOWANCE', sourceSheet: 'Medical Allowance', sourceRow: 6, naturalKey: 'MED:E001', values: { employeeCode: 'E001', allowanceCode: 'MEDICAL_ALLOWANCE', amount: 4000, sourceReference: 'MEDICAL:E001' }, warnings: [], errors: [] },
      { kind: 'EMPLOYEE_DEDUCTION', sourceSheet: 'Income tax', sourceRow: 3, naturalKey: 'TAX:UNKNOWN', values: { employeeCode: 'UNKNOWN', adjustmentCode: 'INCOME_TAX', name: 'Income tax', amount: 1000, sourceReference: 'INCOME_TAX:UNKNOWN:3' }, warnings: [], errors: [] },
    ],
    summary: { total: 2, valid: 2, invalid: 0 },
  };
}

test('financial preview resolves employee codes and rejects unknown codes without name matching', async () => {
  const preview = await financialImport.validatePreview(parsed(), { organizationId: organization.id, payYear: 2026, payMonth: 12 });
  assert.equal(preview.rows[0].values.employeeId, employee.id);
  assert.equal(preview.rows[0].errors.length, 0);
  assert.match(preview.rows[1].errors.join(' '), /Employee Code was not found/);
  assert.deepEqual(preview.summary, { total: 2, valid: 1, invalid: 1 });
});

test('valid rows apply atomically, retry idempotently, and feed payroll allowance lookup', async () => {
  const preview = await financialImport.validatePreview(parsed(), { organizationId: organization.id, payYear: 2026, payMonth: 12 });
  const first = await financialImport.applyPreview(preview, actor);
  const second = await financialImport.applyPreview(preview, actor);
  assert.equal(first.summary.created, 1);
  assert.equal(first.summary.invalid, 1);
  assert.equal(second.summary.unchanged, 1);
  assert.equal(await EmployeePayrollAdjustment.count(), 1);
  assert.equal(await AuditLog.count({ where: { action: 'employee-financial-import.apply' } }), 1);
  const allowances = await applicableAllowancesFor(organization.id, null, 2026, 12, { employee: employee.toJSON(), basicPaise: 1000000, daPaise: 0, grossPaise: 1000000 });
  assert.equal(allowances.find(row => row.name === 'medical allowance').amount, 4000);
});
