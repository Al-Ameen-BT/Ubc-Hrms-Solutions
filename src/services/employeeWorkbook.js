'use strict';

const Excel = require('exceljs');
const { PostCadre, PayScale, Organization } = require('../models');
const { normalizeHeader } = require('./csv');

/**
 * Field specifications organized into clear functional groups.
 * Used for template generation, reference guide, and UI inspection.
 */
const EMPLOYEE_FIELD_GROUPS = [
  {
    name: '1. Basic Identity',
    code: 'identity',
    colorHex: '1F4E79', // Dark Navy
    bgHex: 'D9E1F2',    // Soft Blue
    fields: [
      { key: 'empCode', label: 'Employee Code *', required: true, width: 20, example: 'E101', description: 'Unique identifier for employee within the bank.' },
      { key: 'name', label: 'Full Name *', required: true, width: 26, example: 'Jane Doe', description: 'Official full name as per bank records / Aadhaar.' },
      { key: 'dob', label: 'Date of Birth (YYYY-MM-DD)', required: false, width: 22, example: '1990-04-12', description: 'Birth date in standard YYYY-MM-DD format.' },
      { key: 'gender', label: 'Gender (MALE / FEMALE / OTHER)', required: false, width: 24, example: 'FEMALE', dropdown: ['MALE', 'FEMALE', 'OTHER'], description: 'Gender used by applicable leave entitlement rules.' },
      { key: 'educationalQualification', label: 'Educational Qualification *', required: true, width: 28, example: 'B.Com', description: 'Highest verified qualification.' },
      { key: 'educationVerified', label: 'Education Verified * (YES / NO)', required: true, width: 26, example: 'YES', dropdown: ['YES', 'NO'], description: 'Must be YES before controlled onboarding can apply the row.' },
    ],
  },
  {
    name: '2. Cadre & Joining',
    code: 'cadre',
    colorHex: '0E6251', // Dark Teal
    bgHex: 'DDEBF7',    // Soft Teal/Cyan
    fields: [
      { key: 'doj', label: 'Date of Joining * (YYYY-MM-DD)', required: true, width: 26, example: '2015-06-01', description: 'First date of joining service in YYYY-MM-DD format.' },
      { key: 'doa', label: 'Date of Appointment (YYYY-MM-DD)', required: false, width: 26, example: '2015-06-01', description: 'Date appointed to present post cadre in YYYY-MM-DD format.' },
      { key: 'employmentType', label: 'Employment Type (REGULAR / PART_TIME_CONTINGENT)', required: false, width: 34, example: 'REGULAR', dropdown: ['REGULAR', 'PART_TIME_CONTINGENT'], description: 'REGULAR or PART_TIME_CONTINGENT (defaults to REGULAR).' },
      { key: 'postCode', label: 'Post Code * (See Reference sheet)', required: true, width: 30, example: 'CLERK', description: 'Must match an active Post Cadre code in your bank.' },
      { key: 'branchCode', label: 'Branch Code', required: false, width: 20, example: 'HO', description: 'Required in permission mode; must match an active branch.' },
      { key: 'departmentCode', label: 'Department Code', required: false, width: 22, example: 'ACCOUNTS', description: 'Required in permission mode; must belong to the selected branch.' },
      { key: 'positionCode', label: 'Position Code', required: false, width: 22, example: 'CLERK-01', description: 'Required in permission mode; must belong to the selected department and have capacity.' },
    ],
  },
  {
    name: '3. Salary & Position',
    code: 'salary',
    colorHex: '1E4620', // Dark Green
    bgHex: 'E2EFDA',    // Soft Green
    fields: [
      { key: 'payScaleCode', label: 'Pay Scale Code (Optional)', required: false, width: 26, example: 'SG_JR_CLERK-REV', description: 'Must match an active Pay Scale code in your bank (leave blank for direct-pay).' },
      { key: 'currentBasicPay', label: 'Current Basic Pay (₹)', required: false, width: 22, example: '20000', description: 'Current monthly basic pay amount in whole rupees.' },
      { key: 'employmentStatus', label: 'Employment Status (ACTIVE / INACTIVE)', required: false, width: 30, example: 'ACTIVE', dropdown: ['ACTIVE', 'INACTIVE'], description: 'ACTIVE or INACTIVE (defaults to ACTIVE).' },
      { key: 'riskAllowance', label: 'Risk Allowance (₹)', required: false, width: 20, example: '0', description: 'Monthly risk allowance in rupees.' },
      { key: 'otherAllowance', label: 'Other Allowance (₹)', required: false, width: 20, example: '0', description: 'Monthly other allowance in rupees.' },
    ],
  },
  {
    name: '4. Contact & Statutory Details',
    code: 'contact',
    colorHex: '374151',
    bgHex: 'E5E7EB',
    fields: [
      { key: 'officeEmail', label: 'Office Email', required: false, width: 28, example: 'employee@bank.example', description: 'Official work email.' },
      { key: 'personalEmail', label: 'Personal Email', required: false, width: 28, example: 'employee@example.com', description: 'Personal contact email.' },
      { key: 'panNumber', label: 'PAN Number', required: false, width: 18, example: 'AAAAA0000A', description: 'PAN stored under sensitive-data controls.' },
      { key: 'aadhaarNumber', label: 'Aadhaar Number', required: false, width: 20, example: '123456789012', description: 'Aadhaar stored under sensitive-data controls.' },
      { key: 'uanNumber', label: 'UAN Number', required: false, width: 20, example: '100000000000', description: 'Universal Account Number.' },
      { key: 'pfNumber', label: 'PF Number', required: false, width: 20, example: 'PF-001', description: 'Provident-fund account reference.' },
      { key: 'designation', label: 'Designation', required: false, width: 24, example: 'Clerk', description: 'Display designation; authoritative position is selected separately.' },
      { key: 'bankName', label: 'Salary Bank Name', required: false, width: 24, example: 'Co-operative Bank', description: 'Salary-credit bank.' },
      { key: 'bankAccountNumber', label: 'Salary Account Number', required: false, width: 24, example: '001234567890', description: 'Enter as text to preserve leading zeros.' },
      { key: 'bankIfsc', label: 'Salary Account IFSC', required: false, width: 20, example: 'ABCD0123456', description: 'Salary-credit IFSC.' },
    ],
  },
  {
    name: '5. Self-Service Login',
    code: 'login',
    colorHex: '4338CA',
    bgHex: 'E0E7FF',
    fields: [
      { key: 'createLogin', label: 'Create Login (YES / NO)', required: false, width: 24, example: 'YES', dropdown: ['YES', 'NO'], description: 'YES creates an employee self-service account only.' },
      { key: 'loginEmail', label: 'Login Email', required: false, width: 30, example: 'employee@bank.example', description: 'Required when Create Login is YES; imported accounts always receive the protected EMPLOYEE own-record role.' },
    ],
  },
  {
    name: '6. Deductions & Welfare',
    code: 'deductions',
    colorHex: '7D4E00', // Dark Amber
    bgHex: 'FFF2CC',    // Soft Amber
    fields: [
      { key: 'vpfPercent', label: 'VPF Percent (%)', required: false, width: 18, example: '0', description: 'Voluntary PF percentage (0 to 100).' },
      { key: 'welfareFundOptIn', label: 'Welfare Fund Opt-In (TRUE / FALSE)', required: false, width: 28, example: 'FALSE', dropdown: ['TRUE', 'FALSE'], description: 'TRUE or FALSE (defaults to FALSE).' },
      { key: 'welfareFundAmount', label: 'Welfare Fund Amount (₹)', required: false, width: 24, example: '0', description: 'Monthly welfare deduction override in rupees.' },
      { key: 'gsliOptIn', label: 'GSLI Opt-In (TRUE / FALSE)', required: false, width: 24, example: 'TRUE', dropdown: ['TRUE', 'FALSE'], description: 'TRUE or FALSE (blank auto-derives from joining date).' },
      { key: 'gsliAmount', label: 'GSLI Amount (₹)', required: false, width: 20, example: '150', description: 'Monthly GSLI deduction override in rupees.' },
      { key: 'ptAmount', label: 'Professional Tax PT (₹)', required: false, width: 24, example: '200', description: 'Monthly professional tax slab in rupees.' },
    ],
  },
  {
    name: '7. Income Tax Regime',
    code: 'tax',
    colorHex: '4A235A', // Dark Purple
    bgHex: 'F2DCDB',    // Soft Rose/Purple
    fields: [
      { key: 'taxRegime', label: 'Tax Regime (NEW / OLD)', required: false, width: 22, example: 'NEW', dropdown: ['NEW', 'OLD'], description: 'NEW or OLD regime (defaults to NEW).' },
      { key: 'taxOtherDeductions', label: 'Tax Other Deductions 80C/80D (₹)', required: false, width: 28, example: '0', description: 'Annual 80C/80D deductions in rupees (OLD regime only).' },
    ],
  },
  {
    name: '8. Office Information', code: 'office', colorHex: '334155', bgHex: 'E2E8F0', fields: [
      { key: 'pensionNumber', label: 'Pension No', width: 18, description: 'Optional pension reference.' },
      { key: 'ptNumber', label: 'PT No', width: 18, description: 'Optional professional-tax reference.' },
      { key: 'esicNumber', label: 'ESIC No', width: 18, description: 'Optional ESIC reference.' },
      { key: 'lwfNumber', label: 'LWF No', width: 18, description: 'Optional labour-welfare-fund reference.' },
      { key: 'edliNumber', label: 'EDLI No', width: 18, description: 'Optional EDLI reference.' },
      { key: 'vcNumber', label: 'VC No', width: 18, description: 'Optional VC reference.' },
      { key: 'ppNumber', label: 'PP No', width: 18, description: 'Optional passport/reference number.' },
      { key: 'dlNumber', label: 'DL No', width: 18, description: 'Optional driving-licence number.' },
      { key: 'rcNumber', label: 'RC No', width: 18, description: 'Optional registration-certificate number.' },
      { key: 'giNumber', label: 'GI No', width: 18, description: 'Optional group-insurance reference.' },
      { key: 'payMode', label: 'Pay Mode', width: 18, description: 'Salary payment mode.' },
      { key: 'salaryBankName', label: 'Bank', width: 24, description: 'Salary-credit bank name.' },
      { key: 'cbsBranchCode', label: 'CBS Branch Code', width: 20, description: 'Exact branch code used in CBS software.' },
      { key: 'cbsAccountType', label: 'CBS Account Type', width: 20, description: 'Exact account type used in CBS software.' },
      { key: 'salaryAccountNumber', label: 'Account No', width: 24, description: 'Salary account number; enter as text.' },
      { key: 'pfApplicationNumber', label: 'PF Application No', width: 22, description: 'Optional PF application/reference number; not an applicability flag.' },
      { key: 'selfHandicap', label: 'Self Handicap (YES / NO)', width: 24, dropdown: ['YES', 'NO'], description: 'Employee disability declaration.' },
      { key: 'familyHandicap', label: 'Family Handicap (YES / NO)', width: 26, dropdown: ['YES', 'NO'], description: 'Family disability declaration.' },
      { key: 'handicapRemark', label: 'Handicap Remark', width: 30, description: 'Supporting disability remark.' },
      { key: 'ptApplicationNumber', label: 'PT Application No', width: 22, description: 'Optional PT application/reference number.' },
      { key: 'esicApplicationNumber', label: 'ESIC Application No', width: 22, description: 'Optional ESIC application/reference number.' },
      { key: 'lwfApplicationNumber', label: 'LWF Application No', width: 22, description: 'Optional LWF application/reference number.' },
      { key: 'vpfApplicationNumber', label: 'VPF Application No', width: 22, description: 'Optional VPF application/reference number.' },
      { key: 'vpfDeclaredAmount', label: 'VPF Amount', width: 18, description: 'Declared VPF amount; does not bypass payroll approval.' },
      { key: 'vpfDeclaredPercent', label: 'VPF Percentage', width: 18, description: 'Declared VPF percentage from 0 to 100.' },
    ],
  },
  {
    name: '9. Service Information', code: 'service', colorHex: '155E75', bgHex: 'CFFAFE', fields: [
      { key: 'probationPeriodDays', label: 'Probation Period (Days)', width: 24, description: 'Recorded probation period in whole days.' },
      { key: 'probationDate', label: 'Probation Date (YYYY-MM-DD)', width: 26, description: 'Recorded probation milestone date.' },
      { key: 'confirmationPeriodDays', label: 'Confirmation Period (Days)', width: 26, description: 'Recorded confirmation period in whole days.' },
      { key: 'confirmationDate', label: 'Confirmation Date (YYYY-MM-DD)', width: 28, description: 'Confirmation date.' },
      { key: 'lastIncrementDate', label: 'Last Increment Date (YYYY-MM-DD)', width: 30, description: 'Last completed increment date.' },
      { key: 'lastPromotionDate', label: 'Last Promotion Date (YYYY-MM-DD)', width: 30, description: 'Last promotion date.' },
      { key: 'lastTransferDate', label: 'Last Transfer Date (YYYY-MM-DD)', width: 30, description: 'Last transfer date.' },
      { key: 'seniorityDate', label: 'Seniority Date (YYYY-MM-DD)', width: 26, description: 'Seniority effective date.' },
      { key: 'seniorityNumber', label: 'Seniority No', width: 18, description: 'Seniority-list reference.' },
      { key: 'retirementDate', label: 'Retirement Date (YYYY-MM-DD)', width: 28, description: 'Expected or recorded retirement date.' },
      { key: 'resignationDate', label: 'Resignation Date (YYYY-MM-DD)', width: 28, description: 'Required only when the employee resigned.' },
      { key: 'resignationReason', label: 'Resignation Reason', width: 32, description: 'Reason for leaving service.' },
      { key: 'serviceLastDate', label: 'Service Last Date (YYYY-MM-DD)', width: 28, description: 'Last date in bank service.' },
      { key: 'pfJoiningDate', label: 'PF Joining Date (YYYY-MM-DD)', width: 28, description: 'Employee PF joining date.' },
      { key: 'pensionJoiningDate', label: 'Pension Joining Date (YYYY-MM-DD)', width: 32, description: 'Pension joining date.' },
      { key: 'pfExitDate', label: 'PF Exit Date (YYYY-MM-DD)', width: 26, description: 'PF exit date for a former employee.' },
      { key: 'pensionExitDate', label: 'Pension Exit Date (YYYY-MM-DD)', width: 30, description: 'Pension exit date for a former employee.' },
    ],
  },
  {
    name: '10. Address & Contact', code: 'addresses', colorHex: '3F3F46', bgHex: 'F4F4F5', fields: [
      ...['Residential', 'Permanent', 'Correspondence'].flatMap((label) => {
        const prefix = label.toLowerCase();
        return [
          { key: `${prefix}Address1`, label: `${label} Address 1`, width: 28, description: `${label} address line 1.` },
          { key: `${prefix}Address2`, label: `${label} Address 2`, width: 28, description: `${label} address line 2.` },
          { key: `${prefix}Address3`, label: `${label} Address 3`, width: 28, description: `${label} address line 3.` },
          { key: `${prefix}Landmark`, label: `${label} Landmark`, width: 24, description: `${label} landmark.` },
          { key: `${prefix}Area`, label: `${label} Area`, width: 20, description: `${label} area.` },
          { key: `${prefix}City`, label: `${label} City`, width: 20, description: `${label} city.` },
          { key: `${prefix}Taluka`, label: `${label} Taluka`, width: 20, description: `${label} taluka.` },
          { key: `${prefix}State`, label: `${label} State`, width: 20, description: `${label} state.` },
          { key: `${prefix}Email`, label: `${label} Email`, width: 28, description: `${label} email address.` },
          { key: `${prefix}Website`, label: `${label} Website`, width: 30, description: `${label} website (HTTP/HTTPS).` },
          { key: `${prefix}FaxNumber`, label: `${label} Fax No`, width: 20, description: `${label} fax number.` },
          { key: `${prefix}ContactNumber`, label: `${label} Contact No`, width: 22, description: `${label} contact number.` },
        ];
      }),
    ],
  },
];

const FLAT_FIELDS = EMPLOYEE_FIELD_GROUPS.flatMap((group) =>
  group.fields.map((f) => ({ ...f, groupName: group.name, groupBg: group.bgHex, groupColor: group.colorHex }))
);
const GENERATED_HEADER_KEYS = new Map(FLAT_FIELDS.map(field => [normalizeHeader(field.label), field.key]));

/**
 * Format Excel cell value to string or clean value.
 */
function cellToString(val) {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'object') {
    if (val.text !== undefined) return String(val.text).trim();
    // Formula results are not authoritative import input.
    if (val.formula !== undefined || val.sharedFormula !== undefined) return '';
    if (val.result !== undefined) return String(val.result).trim();
  }
  return String(val).trim();
}

/**
 * Generates a styled, organized Excel (.xlsx) workbook for employee bulk import.
 * Contains:
 * - Sheet 1: "Employee Master" (with category header bands, clear column headers, sample rows, dropdown validations)
 * - Sheet 2: "Reference Codes & Guide" (listing the bank's active Post Codes and Pay Scales)
 */
async function writeEmployeeBulkTemplate({ organizationId }) {
  const org = organizationId ? await Organization.findByPk(organizationId, { attributes: ['id', 'name', 'code'] }) : null;
  const posts = organizationId ? await PostCadre.findAll({ where: { organizationId }, order: [['code', 'ASC']] }) : [];
  const scales = organizationId ? await PayScale.findAll({ where: { organizationId }, order: [['code', 'ASC']] }) : [];

  const workbook = new Excel.Workbook();
  workbook.creator = 'UCB HRMS';
  workbook.lastModifiedBy = 'UCB HRMS';
  workbook.created = new Date();
  workbook.modified = new Date();

  // ─────────────────────────────────────────────────────────────────────────────
  // SHEET 1: Employee Master
  // ─────────────────────────────────────────────────────────────────────────────
  const sheet = workbook.addWorksheet('Employee Master', {
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  // Row 1: Category Header Band (Group Banners)
  let colIndex = 1;
  for (const group of EMPLOYEE_FIELD_GROUPS) {
    const startCol = colIndex;
    const endCol = colIndex + group.fields.length - 1;
    sheet.mergeCells(1, startCol, 1, endCol);
    const cell = sheet.getCell(1, startCol);
    cell.value = group.name.toUpperCase();
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${group.colorHex}` },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF000000' } },
      bottom: { style: 'medium', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    };
    colIndex = endCol + 1;
  }
  sheet.getRow(1).height = 24;

  // Row 2: Field Column Headers
  const headerRow = sheet.getRow(2);
  headerRow.height = 30;
  FLAT_FIELDS.forEach((field, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = field.label;
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: field.required ? 'FF9C0006' : 'FF1F2937' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${field.groupBg}` },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'medium', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    };
  });

  // Set column widths and text format
  sheet.columns = FLAT_FIELDS.map((f) => ({
    width: f.width || 22,
    style: { numFmt: '@' }, // Format as Text
  }));

  // Sample Rows (Rows 3 & 4)
  const defaultPostCode = posts[0]?.code || 'SG_JR_CLERK';
  const defaultScaleCode = scales[0]?.code || '';

  const sampleRows = [
    {
      empCode: 'E101',
      name: 'Jane Doe',
      dob: '1990-04-12',
      doj: '2015-06-01',
      doa: '2015-06-01',
      employmentType: 'REGULAR',
      postCode: defaultPostCode,
      payScaleCode: defaultScaleCode,
      currentBasicPay: '20000',
      employmentStatus: 'ACTIVE',
      riskAllowance: '0',
      otherAllowance: '0',
      vpfPercent: '0',
      welfareFundOptIn: 'FALSE',
      welfareFundAmount: '0',
      gsliOptIn: 'TRUE',
      gsliAmount: '150',
      ptAmount: '200',
      taxRegime: 'NEW',
      taxOtherDeductions: '0',
    },
    {
      empCode: 'E102',
      name: 'K. Ramanathan',
      dob: '1985-11-25',
      doj: '2012-08-10',
      doa: '2012-08-10',
      employmentType: 'REGULAR',
      postCode: posts[1]?.code || defaultPostCode,
      payScaleCode: scales[1]?.code || defaultScaleCode,
      currentBasicPay: '38500',
      employmentStatus: 'ACTIVE',
      riskAllowance: '500',
      otherAllowance: '250',
      vpfPercent: '5',
      welfareFundOptIn: 'TRUE',
      welfareFundAmount: '100',
      gsliOptIn: 'TRUE',
      gsliAmount: '200',
      ptAmount: '200',
      taxRegime: 'NEW',
      taxOtherDeductions: '0',
    },
  ];

  sampleRows.forEach((rowObj, rowIdx) => {
    const rowNum = 3 + rowIdx;
    const row = sheet.getRow(rowNum);
    row.height = 20;
    FLAT_FIELDS.forEach((f, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = rowObj[f.key] || '';
      cell.font = { name: 'Arial', size: 9 };
      cell.alignment = { vertical: 'middle', horizontal: ['empCode', 'postCode', 'payScaleCode', 'dob', 'doj', 'doa', 'taxRegime'].includes(f.key) ? 'center' : 'left' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    });
  });

  // Data Validation Dropdowns for rows 3 to 1000
  FLAT_FIELDS.forEach((field, colIdx) => {
    if (field.dropdown) {
      const colLetter = sheet.getColumn(colIdx + 1).letter;
      for (let r = 3; r <= 1000; r++) {
        sheet.getCell(`${colLetter}${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${field.dropdown.join(',')}"`],
          showErrorMessage: true,
          errorTitle: `Invalid ${field.label}`,
          error: `Please choose one of: ${field.dropdown.join(', ')}`,
        };
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SHEET 2: Reference Codes & Field Guide
  // ─────────────────────────────────────────────────────────────────────────────
  const refSheet = workbook.addWorksheet('Reference Codes & Guide');
  refSheet.columns = [
    { width: 24 },
    { width: 36 },
    { width: 16 },
    { width: 28 },
    { width: 45 },
  ];

  // Header Banner
  refSheet.mergeCells('A1:E1');
  const refTitle = refSheet.getCell('A1');
  refTitle.value = `${(org?.name || 'ORGANISATION').toUpperCase()} · EMPLOYEE IMPORT REFERENCE CODES`;
  refTitle.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  refTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  refTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  refSheet.getRow(1).height = 28;

  refSheet.mergeCells('A2:E2');
  const refSub = refSheet.getCell('A2');
  refSub.value = 'Use the exact Post Codes and Pay Scale Codes defined below when filling in Sheet 1 (Employee Master).';
  refSub.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF4B5563' } };
  refSub.alignment = { horizontal: 'center', vertical: 'middle' };
  refSheet.getRow(2).height = 18;

  let curRow = 4;

  // 1. Post Cadres Table
  refSheet.mergeCells(`A${curRow}:B${curRow}`);
  const postHead = refSheet.getCell(`A${curRow}`);
  postHead.value = '1. ACTIVE POST CODES (Required in Column G)';
  postHead.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0E6251' } };
  curRow++;

  const postCols = refSheet.getRow(curRow);
  postCols.getCell(1).value = 'Post Code (Use in Sheet 1)';
  postCols.getCell(2).value = 'Post / Cadre Description';
  [1, 2].forEach((c) => {
    const cell = postCols.getCell(c);
    cell.font = { bold: true, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  curRow++;

  if (posts.length) {
    posts.forEach((p) => {
      const r = refSheet.getRow(curRow);
      r.getCell(1).value = p.code;
      r.getCell(1).font = { name: 'Courier New', size: 9, bold: true };
      r.getCell(2).value = p.name;
      r.getCell(2).font = { size: 9 };
      [1, 2].forEach((c) => {
        r.getCell(c).border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
      });
      curRow++;
    });
  } else {
    refSheet.getRow(curRow).getCell(1).value = 'No Post Cadres configured yet.';
    refSheet.getRow(curRow).getCell(1).font = { italic: true, size: 9, color: { argb: 'FF9CA3AF' } };
    curRow++;
  }
  curRow += 2;

  // 2. Pay Scales Table
  refSheet.mergeCells(`A${curRow}:B${curRow}`);
  const scaleHead = refSheet.getCell(`A${curRow}`);
  scaleHead.value = '2. ACTIVE PAY SCALE CODES (Optional in Column H)';
  scaleHead.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E4620' } };
  curRow++;

  const scaleCols = refSheet.getRow(curRow);
  scaleCols.getCell(1).value = 'Pay Scale Code';
  scaleCols.getCell(2).value = 'Pay Scale Details';
  [1, 2].forEach((c) => {
    const cell = scaleCols.getCell(c);
    cell.font = { bold: true, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  curRow++;

  if (scales.length) {
    scales.forEach((s) => {
      const r = refSheet.getRow(curRow);
      r.getCell(1).value = s.code;
      r.getCell(1).font = { name: 'Courier New', size: 9, bold: true };
      r.getCell(2).value = s.name || s.scaleExpression || 'Standard Scale';
      r.getCell(2).font = { size: 9 };
      [1, 2].forEach((c) => {
        r.getCell(c).border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
      });
      curRow++;
    });
  } else {
    refSheet.getRow(curRow).getCell(1).value = 'No Pay Scales configured yet (leave Column H blank).';
    refSheet.getRow(curRow).getCell(1).font = { italic: true, size: 9, color: { argb: 'FF9CA3AF' } };
    curRow++;
  }
  curRow += 2;

  // 3. Field Definitions Table
  refSheet.mergeCells(`A${curRow}:E${curRow}`);
  const fieldHead = refSheet.getCell(`A${curRow}`);
  fieldHead.value = '3. DATA STRUCTURE GUIDE & FIELD SPECIFICATIONS';
  fieldHead.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F4E79' } };
  curRow++;

  const guideCols = refSheet.getRow(curRow);
  const guideTitles = ['Section Group', 'Field Key', 'Mandatory?', 'Format / Allowed Values', 'Description / Rule'];
  guideTitles.forEach((title, idx) => {
    const cell = guideCols.getCell(idx + 1);
    cell.value = title;
    cell.font = { bold: true, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F7' } };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  curRow++;

  FLAT_FIELDS.forEach((f) => {
    const r = refSheet.getRow(curRow);
    r.getCell(1).value = f.groupName;
    r.getCell(1).font = { size: 9, bold: true, color: { argb: `FF${f.groupColor}` } };
    r.getCell(2).value = f.key;
    r.getCell(2).font = { name: 'Courier New', size: 9 };
    r.getCell(3).value = f.required ? 'YES *' : 'Optional';
    r.getCell(3).font = { size: 9, bold: f.required, color: { argb: f.required ? 'FF9C0006' : 'FF4B5563' } };
    r.getCell(4).value = f.dropdown ? f.dropdown.join(' / ') : f.example ? `e.g. ${f.example}` : 'Text';
    r.getCell(4).font = { size: 9 };
    r.getCell(5).value = f.description;
    r.getCell(5).font = { size: 9 };
    for (let c = 1; c <= 5; c++) {
      r.getCell(c).border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
    }
    curRow++;
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Parses an uploaded .xlsx buffer into normalized employee row objects.
 */
async function parseEmployeeWorkbook(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Workbook must be a valid Buffer.');
  }
  const workbook = new Excel.Workbook();
  await workbook.xlsx.load(buffer);

  // Use "Employee Master" sheet, or fallback to first worksheet
  const sheet = workbook.getWorksheet('Employee Master') || workbook.worksheets[0];
  if (!sheet) {
    throw new Error('Workbook has no worksheets.');
  }

  // Scan rows 1 to 5 to find header row containing "empCode" or "Employee Code"
  let headerRowIndex = -1;
  let headers = [];
  for (let r = 1; r <= Math.min(5, sheet.rowCount); r++) {
    const row = sheet.getRow(r);
    const rowValues = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      rowValues.push(cellToString(cell.value));
    });
    const normalized = rowValues.map(value => {
      const header = normalizeHeader(value);
      return GENERATED_HEADER_KEYS.get(header) || header;
    });
    if (normalized.includes('empCode')) {
      headerRowIndex = r;
      headers = normalized;
      break;
    }
  }

  if (headerRowIndex === -1 || !headers.length) {
    throw new Error('Could not find header row. Required header "Employee Code" or "empCode" was not found.');
  }

  const rows = [];
  for (let r = headerRowIndex + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    // Check if row is empty
    let hasData = false;
    const obj = {};
    headers.forEach((key, cIdx) => {
      if (!key) return;
      const cellVal = cellToString(row.getCell(cIdx + 1).value);
      if (cellVal) hasData = true;
      obj[key] = cellVal;
    });

    if (!hasData) continue;
    // Skip comment lines or total lines
    const firstVal = String(obj.empCode || '').trim();
    if (firstVal.startsWith('#') || firstVal.toUpperCase() === 'TOTAL' || firstVal.toUpperCase().startsWith('GRAND TOTAL')) continue;

    rows.push(obj);
  }

  return rows;
}

module.exports = {
  EMPLOYEE_FIELD_GROUPS,
  FLAT_FIELDS,
  writeEmployeeBulkTemplate,
  parseEmployeeWorkbook,
};
