'use strict';

process.env.JWT_SECRET = 'controlled-import-test-secret';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Excel = require('exceljs');

async function sourceWorkbook() {
  const book = new Excel.Workbook();
  const summary = book.addWorksheet('Sheet1');
  summary.addRow(['Sno.', 'Allowances', 'Amount', 'per periodicity', 'maximum', 'Level']);
  summary.addRow(['', 'Other than B.P, D.A., HRA, CCA']);
  summary.addRow([1, 'Medical Allowance', '4000', 'Per Year', '4000', 'For all grades']);
  summary.addRow([7, 'Physically Handicapped Allowance', '5% of Basic Pay', 'per month', '1000', 'Employee flag required']);
  summary.addRow(['A', 'Deductions']);
  summary.addRow([1, 'Provident Fund', '12 % of Basic Pay and D.A', 'every month', '', 'For all grades']);
  summary.addRow(['D', 'Leave Particulars']);
  summary.addRow([1, 'Casual Leave', '20 days for Calendar Year', '', '', 'For all grades']);
  summary.addRow([2, 'Earned/Privileged Leave', '1 days per 11 attending days subj to max 240 days', '', '240', 'For all grades']);

  const medical = book.addWorksheet('Medical Allowance');
  medical.getRow(5).values = [null, 'EMP_ID', 'empname', 'Designation', 'Br_Code', 'Branch', 'Amount', 'Months'];
  medical.getRow(6).values = [null, 'E001', 'Employee One', 'Clerk', 'B01', 'Main', 4000, 12];

  const lic = book.addWorksheet('LIC Premium');
  lic.getRow(8).values = [null, 'Policy Number', 'Name of Policy Holder', 'Premium', 'GST', 'Total Premium', 'Department Code', 'Employee Code'];
  lic.getRow(9).values = [null, 'LIC-1', 'Employee One', 1000, 0, 1000, 'HO', ''];

  const festival = book.addWorksheet('Festival Advance');
  festival.getRow(3).values = ['SL No', 'ID', 'Name', 'Toatl Amount', 'Monthly Amount', 'balance amount', 'Total inst', 'Balance Inst', 'No Installment Completed'];
  festival.getRow(4).values = [1, 'E001', 'Employee One', 74000, 7400, 66000, 10, 9, 1];

  const housing = book.addWorksheet('Housing Loan');
  housing.getRow(3).values = ['ACCOUNT NUMBER 15digt ', 'ACNTS OPENING DATE', 'PURPOSE OF LOAN', 'CLIENTS NAME', 'INTRATE', 'Main Balance', 'BALANCE ASON DATE', 'LOAN AMT', 'NO OF INST', 'EMI/INSTALLMENT', 'INSTALLMENT AMT', 'LOAN SANCTION DATE', 'EXP DATE'];
  housing.getRow(4).values = ['123456789012345', '2025-01-01', 'HOUSE', 'Employee One', 8.5, -100000, -90000, 100000, 12, 9000, 9000, '2025-01-01', '2025-12-31'];

  return Buffer.from(await book.xlsx.writeBuffer());
}

test('rule workbook parser normalizes calculation rules without trusting formulas', async () => {
  const { parseRuleWorkbook } = require('../src/services/importWorkbooks');
  const result = await parseRuleWorkbook(await sourceWorkbook(), { filename: 'rules.xlsx' });

  assert.equal(result.source.filename, 'rules.xlsx');
  assert.match(result.source.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.schemaVersion, 'rule-workbook-v1');
  assert.deepEqual(result.payrollDefaults, {
    medicalAllowanceAmount: 4000,
    pfEmployeePercent: 12,
    pfCalculationBase: 'BASIC_PLUS_DA',
  });
  assert.deepEqual(result.rows.find((row) => row.naturalKey === 'ALLOWANCE:MEDICAL_ALLOWANCE').values.customizableFields, ['amount', 'maximum', 'frequency']);
  assert.equal(result.rows.find((row) => row.naturalKey === 'LEAVE:CASUAL_LEAVE').values.annualDays, 20);
  assert.equal(result.rows.find((row) => row.naturalKey === 'LEAVE:EARNED_PRIVILEGED_LEAVE').values.maxAccumulation, 240);
});

test('financial workbook parser rejects missing employee keys and recomputes advance balance', async () => {
  const { parseEmployeeFinancialWorkbook } = require('../src/services/importWorkbooks');
  const result = await parseEmployeeFinancialWorkbook(await sourceWorkbook(), { filename: 'financial.xlsx' });

  const medical = result.rows.find((row) => row.kind === 'EMPLOYEE_ALLOWANCE');
  assert.equal(medical.values.employeeCode, 'E001');
  assert.equal(medical.values.amount, 4000);

  const lic = result.rows.find((row) => row.kind === 'LIC_POLICY');
  assert.match(lic.errors.join(' '), /Employee Code is required/);

  const advance = result.rows.find((row) => row.kind === 'FESTIVAL_ADVANCE');
  assert.equal(advance.values.expectedBalanceAmount, 66600);
  assert.match(advance.errors.join(' '), /recorded balance.*66,000.*expected.*66,600/i);

  const housing = result.rows.find((row) => row.kind === 'HOUSING_LOAN');
  assert.match(housing.errors.join(' '), /Employee Code column is required/);
  assert.equal(housing.values.outstandingAmount, 90000);
});

test('workbook parser rejects oversized and non-xlsx input before Excel parsing', async () => {
  const { parseRuleWorkbook } = require('../src/services/importWorkbooks');
  await assert.rejects(() => parseRuleWorkbook(Buffer.alloc(2 * 1024 * 1024 + 1), { filename: 'large.xlsx' }), /at most 2 MiB/);
  await assert.rejects(() => parseRuleWorkbook(Buffer.from('not a workbook'), { filename: 'bad.xlsx' }), /valid .xlsx/);
});
