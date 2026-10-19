'use strict';

const express = require('express');
const crudRouter = require('./crudFactory');
const { authenticate } = require('../middleware/auth');
const {
  Employee,
  Organization,
  EmployeeServiceHistory,
  EmployeePayHistory,
  RuleReference,
  GovernmentOrder,
  PostCadre,
  PayScale,
  PayStage,
  EmployeeFestivalAdvance,
  EmployeeOverdraft,
  EmployeeRecurringDeposit,
  EmployeeLic,
  EmployeeHousingLoan,
  EmployeeVehicleLoan,
  EmployeeDocument,
  ServiceHistoryDocument,
  EmployeeBankAccount,
} = require('../models');
const documents = require('../services/documents');
const attachments = require('../services/attachments');
const attendance = require('../services/attendance');

const router = express.Router();

const { stageBelongsToOrg } = require('./payScales');
const { assertCanAddEmployee } = require('../services/license');
const { IncrementPolicy, PayFixationPolicy } = require('../models');
const loans = require('../services/loans');
const orgFields = require('../services/orgFields');
const { parseCsv, toCsv } = require('../services/csv');

// ---------------------------------------------------------------------
// Bulk employee creation via CSV. Registered BEFORE the generic crudRouter
// below so these two fixed paths aren't swallowed by its GET/POST /:id
// routes. Posts and pay scales are referenced by CODE in the CSV (not
// database id), since that's what an admin preparing a spreadsheet outside
// the app can actually know.
// ---------------------------------------------------------------------
const BULK_HEADERS = [
  'empCode', 'name', 'dob', 'doj', 'doa', 'employmentType', 'postCode', 'payScaleCode',
  'currentBasicPay', 'employmentStatus', 'riskAllowance', 'otherAllowance', 'vpfPercent',
  'welfareFundOptIn', 'welfareFundAmount', 'gsliOptIn', 'gsliAmount', 'ptAmount',
  'taxRegime', 'taxOtherDeductions',
];
const BULK_EXAMPLE = {
  empCode: 'E101', name: 'Jane Doe', dob: '1990-04-12', doj: '2015-06-01', doa: '2015-06-01',
  employmentType: 'REGULAR', postCode: 'SG_JR_CLERK', payScaleCode: 'SG_JR_CLERK-REV', currentBasicPay: '20000',
  employmentStatus: 'ACTIVE', riskAllowance: '', otherAllowance: '', vpfPercent: '', welfareFundOptIn: 'false',
  welfareFundAmount: '', gsliOptIn: '', gsliAmount: '', ptAmount: '200', taxRegime: 'NEW', taxOtherDeductions: '',
};
const BULK_READERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'DEPARTMENT_HEAD'];
const BULK_WRITERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER'];
const BOOL_TRUE = ['true', '1', 'yes', 'y'];
const BOOL_FALSE = ['false', '0', 'no', 'n', ''];

router.get('/bulk-template.csv', authenticate, (req, res) => {
  if (!BULK_READERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot download this.' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="employee-bulk-upload-template.csv"');
  res.send(toCsv([BULK_EXAMPLE], BULK_HEADERS));
});

function parseBoolCell(v, fieldName, rowErrors) {
  const s = String(v || '').trim().toLowerCase();
  if (BOOL_TRUE.includes(s)) return true;
  if (BOOL_FALSE.includes(s)) return false;
  rowErrors.push(`${fieldName}: "${v}" is not a recognised yes/no value`);
  return undefined;
}
function parseTriboolCell(v) {
  const s = String(v || '').trim().toLowerCase();
  if (BOOL_TRUE.includes(s)) return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false;
  return null; // blank/unrecognised = automatic
}

router.post('/bulk-import', authenticate, async (req, res) => {
  if (!BULK_WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot bulk-create employees.' });
  try {
    const organizationId = req.user.role === 'SUPER_ADMIN' ? Number(req.body.organizationId) : req.user.organizationId;
    if (!organizationId) return res.status(400).json({ status: 'error', message: 'organizationId is required.' });
    const csvText = (req.body || {}).csv;
    if (!csvText || !String(csvText).trim()) return res.status(400).json({ status: 'error', message: 'No CSV content provided.' });
    const rows = parseCsv(csvText);
    if (!rows.length) return res.status(400).json({ status: 'error', message: 'CSV has no data rows.' });
    if (rows.length > 1000) return res.status(400).json({ status: 'error', message: 'At most 1000 rows per upload.' });

    const [posts, scales] = await Promise.all([
      PostCadre.findAll({ where: { organizationId } }),
      PayScale.findAll({ where: { organizationId } }),
    ]);
    const postByCode = {}; posts.forEach((p) => { postByCode[p.code] = p; });
    const scaleByCode = {}; scales.forEach((s) => { scaleByCode[s.code] = s; });

    // Note: this CSV template intentionally doesn't collect PAN, Aadhaar,
    // personal email, Grade, Designation, Bank details, Stage or Gender, so
    // the organisation's mandatory-fields policy (services/orgFields.js) is
    // NOT enforced here — those details are added afterwards on each
    // employee's own record, where the policy does apply.
    const results = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; const rowNo = i + 2; // account for the header line
      const rowErrors = [];
      if (!r.empCode) rowErrors.push('empCode is required');
      if (!r.name) rowErrors.push('name is required');
      if (!r.doj || !/^\d{4}-\d{2}-\d{2}$/.test(r.doj)) rowErrors.push('doj must be YYYY-MM-DD');
      const post = r.postCode ? postByCode[r.postCode] : null;
      if (!r.postCode) rowErrors.push('postCode is required'); else if (!post) rowErrors.push(`postCode "${r.postCode}" not found in this organisation`);
      let scale = null;
      if (r.payScaleCode) { scale = scaleByCode[r.payScaleCode]; if (!scale) rowErrors.push(`payScaleCode "${r.payScaleCode}" not found in this organisation`); }
      const welfareFundOptIn = r.welfareFundOptIn ? parseBoolCell(r.welfareFundOptIn, 'welfareFundOptIn', rowErrors) : false;

      if (rowErrors.length) { results.push({ row: rowNo, empCode: r.empCode, status: 'error', message: rowErrors.join('; ') }); continue; }

      const payload = {
        organizationId, empCode: r.empCode, name: r.name,
        dob: r.dob || null, doj: r.doj, doa: r.doa || null,
        employmentType: r.employmentType === 'PART_TIME_CONTINGENT' ? 'PART_TIME_CONTINGENT' : 'REGULAR',
        postCadreId: post.id, currentPayScaleId: scale ? scale.id : null,
        currentBasicPay: r.currentBasicPay || null,
        employmentStatus: r.employmentStatus || 'ACTIVE',
        riskAllowance: r.riskAllowance || null, otherAllowance: r.otherAllowance || null,
        vpfPercent: r.vpfPercent || null, welfareFundOptIn, welfareFundAmount: r.welfareFundAmount || null,
        gsliOptIn: parseTriboolCell(r.gsliOptIn), gsliAmount: r.gsliAmount || null, ptAmount: r.ptAmount || null,
        taxRegime: r.taxRegime === 'OLD' ? 'OLD' : 'NEW', taxOtherDeductions: r.taxOtherDeductions || null,
      };
      try {
        await assertCanAddEmployee(organizationId);
        const row = await Employee.create(payload);
        results.push({ row: rowNo, empCode: r.empCode, status: 'created', id: row.id });
      } catch (err) {
        results.push({ row: rowNo, empCode: r.empCode, status: 'error', message: err.message });
      }
    }
    const created = results.filter((r) => r.status === 'created').length;
    await require('../services/audit').audit(req, 'employee.bulk_import', { organizationId, details: { rows: rows.length, created, failed: rows.length - created } });
    res.json({ data: results, summary: { total: rows.length, created, failed: rows.length - created } });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

// Employee master. Creating (or reactivating) an employee record takes a
// licence seat (Organization.maxEmployees). Every referenced post / scale /
// stage / policy must belong to the same organisation.
router.use(
  '/',
  crudRouter(Employee, {
    fields: [
      'organizationId', 'empCode', 'name', 'dob', 'doj', 'doa', 'postCadreId', 'grade', 'category',
      'currentPayScaleId', 'currentStageId', 'currentBasicPay', 'incrementPolicyId', 'payFixationPolicyId',
      'employeeSpecificIncrementDate', 'employmentStatus', 'employmentType', 'status',
      // Payroll: earnings, deductions, tax, stagnation tracking (see services/payslip.js)
      'riskAllowance', 'otherAllowance', 'vpfPercent', 'welfareFundOptIn', 'welfareFundAmount',
      'gsliOptIn', 'gsliAmount', 'ptAmount', 'taxRegime', 'taxOtherDeductions',
      'lastPromotionDate', 'stagnationStagesGranted',
      // Personal details / identity / contact / bank / posting / service milestones
      'fatherName', 'spouseName', 'gender', 'bloodGroup', 'educationalQualification', 'photoAssetId',
      'panNumber', 'aadhaarNumber', 'uanNumber', 'pfNumber',
      'officeEmail', 'personalEmail', 'residenceAddress',
      'emergencyContactName', 'emergencyContactNumber', 'emergencyContactRelation',
      'bankName', 'bankAccountNumber', 'bankIfsc',
      'branchName', 'branchCode', 'designation', 'department', 'gradeDetails',
      'dateOfConfirmation', 'dateOfRetirement',
      // DA fixed/variable (see services/payslip.js)
      'daType', 'fixedDaAmount',
      // City Compensatory Allowance / Conveyance Allowance overrides
      'ccaOptIn', 'ccaAmount', 'conveyanceOptIn', 'conveyanceAmount',
    ],
    softDeleteField: 'status',
    softDeleteValue: 'INACTIVE',
    orgFilterField: 'organizationId',
    writeRoles: ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER'],
    refs: {
      postCadreId: PostCadre,
      currentPayScaleId: PayScale,
      currentStageId: stageBelongsToOrg,
      incrementPolicyId: IncrementPolicy,
      payFixationPolicyId: PayFixationPolicy,
    },
    beforeCreate: async (req, payload) => {
      if (payload.status !== 'INACTIVE') await assertCanAddEmployee(payload.organizationId);
      const org = await Organization.findByPk(payload.organizationId);
      orgFields.validateEmployeeMandatoryFields(org, payload);
    },
    beforeUpdate: async (req, row, payload) => {
      if (payload.status === 'ACTIVE' && row.status !== 'ACTIVE') await assertCanAddEmployee(row.organizationId);
      const org = await Organization.findByPk(row.organizationId);
      const effective = Object.assign({}, row.toJSON(), payload);
      orgFields.validateEmployeeMandatoryFields(org, effective);
    },
  })
);

/**
 * GET /:id/service-book — the digital Service Book (architecture doc §6).
 * Assembles the chronological timeline from employee_service_history, with
 * each row's linked pay-ledger entry (if it affected pay) and its
 * rule/GO reference resolved, so the response is ready to render as a
 * timeline without further client-side joins.
 */
const SERVICE_BOOK_READERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'DEPARTMENT_HEAD'];

router.get('/:id/service-book', authenticate, async (req, res) => {
  if (!SERVICE_BOOK_READERS.includes(req.user.role)) {
    return res.status(403).json({ status: 'error', message: 'Your role cannot view service books.' });
  }
  try {
    const employee = await Employee.findByPk(req.params.id, {
      include: [
        { model: PostCadre },
        { model: PayScale, as: 'CurrentPayScale' },
        { model: PayStage, as: 'CurrentPayStage' },
      ],
    });
    if (!employee) return res.status(404).json({ status: 'error', message: 'Employee not found' });
    if (req.user.role !== 'SUPER_ADMIN' && String(employee.organizationId) !== String(req.user.organizationId)) {
      return res.status(404).json({ status: 'error', message: 'Employee not found' });
    }

    const timeline = await EmployeeServiceHistory.findAll({
      where: { employeeId: employee.id },
      order: [['eventDate', 'ASC'], ['id', 'ASC']],
      include: [
        { model: EmployeePayHistory, as: 'PayHistoryEntry' },
        { model: RuleReference },
        { model: GovernmentOrder },
      ],
    });

    const docMap = await attachments.infoBatch(ServiceHistoryDocument, 'serviceHistoryId', timeline.map((t) => t.id));
    const timelineWithDocs = timeline.map((t) => Object.assign(t.toJSON(), { document: docMap[t.id] || null }));

    // Auto-calculated from DOB + the organisation's standard retirement age
    // (OrgPayrollSetting.retirementAge) unless the employee has an explicit
    // dateOfRetirement override on file — see services/loans.js.
    const orgSettings = await require('../services/payrollSettings').getSettings(employee.organizationId);
    const retirementDateObj = loans.retirementDate(employee, orgSettings);
    const effectiveRetirementDate = retirementDateObj ? retirementDateObj.toISOString().slice(0, 10) : null;

    res.json({
      data: {
        employee,
        timeline: timelineWithDocs,
        timelineCount: timeline.length,
        effectiveRetirementDate,
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});


/**
 * POST /:id/service-book/events — append an entry to the Service Book.
 *
 * Append-only: entries are never edited or deleted through the API (a
 * mistake is corrected by a further entry, as in a paper service book).
 * Pay-affecting events (increment, promotion, higher grade, pay revision)
 * are refused here: those must be posted through the pay engines so the
 * pay-ledger row and its calculation trace are created with them.
 */
const NON_PAY_EVENTS = ['APPOINTMENT', 'PROBATION', 'CONFIRMATION', 'TRANSFER', 'SUSPENSION', 'LWA', 'BREAK_IN_SERVICE', 'DISCIPLINARY', 'RETIREMENT', 'OTHER'];
const SERVICE_BOOK_WRITERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER'];

router.post('/:id/service-book/events', authenticate, async (req, res) => {
  try {
    if (!SERVICE_BOOK_WRITERS.includes(req.user.role)) {
      return res.status(403).json({ status: 'error', message: 'Your role cannot add service book entries.' });
    }
    const employee = await Employee.findByPk(req.params.id);
    if (!employee || (req.user.role !== 'SUPER_ADMIN' && String(employee.organizationId) !== String(req.user.organizationId))) {
      return res.status(404).json({ status: 'error', message: 'Employee not found' });
    }
    const b = req.body || {};
    if (!NON_PAY_EVENTS.includes(b.eventType)) {
      return res.status(400).json({
        status: 'error',
        message: `Event type must be one of: ${NON_PAY_EVENTS.join(', ')}. Increments, promotions, higher grade and pay revisions are recorded by the pay engines, not entered by hand.`,
      });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.eventDate || ''))) {
      return res.status(400).json({ status: 'error', message: 'Event date (YYYY-MM-DD) is required' });
    }
    if (b.governmentOrderId) {
      const go = await GovernmentOrder.findByPk(b.governmentOrderId);
      if (!go || String(go.organizationId) !== String(employee.organizationId)) {
        return res.status(400).json({ status: 'error', message: 'governmentOrderId: no such GO in this organisation.' });
      }
    }
    const row = await EmployeeServiceHistory.create({
      employeeId: employee.id,
      eventType: b.eventType,
      eventDate: b.eventDate,
      orderRef: b.orderRef ? String(b.orderRef).slice(0, 128) : null,
      governmentOrderId: b.governmentOrderId || null,
      remarks: b.remarks ? String(b.remarks).slice(0, 4000) : null,
    });
    var document = null;
    if (b.documentDataUrl) {
      document = await attachments.save(ServiceHistoryDocument, 'serviceHistoryId', row.id, { label: b.documentLabel, dataUrl: b.documentDataUrl }, req.user.id);
    }
    await require('../services/audit').audit(req, 'servicebook.event.add', {
      organizationId: employee.organizationId, targetType: 'employee', targetId: employee.id,
      details: { eventType: row.eventType, eventDate: row.eventDate, hasDocument: !!document },
    });
    res.status(201).json({ data: Object.assign(row.toJSON(), { document: document }) });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /:id/service-book/events/:eventId/document/file — the scanned document
 * attached to one Service Book entry (see attachments.save above; entries
 * are append-only, so there is no separate upload/replace/delete route —
 * a mistake is corrected by adding a further entry, as with the entry text).
 */
router.get('/:id/service-book/events/:eventId/document/file', authenticate, async (req, res) => {
  if (!SERVICE_BOOK_READERS.includes(req.user.role)) {
    return res.status(403).json({ status: 'error', message: 'Your role cannot view service books.' });
  }
  try {
    const employee = await Employee.findByPk(req.params.id);
    if (!employee || (req.user.role !== 'SUPER_ADMIN' && String(employee.organizationId) !== String(req.user.organizationId))) {
      return res.status(404).json({ status: 'error', message: 'Employee not found' });
    }
    const event = await EmployeeServiceHistory.findOne({ where: { id: req.params.eventId, employeeId: employee.id } });
    if (!event) return res.status(404).json({ status: 'error', message: 'Service book entry not found' });
    const row = await attachments.get(ServiceHistoryDocument, 'serviceHistoryId', event.id);
    if (!row) return res.status(404).json({ status: 'error', message: 'No document attached to this entry' });
    attachments.send(res, row);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /:id/payslip — an estimated payslip preview for one employee, computed
 * live from their salary fields + the organisation's payroll settings (see
 * services/payslip.js). Optional ?month=1-12 to preview a specific month's
 * Professional Tax timing; defaults to the current month.
 */
const PAYSLIP_READERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'];

router.get('/:id/payslip', authenticate, async (req, res) => {
  if (!PAYSLIP_READERS.includes(req.user.role)) {
    return res.status(403).json({ status: 'error', message: 'Your role cannot view payslips.' });
  }
  try {
    const employee = await Employee.findByPk(req.params.id, { include: [{ model: PayScale, as: 'CurrentPayScale' }] });
    if (!employee) return res.status(404).json({ status: 'error', message: 'Employee not found' });
    if (req.user.role !== 'SUPER_ADMIN' && String(employee.organizationId) !== String(req.user.organizationId)) {
      return res.status(404).json({ status: 'error', message: 'Employee not found' });
    }
    const settings = await require('../services/payrollSettings').getSettings(employee.organizationId);
    const month = req.query.month ? Number(req.query.month) : undefined;
    const asOf = loans.asOfForMonth(month);
    const resolvedMonth = month || (new Date().getMonth() + 1);
    const resolvedYear = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const [activeLoans, attendanceRow, customAllowances] = await Promise.all([
      loans.loadActiveLoans(employee.id, asOf),
      attendance.getForMonth(employee.id, month),
      require('../services/allowances').applicableAllowancesFor(employee.organizationId, employee.postCadreId, resolvedYear, resolvedMonth),
    ]);
    const payslip = require('../services/payslip').computePayslip(employee, settings, month, activeLoans, attendanceRow ? attendanceRow.toJSON() : null, customAllowances);
    res.json({ data: payslip });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /:id/payslip.pdf — the same live/estimated payslip preview above,
 * downloaded as a PDF (services/payslipPdf.js) rather than viewed on
 * screen — for an employee (or HR on their behalf) to keep a copy before
 * an actual payroll run exists for that month.
 */
router.get('/:id/payslip.pdf', authenticate, async (req, res) => {
  if (!PAYSLIP_READERS.includes(req.user.role)) {
    return res.status(403).json({ status: 'error', message: 'Your role cannot view payslips.' });
  }
  try {
    const employee = await Employee.findByPk(req.params.id, { include: [{ model: PayScale, as: 'CurrentPayScale' }, { model: PostCadre }] });
    if (!employee) return res.status(404).json({ status: 'error', message: 'Employee not found' });
    if (req.user.role !== 'SUPER_ADMIN' && String(employee.organizationId) !== String(req.user.organizationId)) {
      return res.status(404).json({ status: 'error', message: 'Employee not found' });
    }
    const settings = await require('../services/payrollSettings').getSettings(employee.organizationId);
    const month = req.query.month ? Number(req.query.month) : undefined;
    const asOf = loans.asOfForMonth(month);
    const resolvedMonth = month || (new Date().getMonth() + 1);
    const resolvedYear = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const [activeLoans, attendanceRow, customAllowances] = await Promise.all([
      loans.loadActiveLoans(employee.id, asOf),
      attendance.getForMonth(employee.id, month),
      require('../services/allowances').applicableAllowancesFor(employee.organizationId, employee.postCadreId, resolvedYear, resolvedMonth),
    ]);
    const payslip = require('../services/payslip').computePayslip(employee, settings, month, activeLoans, attendanceRow ? attendanceRow.toJSON() : null, customAllowances);
    const org = await Organization.findByPk(employee.organizationId, { attributes: ['id', 'name', 'shortName'] });
    const { buildPayslipPdf } = require('../services/payslipPdf');
    const pdf = await buildPayslipPdf({
      organization: org,
      employee: { empCode: employee.empCode, name: employee.name, postName: employee.PostCadre ? employee.PostCadre.name : null },
      payslip,
      year: new Date().getUTCFullYear(),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payslip-${employee.empCode}-${MONTH_ABBR[payslip.forMonth]}.pdf"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});
const MONTH_ABBR = ['', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Attendance / Loss of Pay (LOP) marking — one row per employee per
 * calendar month (see models/employeeAttendance.js). GET returns the whole
 * year at once (for the yearly grid); POST upserts one month.
 */
router.get('/:id/attendance', authenticate, async (req, res) => {
  if (!PAYSLIP_READERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot view this.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const year = req.query.year ? Number(req.query.year) : attendance.yearForMonth();
    const byMonth = await attendance.listForYear(employee.id, year);
    const months = [];
    for (let m = 1; m <= 12; m++) months.push(byMonth[m] ? byMonth[m].toJSON() : { employeeId: employee.id, year, month: m, lopDays: 0, remarks: null });
    res.json({ data: { year, months } });
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

router.post('/:id/attendance', authenticate, async (req, res) => {
  if (!LOAN_WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot mark attendance.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const b = req.body || {};
    const year = Number(b.year); const month = Number(b.month);
    if (!(year >= 2000 && year <= 2100)) return res.status(400).json({ status: 'error', message: 'A valid year is required.' });
    if (!(month >= 1 && month <= 12)) return res.status(400).json({ status: 'error', message: 'Month must be 1-12.' });
    const lopDays = Number(b.lopDays);
    if (!(lopDays >= 0 && lopDays <= 31)) return res.status(400).json({ status: 'error', message: 'LOP days must be between 0 and 31.' });
    const row = await attendance.upsert(employee.id, year, month, { lopDays, remarks: b.remarks }, req.user.id);
    await require('../services/audit').audit(req, 'employee.attendance.mark', { organizationId: employee.organizationId, targetType: 'employee', targetId: employee.id, details: { year, month, lopDays } });
    res.status(200).json({ data: row });
  } catch (err) { res.status(err.status || 400).json({ status: 'error', message: err.message }); }
});

// ---------------------------------------------------------------------
// Festival Advance / Overdraft / Recurring Deposit — loan-style records.
// Each is a real record HR/Payroll creates once availed; the monthly
// instalment it contributes to the payslip is computed live (see
// services/loans.js), not posted month by month. Writers = same roles as
// the rest of the employee master; readers = same as the payslip itself.
// ---------------------------------------------------------------------
const LOAN_WRITERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'PAYROLL_OFFICER', 'ACCOUNTS_OFFICER'];
// Editing or deleting an existing loan-style record (as opposed to
// recording a new one) is restricted more tightly than LOAN_WRITERS above —
// only an Org Admin, HR Admin, or Super Admin may change or remove one once
// it exists.
const LOAN_EDIT_DELETE = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN'];

async function loadOwnEmployee(req, res) {
  const employee = await Employee.findByPk(req.params.id);
  if (!employee) { res.status(404).json({ status: 'error', message: 'Employee not found' }); return null; }
  if (req.user.role !== 'SUPER_ADMIN' && String(employee.organizationId) !== String(req.user.organizationId)) {
    res.status(404).json({ status: 'error', message: 'Employee not found' }); return null;
  }
  return employee;
}

/**
 * Registers `DELETE /:id/<path>/:rowId` for a loan-style child resource —
 * restricted to LOAN_EDIT_DELETE (see above), scoped to the employee's own
 * organisation, audited. Shared by every loan resource below rather than
 * repeated six times.
 */
function registerDeleteRoute(path, Model, label, auditAction) {
  router.delete(`/:id/${path}/:rowId`, authenticate, async (req, res) => {
    if (!LOAN_EDIT_DELETE.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Only an Org Admin, HR Admin, or Super Admin can delete this.' });
    try {
      const employee = await loadOwnEmployee(req, res); if (!employee) return;
      const row = await Model.findOne({ where: { id: req.params.rowId, employeeId: employee.id } });
      if (!row) return res.status(404).json({ status: 'error', message: `${label} not found` });
      await row.destroy();
      await require('../services/audit').audit(req, auditAction, { organizationId: employee.organizationId, targetType: 'employee', targetId: employee.id, details: { deletedId: Number(req.params.rowId) } });
      res.json({ status: 'ok', deleted: true });
    } catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
  });
}

// ---- Bank Accounts — an employee may hold several (SB/OD/RD/OTHER); see
// models/employeeBankAccount.js. Employee.bankName/bankAccountNumber/
// bankIfsc (the original single-account fields, edited via the employee
// master form itself) remain the fallback salary account; setting
// Employee.salaryCreditAccountId (below) routes net pay to one of these
// instead — e.g. straight into the employee's Overdraft account. ----
router.get('/:id/bank-accounts', authenticate, async (req, res) => {
  if (!PAYSLIP_READERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot view this.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const rows = await EmployeeBankAccount.findAll({ where: { employeeId: employee.id }, order: [['id', 'ASC']] });
    res.json({ data: rows, salaryCreditAccountId: employee.salaryCreditAccountId });
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

router.post('/:id/bank-accounts', authenticate, async (req, res) => {
  if (!LOAN_WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot add a bank account.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const b = req.body || {};
    if (!['SB', 'OD', 'RD', 'OTHER'].includes(b.accountType)) return res.status(400).json({ status: 'error', message: 'accountType must be SB, OD, RD or OTHER.' });
    if (!b.accountNumber || !String(b.accountNumber).trim()) return res.status(400).json({ status: 'error', message: 'accountNumber is required.' });
    const row = await EmployeeBankAccount.create({
      employeeId: employee.id, accountType: b.accountType, accountNumber: String(b.accountNumber).trim(),
      bankName: b.bankName || null, ifsc: b.ifsc || null, branchName: b.branchName || null,
      remarks: b.remarks ? String(b.remarks).slice(0, 500) : null,
    });
    await require('../services/audit').audit(req, 'employee.bank_account.add', { organizationId: employee.organizationId, targetType: 'employee', targetId: employee.id, details: { accountType: b.accountType } });
    res.status(201).json({ data: row });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ status: 'error', message: 'This employee already has an account with that number on file.' });
    res.status(400).json({ status: 'error', message: err.message });
  }
});

router.put('/:id/bank-accounts/:accountId', authenticate, async (req, res) => {
  if (!LOAN_EDIT_DELETE.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Only an Org Admin, HR Admin, or Super Admin can change this.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const row = await EmployeeBankAccount.findOne({ where: { id: req.params.accountId, employeeId: employee.id } });
    if (!row) return res.status(404).json({ status: 'error', message: 'Bank account not found' });
    const b = req.body || {};
    if (b.bankName !== undefined) row.bankName = b.bankName || null;
    if (b.ifsc !== undefined) row.ifsc = b.ifsc || null;
    if (b.branchName !== undefined) row.branchName = b.branchName || null;
    if (b.remarks !== undefined) row.remarks = b.remarks ? String(b.remarks).slice(0, 500) : null;
    if (b.status && ['ACTIVE', 'INACTIVE'].includes(b.status)) row.status = b.status;
    await row.save();
    await require('../services/audit').audit(req, 'employee.bank_account.update', { organizationId: employee.organizationId, targetType: 'employee', targetId: employee.id });
    res.json({ data: row });
  } catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

// Which account net pay is credited to — one of this employee's own
// EmployeeBankAccount rows, or null to fall back to the legacy
// bankAccountNumber/bankIfsc fields on the employee record itself.
router.put('/:id/salary-credit-account', authenticate, async (req, res) => {
  if (!LOAN_EDIT_DELETE.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Only an Org Admin, HR Admin, or Super Admin can change this.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const accountId = req.body && req.body.accountId;
    if (accountId) {
      const acct = await EmployeeBankAccount.findOne({ where: { id: accountId, employeeId: employee.id } });
      if (!acct) return res.status(400).json({ status: 'error', message: 'accountId: no such account for this employee.' });
    }
    employee.salaryCreditAccountId = accountId || null;
    await employee.save();
    await require('../services/audit').audit(req, 'employee.salary_credit_account.update', { organizationId: employee.organizationId, targetType: 'employee', targetId: employee.id, details: { accountId: accountId || null } });
    res.json({ data: employee });
  } catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

registerDeleteRoute('bank-accounts', EmployeeBankAccount, 'Bank account', 'employee.bank_account.delete');

// ---- Festival Advance ----
router.get('/:id/festival-advances', authenticate, async (req, res) => {
  if (!PAYSLIP_READERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot view this.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const rows = await EmployeeFestivalAdvance.findAll({ where: { employeeId: employee.id }, order: [['availedDate', 'DESC']] });
    const today = new Date();
    res.json({ data: rows.map((r) => ({ ...r.toJSON(), ...loans.scheduleStatus(r, today) })) });
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

router.post('/:id/festival-advances', authenticate, async (req, res) => {
  if (!LOAN_WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot record a Festival Advance.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const b = req.body || {};
    const existing = await EmployeeFestivalAdvance.findAll({ where: { employeeId: employee.id } });
    const today = new Date();
    if (existing.some((r) => !loans.scheduleStatus(r, today).fullyRepaid)) {
      return res.status(400).json({ status: 'error', message: 'This employee already has an unrepaid Festival Advance. A new one is only allowed once the current one is fully repaid.' });
    }
    const settings = await require('../services/payrollSettings').getSettings(employee.organizationId);
    const basic = Number(employee.currentBasicPay) || 0;
    const da = loans.round2(basic * (Number(settings.daPercent) || 0) / 100);
    const maxAmount = loans.round2(basic + da);
    const amount = Number(b.amount);
    if (!(amount > 0) || amount > maxAmount) {
      return res.status(400).json({ status: 'error', message: `Amount must be positive and at most one month's Basic+DA (₹${maxAmount}).` });
    }
    const orgStandardMonths = Number(settings.festivalAdvanceRepayMonths) || 10;
    const repayMonths = Number(b.repayMonths) || orgStandardMonths;
    if (!(repayMonths >= 1) || repayMonths > orgStandardMonths) {
      return res.status(400).json({ status: 'error', message: `Repayment period must be between 1 and the organisation's standard ${orgStandardMonths} months (an employee may repay faster, never slower).` });
    }
    if (!b.availedDate) return res.status(400).json({ status: 'error', message: 'availedDate is required.' });
    const row = await EmployeeFestivalAdvance.create({
      employeeId: employee.id, amount, availedDate: b.availedDate, repayMonths,
      remarks: b.remarks ? String(b.remarks).slice(0, 500) : null,
    });
    await require('../services/audit').audit(req, 'employee.festival_advance.add', { organizationId: employee.organizationId, targetType: 'employee', targetId: employee.id, details: { amount, repayMonths } });
    res.status(201).json({ data: { ...row.toJSON(), ...loans.scheduleStatus(row, today) } });
  } catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

router.put('/:id/festival-advances/:advId', authenticate, async (req, res) => {
  if (!LOAN_EDIT_DELETE.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Only an Org Admin, HR Admin, or Super Admin can change this.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const row = await EmployeeFestivalAdvance.findOne({ where: { id: req.params.advId, employeeId: employee.id } });
    if (!row) return res.status(404).json({ status: 'error', message: 'Festival Advance not found' });
    const repayMonths = Number((req.body || {}).repayMonths);
    if (!(repayMonths >= 1) || repayMonths > row.repayMonths) {
      return res.status(400).json({ status: 'error', message: `The repayment period can only be shortened (currently ${row.repayMonths} months), not extended.` });
    }
    row.repayMonths = repayMonths;
    await row.save();
    res.json({ data: { ...row.toJSON(), ...loans.scheduleStatus(row, new Date()) } });
  } catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

// ---- Employee Overdraft ----
router.get('/:id/overdrafts', authenticate, async (req, res) => {
  if (!PAYSLIP_READERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot view this.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const rows = await EmployeeOverdraft.findAll({ where: { employeeId: employee.id }, order: [['availedDate', 'DESC']] });
    const settings = await require('../services/payrollSettings').getSettings(employee.organizationId);
    const today = new Date();
    res.json({
      data: rows.map((r) => ({ ...r.toJSON(), ...loans.scheduleStatus(r, today) })),
      eligibility: loans.overdraftEligibility(employee, settings),
      maxRepayMonths: loans.overdraftMaxRepayMonths(employee, settings, today),
      retirementDate: loans.retirementDate(employee, settings),
      currentInterestRatePercent: Number(settings.odInterestRatePercent) || 0,
    });
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

router.post('/:id/overdrafts', authenticate, async (req, res) => {
  if (!LOAN_WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot record an Overdraft.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const b = req.body || {};
    const existing = await EmployeeOverdraft.findAll({ where: { employeeId: employee.id } });
    const today = new Date();
    if (existing.some((r) => !loans.scheduleStatus(r, today).fullyRepaid)) {
      return res.status(400).json({ status: 'error', message: 'This employee already has an unrepaid Overdraft.' });
    }
    const settings = await require('../services/payrollSettings').getSettings(employee.organizationId);
    const { ceiling } = loans.overdraftEligibility(employee, settings);
    const amount = Number(b.amount);
    if (!(amount > 0) || amount > ceiling) {
      return res.status(400).json({ status: 'error', message: `Amount must be positive and at most ₹${ceiling} (this employee's eligibility ceiling).` });
    }
    const maxMonths = loans.overdraftMaxRepayMonths(employee, settings, today);
    if (maxMonths < 1) {
      return res.status(400).json({ status: 'error', message: 'This employee is at or past standard retirement age — no repayment period remains.' });
    }
    const repayMonths = Number(b.repayMonths) || maxMonths;
    if (!(repayMonths >= 1) || repayMonths > maxMonths) {
      return res.status(400).json({ status: 'error', message: `Repayment period must be between 1 and ${maxMonths} months (the organisation's standard, or less if this employee is retiring sooner).` });
    }
    if (!b.availedDate) return res.status(400).json({ status: 'error', message: 'availedDate is required.' });
    // Interest rate is SNAPSHOTTED at the moment this Overdraft is created —
    // the organisation's current rate, unless an admin explicitly overrides
    // it for this one record. Later changes to the org rate never touch this
    // row; only a subsequently-created Overdraft picks up a new org rate.
    const interestRatePercent = b.interestRatePercent !== undefined && b.interestRatePercent !== null && b.interestRatePercent !== ''
      ? Number(b.interestRatePercent)
      : (Number(settings.odInterestRatePercent) || 0);
    if (!(interestRatePercent >= 0)) {
      return res.status(400).json({ status: 'error', message: 'interestRatePercent must be zero or a positive number.' });
    }
    // Optional: which of the employee's own bank accounts (accountType OD)
    // this Overdraft is availed against — purely a record-keeping/
    // reconciliation link, doesn't change the deduction math itself.
    let accountId = null;
    if (b.accountId) {
      const acct = await EmployeeBankAccount.findOne({ where: { id: b.accountId, employeeId: employee.id } });
      if (!acct) return res.status(400).json({ status: 'error', message: 'accountId: no such bank account for this employee.' });
      if (acct.accountType !== 'OD') return res.status(400).json({ status: 'error', message: 'accountId must reference an account of type OD.' });
      accountId = acct.id;
    }
    const row = await EmployeeOverdraft.create({
      employeeId: employee.id, amount, availedDate: b.availedDate, repayMonths, interestRatePercent, accountId,
      remarks: b.remarks ? String(b.remarks).slice(0, 500) : null,
    });
    await require('../services/audit').audit(req, 'employee.overdraft.add', { organizationId: employee.organizationId, targetType: 'employee', targetId: employee.id, details: { amount, repayMonths, interestRatePercent } });
    res.status(201).json({ data: { ...row.toJSON(), ...loans.scheduleStatus(row, today) } });
  } catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

// ---- Recurring Deposit (optional; usually linked to an Overdraft) ----
router.get('/:id/recurring-deposits', authenticate, async (req, res) => {
  if (!PAYSLIP_READERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot view this.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const rows = await EmployeeRecurringDeposit.findAll({ where: { employeeId: employee.id }, order: [['id', 'DESC']] });
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

router.post('/:id/recurring-deposits', authenticate, async (req, res) => {
  if (!LOAN_WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot record a Recurring Deposit.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const b = req.body || {};
    // A Recurring Deposit is opened as security against an Employee
    // Overdraft, not as a standalone savings instrument — it must be linked
    // to one of this employee's Overdrafts (an explicit overdraftId, or the
    // employee's single currently-open Overdraft when there is one).
    let overdraftRow = null;
    if (b.overdraftId) {
      overdraftRow = await EmployeeOverdraft.findOne({ where: { id: b.overdraftId, employeeId: employee.id } });
      if (!overdraftRow) return res.status(400).json({ status: 'error', message: 'overdraftId: no such Overdraft for this employee.' });
    } else {
      const odRows = await EmployeeOverdraft.findAll({ where: { employeeId: employee.id }, order: [['id', 'DESC']] });
      const today = new Date();
      overdraftRow = odRows.find((r) => !loans.scheduleStatus(r, today).fullyRepaid) || null;
    }
    if (!overdraftRow) return res.status(400).json({ status: 'error', message: 'A Recurring Deposit requires an active Overdraft for this employee — record the Overdraft first.' });
    let monthlyAmount = Number(b.monthlyAmount);
    if (!monthlyAmount) monthlyAmount = loans.scheduleStatus(overdraftRow, new Date()).monthlyInstallment;
    if (!(monthlyAmount > 0)) return res.status(400).json({ status: 'error', message: 'monthlyAmount is required (defaults to the linked Overdraft\'s instalment).' });
    if (!b.startDate) return res.status(400).json({ status: 'error', message: 'startDate is required.' });
    // Optional: which of the employee's own bank accounts (accountType RD)
    // this instalment is credited into.
    let accountId = null;
    if (b.accountId) {
      const acct = await EmployeeBankAccount.findOne({ where: { id: b.accountId, employeeId: employee.id } });
      if (!acct) return res.status(400).json({ status: 'error', message: 'accountId: no such bank account for this employee.' });
      if (acct.accountType !== 'RD') return res.status(400).json({ status: 'error', message: 'accountId must reference an account of type RD.' });
      accountId = acct.id;
    }
    const row = await EmployeeRecurringDeposit.create({
      employeeId: employee.id, overdraftId: overdraftRow ? overdraftRow.id : null, monthlyAmount, startDate: b.startDate, accountId,
      remarks: b.remarks ? String(b.remarks).slice(0, 500) : null,
    });
    await require('../services/audit').audit(req, 'employee.recurring_deposit.add', { organizationId: employee.organizationId, targetType: 'employee', targetId: employee.id, details: { monthlyAmount } });
    res.status(201).json({ data: row });
  } catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

router.put('/:id/recurring-deposits/:rdId', authenticate, async (req, res) => {
  if (!LOAN_EDIT_DELETE.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Only an Org Admin, HR Admin, or Super Admin can change this.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const row = await EmployeeRecurringDeposit.findOne({ where: { id: req.params.rdId, employeeId: employee.id } });
    if (!row) return res.status(404).json({ status: 'error', message: 'Recurring Deposit not found' });
    const b = req.body || {};
    if (b.monthlyAmount !== undefined) row.monthlyAmount = Number(b.monthlyAmount);
    if (b.status && ['ACTIVE', 'CLOSED'].includes(b.status)) row.status = b.status;
    await row.save();
    res.json({ data: row });
  } catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

// ---------------------------------------------------------------------
// LIC / Housing Loan / Vehicle Loan — unlike Festival Advance/Overdraft, an
// employee may hold SEVERAL of each at once, so these are plain multi-row
// lists (no "only one unrepaid at a time" guard) and every row is shown
// separately, never merged.
// ---------------------------------------------------------------------

// ---- LIC policies ----
router.get('/:id/lic-policies', authenticate, async (req, res) => {
  if (!PAYSLIP_READERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot view this.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const rows = await EmployeeLic.findAll({ where: { employeeId: employee.id }, order: [['openingDate', 'DESC']] });
    const today = new Date();
    res.json({ data: rows.map((r) => ({ ...r.toJSON(), ...loans.licStatus(r, today) })) });
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

router.post('/:id/lic-policies', authenticate, async (req, res) => {
  if (!LOAN_WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot record an LIC policy.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const b = req.body || {};
    if (!b.openingDate) return res.status(400).json({ status: 'error', message: 'openingDate is required.' });
    if (!b.startedDate) return res.status(400).json({ status: 'error', message: 'startedDate is required.' });
    const deductionAmount = Number(b.deductionAmount);
    if (!(deductionAmount > 0)) return res.status(400).json({ status: 'error', message: 'deductionAmount must be positive.' });
    const sumAssuredAmount = Number(b.sumAssuredAmount);
    if (!(sumAssuredAmount > 0)) return res.status(400).json({ status: 'error', message: 'sumAssuredAmount must be positive.' });
    const row = await EmployeeLic.create({
      employeeId: employee.id,
      policyNumber: b.policyNumber ? String(b.policyNumber).slice(0, 100) : null,
      openingDate: b.openingDate, startedDate: b.startedDate, deductionAmount, sumAssuredAmount,
      maturityDate: b.maturityDate || null, closureDate: b.closureDate || null,
      remarks: b.remarks ? String(b.remarks).slice(0, 500) : null,
    });
    await require('../services/audit').audit(req, 'employee.lic.add', { organizationId: employee.organizationId, targetType: 'employee', targetId: employee.id, details: { deductionAmount, sumAssuredAmount } });
    res.status(201).json({ data: { ...row.toJSON(), ...loans.licStatus(row, new Date()) } });
  } catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

router.put('/:id/lic-policies/:licId', authenticate, async (req, res) => {
  if (!LOAN_EDIT_DELETE.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Only an Org Admin, HR Admin, or Super Admin can change this.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const row = await EmployeeLic.findOne({ where: { id: req.params.licId, employeeId: employee.id } });
    if (!row) return res.status(404).json({ status: 'error', message: 'LIC policy not found' });
    const b = req.body || {};
    if (b.deductionAmount !== undefined) row.deductionAmount = Number(b.deductionAmount);
    if (b.maturityDate !== undefined) row.maturityDate = b.maturityDate || null;
    if (b.closureDate !== undefined) row.closureDate = b.closureDate || null;
    if (b.remarks !== undefined) row.remarks = b.remarks ? String(b.remarks).slice(0, 500) : null;
    await row.save();
    res.json({ data: { ...row.toJSON(), ...loans.licStatus(row, new Date()) } });
  } catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

// ---- Housing Loans ----
router.get('/:id/housing-loans', authenticate, async (req, res) => {
  if (!PAYSLIP_READERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot view this.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const rows = await EmployeeHousingLoan.findAll({ where: { employeeId: employee.id }, order: [['emiStartDate', 'DESC']] });
    const today = new Date();
    res.json({ data: rows.map((r) => ({ ...r.toJSON(), ...loans.housingLoanStatus(r, today) })) });
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

router.post('/:id/housing-loans', authenticate, async (req, res) => {
  if (!LOAN_WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot record a Housing Loan.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const b = req.body || {};
    const totalLoanAmount = Number(b.totalLoanAmount);
    if (!(totalLoanAmount > 0)) return res.status(400).json({ status: 'error', message: 'totalLoanAmount must be positive.' });
    const interestRatePercent = Number(b.interestRatePercent);
    if (!(interestRatePercent >= 0)) return res.status(400).json({ status: 'error', message: 'interestRatePercent must be zero or a positive number.' });
    if (!b.emiStartDate) return res.status(400).json({ status: 'error', message: 'emiStartDate is required.' });
    if (!b.emiEndDate) return res.status(400).json({ status: 'error', message: 'emiEndDate is required.' });
    const start = new Date(b.emiStartDate + 'T00:00:00Z');
    const end = new Date(b.emiEndDate + 'T00:00:00Z');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ status: 'error', message: 'emiEndDate must be after emiStartDate.' });
    }
    const periodMonths = Math.max(1, loans.monthsBetween(start, end));
    const row = await EmployeeHousingLoan.create({
      employeeId: employee.id, totalLoanAmount, interestRatePercent,
      emiStartDate: b.emiStartDate, emiEndDate: b.emiEndDate, periodMonths,
      remarks: b.remarks ? String(b.remarks).slice(0, 500) : null,
    });
    await require('../services/audit').audit(req, 'employee.housing_loan.add', { organizationId: employee.organizationId, targetType: 'employee', targetId: employee.id, details: { totalLoanAmount, interestRatePercent, periodMonths } });
    res.status(201).json({ data: { ...row.toJSON(), ...loans.housingLoanStatus(row, new Date()) } });
  } catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

router.put('/:id/housing-loans/:loanId', authenticate, async (req, res) => {
  if (!LOAN_EDIT_DELETE.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Only an Org Admin, HR Admin, or Super Admin can change this.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const row = await EmployeeHousingLoan.findOne({ where: { id: req.params.loanId, employeeId: employee.id } });
    if (!row) return res.status(404).json({ status: 'error', message: 'Housing Loan not found' });
    const b = req.body || {};
    if (b.closureDate !== undefined) row.closureDate = b.closureDate || null;
    if (b.remarks !== undefined) row.remarks = b.remarks ? String(b.remarks).slice(0, 500) : null;
    await row.save();
    res.json({ data: { ...row.toJSON(), ...loans.housingLoanStatus(row, new Date()) } });
  } catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

// ---- Vehicle Loans ----
router.get('/:id/vehicle-loans', authenticate, async (req, res) => {
  if (!PAYSLIP_READERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot view this.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const rows = await EmployeeVehicleLoan.findAll({ where: { employeeId: employee.id }, order: [['startDate', 'DESC']] });
    const settings = await require('../services/payrollSettings').getSettings(employee.organizationId);
    const today = new Date();
    res.json({
      data: rows.map((r) => ({ ...r.toJSON(), ...loans.vehicleLoanStatus(r, today) })),
      allowMultiple: !!settings.vehicleLoanAllowMultiple,
      currentInterestRatePercent: Number(settings.vehicleLoanInterestRatePercent) || 0,
    });
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

router.post('/:id/vehicle-loans', authenticate, async (req, res) => {
  if (!LOAN_WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot record a Vehicle Loan.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const b = req.body || {};
    const settings = await require('../services/payrollSettings').getSettings(employee.organizationId);

    // Off by default (org toggle) — an employee may only hold one
    // open (unclosed, not yet ended) Vehicle Loan at a time unless the
    // organisation has explicitly turned multiple loans on.
    if (!settings.vehicleLoanAllowMultiple) {
      const existing = await EmployeeVehicleLoan.findAll({ where: { employeeId: employee.id } });
      const today = new Date();
      if (existing.some((r) => loans.vehicleLoanStatus(r, today).active)) {
        return res.status(400).json({ status: 'error', message: 'This employee already has an active Vehicle Loan. The organisation has not enabled multiple Vehicle Loans (see Payroll Settings).' });
      }
    }

    const totalAmount = Number(b.totalAmount);
    if (!(totalAmount > 0)) return res.status(400).json({ status: 'error', message: 'totalAmount must be positive.' });
    if (!b.startDate) return res.status(400).json({ status: 'error', message: 'startDate is required.' });
    if (!b.endDate) return res.status(400).json({ status: 'error', message: 'endDate is required.' });
    const start = new Date(b.startDate + 'T00:00:00Z');
    const end = new Date(b.endDate + 'T00:00:00Z');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ status: 'error', message: 'endDate must be after startDate.' });
    }
    const periodMonths = Math.max(1, loans.monthsBetween(start, end));

    // interestRatePercent (rate-driven, diminishing-balance EMI) is the
    // normal path, defaulting to the org's current rate; pass
    // interestRatePercent: null explicitly to fall back to a manually
    // entered emiAmount instead (e.g. a loan taken before rates were
    // tracked here).
    let interestRatePercent = null; let emiAmount = null;
    if (b.interestRatePercent === null) {
      emiAmount = Number(b.emiAmount);
      if (!(emiAmount > 0)) return res.status(400).json({ status: 'error', message: 'emiAmount must be positive when interestRatePercent is explicitly omitted.' });
    } else {
      interestRatePercent = b.interestRatePercent !== undefined && b.interestRatePercent !== ''
        ? Number(b.interestRatePercent)
        : (Number(settings.vehicleLoanInterestRatePercent) || 0);
      if (!(interestRatePercent >= 0)) return res.status(400).json({ status: 'error', message: 'interestRatePercent must be zero or a positive number.' });
    }

    const row = await EmployeeVehicleLoan.create({
      employeeId: employee.id, totalAmount, vehicleType: b.vehicleType ? String(b.vehicleType).slice(0, 100) : null,
      startDate: b.startDate, endDate: b.endDate, periodMonths, interestRatePercent, emiAmount,
      remarks: b.remarks ? String(b.remarks).slice(0, 500) : null,
    });
    await require('../services/audit').audit(req, 'employee.vehicle_loan.add', { organizationId: employee.organizationId, targetType: 'employee', targetId: employee.id, details: { totalAmount, interestRatePercent, emiAmount, periodMonths } });
    res.status(201).json({ data: { ...row.toJSON(), ...loans.vehicleLoanStatus(row, new Date()) } });
  } catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

router.put('/:id/vehicle-loans/:loanId', authenticate, async (req, res) => {
  if (!LOAN_EDIT_DELETE.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Only an Org Admin, HR Admin, or Super Admin can change this.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const row = await EmployeeVehicleLoan.findOne({ where: { id: req.params.loanId, employeeId: employee.id } });
    if (!row) return res.status(404).json({ status: 'error', message: 'Vehicle Loan not found' });
    const b = req.body || {};
    if (b.closureDate !== undefined) row.closureDate = b.closureDate || null;
    if (b.remarks !== undefined) row.remarks = b.remarks ? String(b.remarks).slice(0, 500) : null;
    await row.save();
    res.json({ data: { ...row.toJSON(), ...loans.vehicleLoanStatus(row, new Date()) } });
  } catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

// ---------------------------------------------------------------------
// Employee documents (PAN, Aadhar, Education Certificate, Photo, Others).
// Stored as bytes in the DB — see services/documents.js. Upload/delete use
// the same broad/narrow role split as the loan resources above: anyone in
// LOAN_WRITERS can add a document, only LOAN_EDIT_DELETE can remove one.
// ---------------------------------------------------------------------
router.get('/:id/documents', authenticate, async (req, res) => {
  if (!PAYSLIP_READERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot view this.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const rows = await documents.list(employee.id);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

router.post('/:id/documents', authenticate, async (req, res) => {
  if (!LOAN_WRITERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot upload a document.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const b = req.body || {};
    const row = await documents.upload(employee.id, b, req.user.id);
    if (b.docType === 'PHOTO') { employee.photoAssetId = row.id; await employee.save(); }
    await require('../services/audit').audit(req, 'employee.document.upload', { organizationId: employee.organizationId, targetType: 'employee', targetId: employee.id, details: { docType: row.docType, sizeBytes: row.sizeBytes } });
    res.status(201).json({ data: { id: row.id, employeeId: row.employeeId, docType: row.docType, label: row.label, mimeType: row.mimeType, sizeBytes: row.sizeBytes, sha256: row.sha256, createdAt: row.createdAt } });
  } catch (err) { res.status(err.status || 400).json({ status: 'error', message: err.message }); }
});

router.get('/:id/documents/:docId/file', authenticate, async (req, res) => {
  if (!PAYSLIP_READERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot view this.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const row = await documents.get(employee.id, req.params.docId);
    if (!row) return res.status(404).json({ status: 'error', message: 'Document not found' });
    documents.send(res, row);
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

router.delete('/:id/documents/:docId', authenticate, async (req, res) => {
  if (!LOAN_EDIT_DELETE.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Only an Org Admin, HR Admin, or Super Admin can delete this.' });
  try {
    const employee = await loadOwnEmployee(req, res); if (!employee) return;
    const row = await documents.get(employee.id, req.params.docId);
    if (!row) return res.status(404).json({ status: 'error', message: 'Document not found' });
    await row.destroy();
    if (employee.photoAssetId === row.id) { employee.photoAssetId = null; await employee.save(); }
    await require('../services/audit').audit(req, 'employee.document.delete', { organizationId: employee.organizationId, targetType: 'employee', targetId: employee.id, details: { deletedId: row.id } });
    res.json({ status: 'ok', deleted: true });
  } catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

// ---- Delete routes for every loan-style resource above (see registerDeleteRoute) ----
registerDeleteRoute('festival-advances', EmployeeFestivalAdvance, 'Festival Advance', 'employee.festival_advance.delete');
registerDeleteRoute('overdrafts', EmployeeOverdraft, 'Overdraft', 'employee.overdraft.delete');
registerDeleteRoute('recurring-deposits', EmployeeRecurringDeposit, 'Recurring Deposit', 'employee.recurring_deposit.delete');
registerDeleteRoute('lic-policies', EmployeeLic, 'LIC policy', 'employee.lic.delete');
registerDeleteRoute('housing-loans', EmployeeHousingLoan, 'Housing Loan', 'employee.housing_loan.delete');
registerDeleteRoute('vehicle-loans', EmployeeVehicleLoan, 'Vehicle Loan', 'employee.vehicle_loan.delete');

router.NON_PAY_EVENTS = NON_PAY_EVENTS;

module.exports = router;
