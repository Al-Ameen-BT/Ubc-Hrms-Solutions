'use strict';

const crypto = require('node:crypto');
const Excel = require('exceljs');

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_SHEETS = 24;
const MAX_ROWS_PER_SHEET = 2500;
const MAX_COLUMNS_PER_SHEET = 64;
const MAX_CELLS = 60000;

class ImportWorkbookError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function fail(message) { throw new ImportWorkbookError(message); }
function rawValue(cell) {
  const value = cell?.value;
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (value.text != null) return String(value.text).trim();
    if (value.richText) return value.richText.map(part => part.text || '').join('').trim();
    // Formula results are deliberately unavailable to import calculations.
    if (value.formula != null || value.sharedFormula != null) return '';
    if (value.result != null) return value.result;
  }
  return typeof value === 'string' ? value.trim() : value;
}
function displayedValue(cell) {
  // Formula caches are presentation only; controlled imports accept literal
  // source cells and recompute supported amounts in application code.
  return rawValue(cell);
}
function text(value) { return value == null ? '' : String(value).trim(); }
function number(value) {
  const clean = typeof value === 'number' ? value : Number(text(value).replace(/[₹,%\s]/g, '').replace(/,/g, ''));
  return Number.isFinite(clean) ? clean : null;
}
function wholeRupees(value) {
  const parsed = number(value);
  return parsed == null ? null : Math.round(parsed);
}
function code(value) {
  return text(value).toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function row(kind, sourceSheet, sourceRow, naturalKey, values, warnings = [], errors = []) {
  return { kind, sourceSheet, sourceRow, naturalKey, values, warnings, errors };
}
function source(buffer, filename) {
  return { filename: text(filename) || 'import.xlsx', sha256: crypto.createHash('sha256').update(buffer).digest('hex'), byteLength: buffer.length };
}

async function loadWorkbook(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_BYTES) fail('Workbook must be an .xlsx buffer of at most 2 MiB.');
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) fail('Workbook must be a valid .xlsx ZIP file.');
  const book = new Excel.Workbook();
  try { await book.xlsx.load(buffer); } catch { fail('Workbook must be a valid .xlsx file.'); }
  if (!book.worksheets.length || book.worksheets.length > MAX_SHEETS) fail(`Workbook must contain 1-${MAX_SHEETS} worksheets.`);
  let cells = 0;
  for (const sheet of book.worksheets) {
    if (sheet.rowCount > MAX_ROWS_PER_SHEET || sheet.columnCount > MAX_COLUMNS_PER_SHEET) fail('Workbook exceeds the supported sheet dimensions.');
    cells += sheet.rowCount * Math.max(1, sheet.columnCount);
  }
  if (cells > MAX_CELLS) fail('Workbook contains too many cells.');
  return book;
}

function summaryRows(sheet) {
  if (!sheet) fail('Workbook is missing the rule summary sheet.');
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (sheetRow, rowNumber) => {
    const values = Array.from({ length: Math.max(6, sheet.columnCount) }, (_, index) => displayedValue(sheetRow.getCell(index + 1)));
    rows.push({ rowNumber, values });
  });
  return rows;
}

function allowanceRule(entry) {
  const [, nameValue, amountValue, frequencyValue, maximumValue, eligibilityValue] = entry.values;
  const name = text(nameValue), amountText = text(amountValue), percent = /([\d.]+)\s*%/.exec(amountText);
  const enabled = !/^no$/i.test(amountText);
  const values = {
    code: code(name), name, enabled,
    calculationType: percent ? 'PERCENTAGE' : 'FLAT',
    amount: percent ? null : wholeRupees(amountValue),
    percentageValue: percent ? Number(percent[1]) : null,
    percentageBase: percent && /basic/i.test(amountText) ? 'BASIC' : null,
    frequency: /year/i.test(text(frequencyValue)) ? 'YEARLY' : /month/i.test(text(frequencyValue)) ? 'MONTHLY' : null,
    maximum: wholeRupees(maximumValue), eligibility: text(eligibilityValue),
    requiresEmployeeFlag: /physically|handicap|employee flag/i.test(`${name} ${text(eligibilityValue)}`) ? 'physicallyHandicapped' : null,
    customizableFields: ['amount', 'maximum', 'frequency'],
  };
  return row('ALLOWANCE', 'Sheet1', entry.rowNumber, `ALLOWANCE:${values.code}`, values);
}

function deductionRule(entry) {
  const [, nameValue, amountValue, frequencyValue, maximumValue, eligibilityValue] = entry.values;
  const name = text(nameValue), amountText = text(amountValue), percent = /([\d.]+)\s*%/.exec(amountText);
  const values = {
    code: code(name), name, enabled: !/^no$/i.test(amountText),
    category: /provident|profession|income tax/i.test(name) ? 'STATUTORY' : /society/i.test(name) ? 'SOCIETY' : /lic|insurance/i.test(name) ? 'INSURANCE' : /loan/i.test(name) ? 'LOAN' : 'OTHER',
    calculationType: percent ? 'PERCENTAGE' : 'FLAT', amount: percent ? null : wholeRupees(amountValue),
    percentageValue: percent ? Number(percent[1]) : null,
    percentageBase: percent && /basic.*d\.?a/i.test(amountText) ? 'BASIC_PLUS_DA' : percent && /basic/i.test(amountText) ? 'BASIC' : null,
    frequency: /month/i.test(text(frequencyValue)) ? 'MONTHLY' : null,
    maximum: wholeRupees(maximumValue), eligibility: text(eligibilityValue),
    customizableFields: ['amount', 'percentageValue', 'frequency', 'collectionMonths', 'employerAmount'],
  };
  return row('DEDUCTION', 'Sheet1', entry.rowNumber, `DEDUCTION:${values.code}`, values);
}

function leaveRule(entry) {
  const [, nameValue, detailValue, , maximumValue, eligibilityValue] = entry.values;
  const name = text(nameValue), detail = text(detailValue), annual = /([\d.]+)\s*days?\s*(?:for|per)\s*(?:calendar\s*)?year/i.exec(detail);
  const ratio = /1\s*days?\s*per\s*(\d+)\s*attend/i.exec(detail);
  const maxMatch = /max\s*(\d+)/i.exec(detail);
  const values = {
    code: code(name), name,
    accrualMethod: ratio ? 'ATTENDANCE_RATIO' : 'FIXED_ANNUAL',
    annualDays: annual ? Number(annual[1]) : null,
    attendanceDaysPerCredit: ratio ? Number(ratio[1]) : null,
    maxAccumulation: wholeRupees(maximumValue) ?? (maxMatch ? Number(maxMatch[1]) : null),
    eligibility: text(eligibilityValue), customizableFields: ['annualDays', 'attendanceDaysPerCredit', 'maxAccumulation', 'eligibility'],
  };
  return row('LEAVE', 'Sheet1', entry.rowNumber, `LEAVE:${values.code}`, values);
}

async function parseRuleWorkbook(buffer, { filename } = {}) {
  const book = await loadWorkbook(buffer), entries = summaryRows(book.getWorksheet('Sheet1') || book.worksheets[0]);
  let section = 'ALLOWANCE';
  const rows = [];
  for (const entry of entries) {
    const label = text(entry.values[1]);
    if (/^deductions$/i.test(label)) { section = 'DEDUCTION'; continue; }
    if (/^staff loans$/i.test(label)) { section = 'LOAN_POLICY'; continue; }
    if (/^leave particulars$/i.test(label)) { section = 'LEAVE'; continue; }
    if (!label || /allowances|other than|interest on staff loans/i.test(label)) continue;
    if (section === 'ALLOWANCE') rows.push(allowanceRule(entry));
    else if (section === 'DEDUCTION') rows.push(deductionRule(entry));
    else if (section === 'LOAN_POLICY') {
      const values = { code: code(label), name: label, customizableFields: ['interestRatePercent', 'maximumAmount', 'maximumMonths'] };
      rows.push(row('LOAN_POLICY', 'Sheet1', entry.rowNumber, `LOAN_POLICY:${values.code}`, values));
    } else if (section === 'LEAVE') rows.push(leaveRule(entry));
  }
  const medical = rows.find(item => item.naturalKey === 'ALLOWANCE:MEDICAL_ALLOWANCE');
  const pf = rows.find(item => item.naturalKey === 'DEDUCTION:PROVIDENT_FUND');
  const payrollDefaults = {};
  if (medical?.values.amount != null) payrollDefaults.medicalAllowanceAmount = medical.values.amount;
  if (pf?.values.percentageValue != null) {
    payrollDefaults.pfEmployeePercent = pf.values.percentageValue;
    if (pf.values.percentageBase) payrollDefaults.pfCalculationBase = pf.values.percentageBase;
  }
  return { schemaVersion: 'rule-workbook-v1', source: source(buffer, filename), rows, payrollDefaults,
    summary: { total: rows.length, valid: rows.filter(item => !item.errors.length).length, invalid: rows.filter(item => item.errors.length).length } };
}

function headerMap(sheet, headerRow) {
  const map = new Map();
  const normalize = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
  sheet.getRow(headerRow).eachCell({ includeEmpty: true }, (cell, column) => { const key = normalize(displayedValue(cell)); if (key) map.set(key, column); });
  return { get: (...aliases) => aliases.map(normalize).map(key => map.get(key)).find(Boolean), map };
}
function dataRows(sheet, headerRow) {
  const rows = [];
  for (let index = headerRow + 1; index <= sheet.rowCount; index++) if (sheet.getRow(index).cellCount) rows.push({ sheetRow: sheet.getRow(index), rowNumber: index });
  return rows;
}
function requiredEmployeeCode(value, errors) {
  const employeeCode = text(value).toUpperCase();
  if (!employeeCode) errors.push('Employee Code is required.');
  return employeeCode;
}

function parseMedical(sheet, annualAmount) {
  if (!sheet) return [];
  const h = headerMap(sheet, 5), employeeCol = h.get('EMP_ID', 'Employee Code'), monthsCol = h.get('Months');
  return dataRows(sheet, 5).flatMap(({ sheetRow, rowNumber }) => {
    const employeeCode = text(displayedValue(sheetRow.getCell(employeeCol))).toUpperCase();
    if (!employeeCode) return [];
    const months = number(displayedValue(sheetRow.getCell(monthsCol))) ?? 12;
    const amount = Math.round(annualAmount / 12 * months);
    const values = { employeeCode, allowanceCode: 'MEDICAL_ALLOWANCE', amount, months, sourceReference: `MEDICAL:${employeeCode}` };
    return [row('EMPLOYEE_ALLOWANCE', sheet.name, rowNumber, `EMPLOYEE_ALLOWANCE:${values.sourceReference}`, values)];
  });
}

function parseLic(sheet) {
  if (!sheet) return [];
  const h = headerMap(sheet, 8), policyCol = h.get('Policy Number'), employeeCol = h.get('Employee Code'), premiumCol = h.get('Total Premium', 'Premium');
  return dataRows(sheet, 8).flatMap(({ sheetRow, rowNumber }) => {
    const policyNumber = text(displayedValue(sheetRow.getCell(policyCol)));
    if (!policyNumber) return [];
    const errors = [], employeeCode = requiredEmployeeCode(employeeCol ? displayedValue(sheetRow.getCell(employeeCol)) : '', errors);
    const values = { employeeCode, policyNumber, deductionAmount: wholeRupees(displayedValue(sheetRow.getCell(premiumCol))), sourceReference: `LIC:${policyNumber}` };
    return [row('LIC_POLICY', sheet.name, rowNumber, `LIC_POLICY:${policyNumber}`, values, [], errors)];
  });
}

function parseFestival(sheet) {
  if (!sheet) return [];
  const h = headerMap(sheet, 3), employeeCol = h.get('ID', 'EMP_ID', 'Employee Code');
  return dataRows(sheet, 3).flatMap(({ sheetRow, rowNumber }) => {
    const employeeCode = text(displayedValue(sheetRow.getCell(employeeCol))).toUpperCase();
    if (!employeeCode) return [];
    const totalAmount = wholeRupees(displayedValue(sheetRow.getCell(h.get('Toatl Amount', 'Total Amount'))));
    const monthlyAmount = wholeRupees(displayedValue(sheetRow.getCell(h.get('Monthly Amount'))));
    const recordedBalanceAmount = wholeRupees(displayedValue(sheetRow.getCell(h.get('balance amount'))));
    const totalInstallments = number(displayedValue(sheetRow.getCell(h.get('Total inst'))));
    const balanceInstallments = number(displayedValue(sheetRow.getCell(h.get('Balance Inst'))));
    const expectedBalanceAmount = monthlyAmount != null && balanceInstallments != null ? Math.round(monthlyAmount * balanceInstallments) : null;
    const errors = [];
    if (expectedBalanceAmount != null && recordedBalanceAmount !== expectedBalanceAmount) errors.push(`Recorded balance ₹${Number(recordedBalanceAmount).toLocaleString('en-IN')} does not match expected ₹${Number(expectedBalanceAmount).toLocaleString('en-IN')}.`);
    const sourceReference = `FESTIVAL:${employeeCode}:${totalAmount}:${totalInstallments}`;
    return [row('FESTIVAL_ADVANCE', sheet.name, rowNumber, `FESTIVAL_ADVANCE:${sourceReference}`, { employeeCode, totalAmount, monthlyAmount, recordedBalanceAmount, expectedBalanceAmount, totalInstallments, balanceInstallments, sourceReference }, [], errors)];
  });
}

function parseLoanSheet(sheet, kind) {
  if (!sheet) return [];
  const h = headerMap(sheet, 3), accountCol = h.get('ACCOUNT NUMBER 15digt', 'Account Number'), employeeCol = h.get('EMP_ID', 'Employee Code'), balanceCol = h.get('BALANCE ASON DATE', 'Main Balance');
  return dataRows(sheet, 3).flatMap(({ sheetRow, rowNumber }) => {
    const accountNumber = text(displayedValue(sheetRow.getCell(accountCol)));
    if (!accountNumber) return [];
    const errors = [], employeeCode = employeeCol ? requiredEmployeeCode(displayedValue(sheetRow.getCell(employeeCol)), errors) : '';
    if (!employeeCol) errors.push('Employee Code column is required for this sheet.');
    const outstanding = number(displayedValue(sheetRow.getCell(balanceCol)));
    const values = { employeeCode, accountNumber, outstandingAmount: outstanding == null ? null : Math.round(Math.abs(outstanding)), sourceReference: `${kind}:${accountNumber}` };
    return [row(kind, sheet.name, rowNumber, `${kind}:${accountNumber}`, values, [], errors)];
  });
}

function parseSimpleAdjustment(sheet, { headerRow, kind, adjustmentCode, name, employeeAliases, amountAliases }) {
  if (!sheet) return [];
  const h = headerMap(sheet, headerRow), employeeCol = h.get(...employeeAliases), amountCol = h.get(...amountAliases);
  if (!employeeCol || !amountCol) return [];
  return dataRows(sheet, headerRow).flatMap(({ sheetRow, rowNumber }) => {
    const employeeCode = text(displayedValue(sheetRow.getCell(employeeCol))).toUpperCase();
    if (!employeeCode) return [];
    const errors = [], amount = wholeRupees(displayedValue(sheetRow.getCell(amountCol)));
    if (!(amount > 0)) errors.push('Amount must be a positive whole-rupee value.');
    const sourceReference = `${adjustmentCode}:${employeeCode}`;
    return [row(kind, sheet.name, rowNumber, `${kind}:${sourceReference}`, { employeeCode, adjustmentCode, name, amount, sourceReference }, [], errors)];
  });
}

async function parseEmployeeFinancialWorkbook(buffer, { filename } = {}) {
  const book = await loadWorkbook(buffer);
  const rulePreview = await parseRuleWorkbook(buffer, { filename });
  const annualMedical = rulePreview.payrollDefaults.medicalAllowanceAmount || 4000;
  const rows = [
    ...parseMedical(book.getWorksheet('Medical Allowance'), annualMedical),
    ...parseSimpleAdjustment(book.getWorksheet('Cashier & Driver Allowance'), { headerRow: 2, kind: 'EMPLOYEE_ALLOWANCE', adjustmentCode: 'CASH_RISK_ALLOWANCE', name: 'Cash risk allowance', employeeAliases: ['EMP_ID', 'Employee Code'], amountAliases: ['riskallow', 'Amount'] }),
    ...parseSimpleAdjustment(book.getWorksheet('Phisicaly Handicapped Allowa'), { headerRow: 3, kind: 'EMPLOYEE_ALLOWANCE', adjustmentCode: 'PHYSICAL_DISABILITY_ALLOWANCE', name: 'Physical disability allowance', employeeAliases: ['EMP_ID', 'Employee Code'], amountAliases: ['Disability Allowance', 'Amount'] }),
    ...parseSimpleAdjustment(book.getWorksheet('Income tax'), { headerRow: 2, kind: 'EMPLOYEE_DEDUCTION', adjustmentCode: 'INCOME_TAX', name: 'Income tax', employeeAliases: ['EMP_ID', 'Employee Code'], amountAliases: ['Amount'] }),
    ...parseSimpleAdjustment(book.getWorksheet('Employees Soceity'), { headerRow: 2, kind: 'EMPLOYEE_DEDUCTION', adjustmentCode: 'EMPLOYEES_SOCIETY', name: 'Employees society', employeeAliases: ['EMP_ID', 'Employee Code'], amountAliases: ['Amount'] }),
    ...parseSimpleAdjustment(book.getWorksheet('Proffession tax'), { headerRow: 3, kind: 'EMPLOYEE_DEDUCTION', adjustmentCode: 'PROFESSION_TAX', name: 'Profession tax', employeeAliases: ['EMP_ID', 'Employee Code'], amountAliases: ['Prof.Tx', 'Amount'] }),
    ...parseLic(book.getWorksheet('LIC Premium')),
    ...parseFestival(book.getWorksheet('Festival Advance')),
    ...parseLoanSheet(book.getWorksheet('Housing Loan'), 'HOUSING_LOAN'),
    ...parseLoanSheet(book.getWorksheet('Vehicle Loan'), 'VEHICLE_LOAN'),
  ];
  return { schemaVersion: 'employee-financial-workbook-v1', source: source(buffer, filename), rows,
    summary: { total: rows.length, valid: rows.filter(item => !item.errors.length).length, invalid: rows.filter(item => item.errors.length).length } };
}

module.exports = { ImportWorkbookError, parseRuleWorkbook, parseEmployeeFinancialWorkbook };
