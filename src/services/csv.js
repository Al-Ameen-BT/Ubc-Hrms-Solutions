'use strict';

/**
 * Enterprise CSV Generator & Parser for UCB HRMS & Payroll.
 *
 * Capabilities:
 * - Well-structured layouts with formal Title/Header metadata blocks.
 * - Human-readable, descriptive column headers with unit specifications.
 * - Automated summary / Totals row at the bottom for financial reconciliation.
 * - UTF-8 Byte Order Mark (BOM) inclusion for flawless Microsoft Excel rendering.
 * - Defensive formula injection (DDE) sanitization for spreadsheet security.
 * - Smart header normalization in parseCsv supporting both friendly and camelCase keys.
 * - Comment line support (ignoring lines starting with '#').
 */

const HEADER_ALIASES = {
  // Employee Bulk Import
  'empcode': 'empCode',
  'employee code': 'empCode',
  'employee id': 'empCode',
  'emp id': 'empCode',
  'code': 'empCode',

  'name': 'name',
  'full name': 'name',
  'employee name': 'name',
  'emp name': 'name',

  'dob': 'dob',
  'date of birth': 'dob',
  'birth date': 'dob',
  'birthdate': 'dob',

  'doj': 'doj',
  'date of joining': 'doj',
  'joining date': 'doj',
  'joiningdate': 'doj',

  'pan no': 'panNumber', 'panno': 'panNumber',
  'adhar no': 'aadhaarNumber', 'adharno': 'aadhaarNumber', 'aadhaar no': 'aadhaarNumber',
  'uan no': 'uanNumber', 'uanno': 'uanNumber', 'pf no': 'pfNumber', 'pfno': 'pfNumber',
  'pension no': 'pensionNumber', 'pt no': 'ptNumber', 'esic no': 'esicNumber',
  'lwf no': 'lwfNumber', 'edli no': 'edliNumber', 'vc no': 'vcNumber',
  'pp no': 'ppNumber', 'dl no': 'dlNumber', 'rc no': 'rcNumber', 'gi no': 'giNumber',
  'pay mode': 'payMode', 'bank': 'salaryBankName', 'branch': 'cbsBranchCode',
  'cbs branch code': 'cbsBranchCode', 'account type': 'cbsAccountType', 'cbs account type': 'cbsAccountType',
  'account no': 'salaryAccountNumber', 'accountno': 'salaryAccountNumber',
  'pf appl': 'pfApplicationNumber', 'pfappl': 'pfApplicationNumber', 'pf application no': 'pfApplicationNumber',
  'pt appl': 'ptApplicationNumber', 'ptappl': 'ptApplicationNumber', 'pt application no': 'ptApplicationNumber',
  'esic appl': 'esicApplicationNumber', 'esicappl': 'esicApplicationNumber', 'esic application no': 'esicApplicationNumber',
  'lwf appl': 'lwfApplicationNumber', 'lwfappl': 'lwfApplicationNumber', 'lwf application no': 'lwfApplicationNumber',
  'vpf appl': 'vpfApplicationNumber', 'vpfappl': 'vpfApplicationNumber', 'vpf application no': 'vpfApplicationNumber',
  'self handicap': 'selfHandicap', 'family handicap': 'familyHandicap', 'handicap remark': 'handicapRemark',
  'vpf amt': 'vpfDeclaredAmount', 'vpf amount': 'vpfDeclaredAmount',
  'vpf perc': 'vpfDeclaredPercent', 'vpfperc': 'vpfDeclaredPercent', 'vpf percentage': 'vpfDeclaredPercent',

  'probation period': 'probationPeriodDays', 'probation period days': 'probationPeriodDays',
  'probation date': 'probationDate', 'confirm period': 'confirmationPeriodDays',
  'confirmation period days': 'confirmationPeriodDays', 'confirmation date': 'confirmationDate',
  'last increment date': 'lastIncrementDate', 'last promotion date': 'lastPromotionDate',
  'last transfer date': 'lastTransferDate', 'seniority date': 'seniorityDate',
  'seniority no': 'seniorityNumber', 'retirement date': 'retirementDate',
  'resignation date': 'resignationDate', 'resign reason': 'resignationReason',
  'resignation reason': 'resignationReason', 'service last date': 'serviceLastDate',
  'pf joining date': 'pfJoiningDate', 'pension joining date': 'pensionJoiningDate',
  'pf exit date': 'pfExitDate', 'pension exit date': 'pensionExitDate',

  'doa': 'doa',
  'date of appointment': 'doa',
  'appointment date': 'doa',

  'employmenttype': 'employmentType',
  'employment type': 'employmentType',

  'postcode': 'postCode',
  'post code': 'postCode',
  'designation code': 'postCode',

  'payscalecode': 'payScaleCode',
  'pay scale code': 'payScaleCode',
  'scale code': 'payScaleCode',

  'currentbasicpay': 'currentBasicPay',
  'current basic pay': 'currentBasicPay',
  'basic pay': 'currentBasicPay',
  'basic': 'currentBasicPay',

  'employmentstatus': 'employmentStatus',
  'employment status': 'employmentStatus',
  'status': 'employmentStatus',

  'riskallowance': 'riskAllowance',
  'risk allowance': 'riskAllowance',

  'otherallowance': 'otherAllowance',
  'other allowance': 'otherAllowance',

  'vpfpercent': 'vpfPercent',
  'vpf percent': 'vpfPercent',
  'vpf %': 'vpfPercent',

  'welfarefundoptin': 'welfareFundOptIn',
  'welfare fund opt in': 'welfareFundOptIn',
  'welfare fund opt-in': 'welfareFundOptIn',

  'welfarefundamount': 'welfareFundAmount',
  'welfare fund amount': 'welfareFundAmount',

  'gslioptin': 'gsliOptIn',
  'gsli opt in': 'gsliOptIn',
  'gsli opt-in': 'gsliOptIn',

  'gsliamount': 'gsliAmount',
  'gsli amount': 'gsliAmount',

  'ptamount': 'ptAmount',
  'professional tax': 'ptAmount',
  'professional tax pt': 'ptAmount',
  'pt': 'ptAmount',

  'taxregime': 'taxRegime',
  'tax regime': 'taxRegime',

  'taxotherdeductions': 'taxOtherDeductions',
  'tax other deductions': 'taxOtherDeductions',
  'other deductions': 'taxOtherDeductions',
  '80c/80d deductions': 'taxOtherDeductions',

  // Pay Scale Revision
  'postname': 'postName',
  'post name': 'postName',
  'post name / cadre': 'postName',
  'currentscalecode': 'currentScaleCode',
  'current scale code': 'currentScaleCode',
  'currentscaleexpression': 'currentScaleExpression',
  'current scale expression': 'currentScaleExpression',
  'payabledays': 'payableDays',
  'payable days': 'payableDays',
  'monthdays': 'monthDays',
  'month days': 'monthDays',
  'newscaleexpression': 'newScaleExpression',
  'new scale expression': 'newScaleExpression',
};

function normalizeHeader(raw) {
  const s = String(raw || '')
    .trim()
    .replace(/^[\uFEFF]/, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[*#₹%]/g, '')
    .replace(/[\s/_-]+/g, ' ')
    .trim();
  if (HEADER_ALIASES[s]) return HEADER_ALIASES[s];
  const friendlyContact = s.match(/^(residential|permanent|correspondence) (address [123]|landmark|area|city|taluka|state|email|website|fax no|contact no)$/);
  if (friendlyContact) {
    const suffix = friendlyContact[2].replace(/ (\d)$/, '$1').replace('fax no', 'fax number').replace('contact no', 'contact number');
    return friendlyContact[1] + suffix.replace(/(?:^|\s)(.)/g, (_, char) => char.toUpperCase());
  }
  const legacyContact = s.match(/^(resaddr|rescontact|peraddr|percontact|coraddr|corcontact) (address[123]|landmark|area|city|taluka|state|emailid|website|faxno|contactno)$/);
  if (legacyContact) {
    const prefix = legacyContact[1].startsWith('res') ? 'residential' : legacyContact[1].startsWith('per') ? 'permanent' : 'correspondence';
    const suffixes = { emailid: 'Email', faxno: 'FaxNumber', contactno: 'ContactNumber' };
    const suffix = suffixes[legacyContact[2]] || legacyContact[2][0].toUpperCase() + legacyContact[2].slice(1);
    return `${prefix}${suffix}`;
  }
  return raw.trim();
}

/**
 * Sanitizes and quotes a single CSV field value.
 * Protects against CSV formula injection (DDE) when imported into Excel.
 */
function csvField(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);

  // CSV Formula Injection mitigation: if cell begins with =, +, -, @, \t, \r
  // and is NOT a standard numeric value, neutralize it with a single quote.
  if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) {
    s = "'" + s;
  }

  // Double quotes and comma handling
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * Produces a well-structured, formatted CSV string.
 *
 * @param {Array<object>} rows - Array of row records
 * @param {Array<string|object>} columns - Array of keys or column definitions { key, label, format }
 * @param {object} [options]
 * @param {string} [options.title] - Top banner title (e.g. Bank Name)
 * @param {string} [options.subtitle] - Subtitle / Report name
 * @param {string[]} [options.meta] - Key-value metadata items (Period, Date, Status, etc.)
 * @param {string[]} [options.instructions] - Informational guidelines
 * @param {object} [options.totals] - Summary/Totals record for the footer row
 * @param {boolean} [options.includeBom=true] - Prepend UTF-8 Byte Order Mark for Excel
 */
function toCsv(rows, columns, options = {}) {
  const colDefs = (columns || []).map((col) => {
    if (typeof col === 'string') return { key: col, label: col };
    return {
      key: col.key || col.field,
      label: col.label || col.title || col.key,
      format: col.format,
    };
  });

  const lines = [];

  // 1. Report Title & Meta Block
  if (options.title) {
    lines.push(`# ====================================================================================================`);
    lines.push(`# ${options.title.toUpperCase()}`);
    if (options.subtitle) lines.push(`# ${options.subtitle}`);
    if (Array.isArray(options.meta) && options.meta.length) {
      lines.push(`# ${options.meta.join(' | ')}`);
    }
    lines.push(`# ====================================================================================================`);
  }

  // 2. Guidelines & Instructions Block
  if (Array.isArray(options.instructions) && options.instructions.length) {
    if (!options.title) lines.push(`# ====================================================================================================`);
    options.instructions.forEach((ins) => lines.push(`# ${ins}`));
    lines.push(`# ====================================================================================================`);
  }

  // 3. Column Header Row
  lines.push(colDefs.map((c) => csvField(c.label)).join(','));

  // 4. Data Rows
  const dataList = Array.isArray(rows) ? rows : [];
  for (let idx = 0; idx < dataList.length; idx++) {
    const row = dataList[idx];
    const cells = colDefs.map((c) => {
      if (c.key === '__slNo') return idx + 1;
      let val = row[c.key];
      if (c.format && typeof c.format === 'function') {
        val = c.format(val, row, idx);
      }
      return csvField(val);
    });
    lines.push(cells.join(','));
  }

  // 5. Summary / Totals Row
  if (options.totals) {
    const totCells = colDefs.map((c) => {
      const val = options.totals[c.key];
      return csvField(val !== undefined ? val : '');
    });
    lines.push(totCells.join(','));
  }

  const bom = options.includeBom !== false ? '\uFEFF' : '';
  return bom + lines.join('\r\n') + '\r\n';
}

/**
 * Parses CSV text into an array of objects.
 * Handles quotes, commas, newlines, ignores comments starting with '#',
 * and normalizes column headers.
 */
function parseCsv(text) {
  const rawRows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = String(text || '').replace(/^[\uFEFF]/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      field = '';
      rawRows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rawRows.push(row);
  }

  // Filter out comments and blank rows
  const cleanRows = [];
  for (const r of rawRows) {
    if (!r.length || (r.length === 1 && r[0].trim() === '')) continue;
    const firstCell = String(r[0] || '').trim();
    if (firstCell.startsWith('#')) continue;
    cleanRows.push(r);
  }

  if (!cleanRows.length) return [];

  // First non-comment row is the header row
  const rawHeaders = cleanRows[0].map((h) => String(h).trim());
  const normalizedHeaders = rawHeaders.map(normalizeHeader);

  const results = [];
  for (let i = 1; i < cleanRows.length; i++) {
    const r = cleanRows[i];
    const firstCell = String(r[0] || '').trim().toUpperCase();
    // Skip any summary/TOTAL footer row that was left in the CSV
    if (firstCell === 'TOTAL' || firstCell.startsWith('GRAND TOTAL')) continue;

    const obj = {};
    normalizedHeaders.forEach((key, idx) => {
      obj[key] = r[idx] === undefined ? '' : String(r[idx]).trim();
    });
    results.push(obj);
  }

  return results;
}

module.exports = { parseCsv, toCsv, csvField, normalizeHeader };
