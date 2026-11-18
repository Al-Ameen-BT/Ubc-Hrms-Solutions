'use strict';

const express = require('express');
const { requireFeaturePermission } = require('../middleware/permissions');

const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize, User, Employee, PayrollRun, PayrollRunLine, LeaveType, LeaveApplication, Organization, EmployeePolicy, EmployeePolicyAcknowledgement, OrganizationHoliday, EmployeeTimeEntry, ExpenseClaim, ExpenseReceipt } = require('../models');
const { authenticate } = require('../middleware/auth');
const { audit } = require('../services/audit');
const leave = require('../services/leave');
const { buildPayslipPdf } = require('../services/payslipPdf');
const documents = require('../services/documents');
const { organizationChart } = require('../services/organizationChart');
const { isDateOnly } = require('../services/dateUtils');

const router = express.Router();
const SELF_SERVICE_ROLES = User.EMPLOYEE_SELF_SERVICE_ROLES;
router.use(authenticate, requireFeaturePermission('self.profile', SELF_SERVICE_ROLES));

async function ownEmployee(req) {
  if (!req.user.employeeId) return null;
  if (await User.count({ where: { employeeId: req.user.employeeId, organizationId: req.user.organizationId, status: 'ACTIVE' } }) !== 1) return null;
  return Employee.findOne({ where: { id: req.user.employeeId, organizationId: req.user.organizationId, status: 'ACTIVE' } });
}
function fail(res, err) { return res.status(err.status || 500).json({ status: 'error', message: err.message }); }
function bankDate(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const dpdpAcknowledgements = require('../services/dpdpAcknowledgements');
const { markDpdpPendingAllowed } = require('../middleware/dpdp');
const { signToken } = require('../services/authService');

router.get('/dpdp', markDpdpPendingAllowed, requireFeaturePermission('self.profile', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const status = await dpdpAcknowledgements.acknowledgementStatus({ user: req.user, channel: 'WEB' });
    res.json({ data: status });
  } catch (err) { fail(res, err); }
});

router.post('/dpdp/acknowledge', markDpdpPendingAllowed, requireFeaturePermission('self.profile', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const { documentIds } = req.body || {};
    const employee = await ownEmployee(req);
    await dpdpAcknowledgements.recordAcknowledgements({
      user: req.user,
      employee,
      documentIds,
      channel: 'WEB',
    });
    const status = await dpdpAcknowledgements.acknowledgementStatus({ user: req.user, channel: 'WEB' });
    const fullUser = await User.findByPk(req.user.id);
    const token = signToken(fullUser, { dpdpPending: !status.isCurrent });
    res.json({ data: status, token });
  } catch (err) { fail(res, err); }
});

const dpdpCases = require('../services/dpdpCases');
const dpdpDocuments = require('../services/dpdpDocuments');
const dpdpConsent = require('../services/dpdpConsent');

router.get('/dpdp/notices', requireFeaturePermission('self.profile', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const bundle = await dpdpDocuments.activeBundle({ organizationId: req.user.organizationId });
    res.json({ data: { asOf: bundle.asOf, terms: dpdpDocuments.publicDocumentView(bundle.terms), platformPrivacy: dpdpDocuments.publicDocumentView(bundle.platformPrivacy), employeeNotice: dpdpDocuments.publicDocumentView(bundle.employeeNotice) } });
  } catch (err) { fail(res, err); }
});

router.get('/dpdp/consents', requireFeaturePermission('self.profile', SELF_SERVICE_ROLES), async (req, res) => {
  try { res.json({ data: await dpdpConsent.currentChoices({ actor: req.user, employee: await ownEmployee(req) }) }); } catch (err) { fail(res, err); }
});

async function changeConsent(req, res, decision) {
  try {
    const hash = (value) => value ? crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32) : null;
    const row = await dpdpConsent.recordChoice({
      actor: req.user,
      employee: await ownEmployee(req),
      purposeCode: req.params.purposeCode,
      decision,
      channel: 'WEB',
      language: req.body?.language || 'EN',
      ipReference: hash(req.ip),
      deviceReference: hash(req.get('user-agent')),
    });
    res.status(201).json({ data: row });
  } catch (err) { fail(res, err); }
}

router.post('/dpdp/consents/:purposeCode/grant', requireFeaturePermission('self.profile', SELF_SERVICE_ROLES), (req, res) => changeConsent(req, res, 'GRANTED'));
router.post('/dpdp/consents/:purposeCode/withdraw', requireFeaturePermission('self.profile', SELF_SERVICE_ROLES), (req, res) => changeConsent(req, res, 'WITHDRAWN'));

router.get('/dpdp/requests', requireFeaturePermission('self.profile', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const employee = await ownEmployee(req);
    const list = await dpdpCases.listMyRequests({ actor: req.user, employee });
    res.json({ data: list });
  } catch (err) { fail(res, err); }
});

router.post('/dpdp/requests', requireFeaturePermission('self.profile', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const employee = await ownEmployee(req);
    const { requestType, details } = req.body || {};
    const created = await dpdpCases.createRequest({
      actor: req.user,
      employee,
      requestType,
      details,
    });
    res.status(201).json({ data: created });
  } catch (err) { fail(res, err); }
});

router.get('/context', requireFeaturePermission('self.profile', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const employee = await ownEmployee(req);
    res.json({ data: { linked: !!employee, employee: employee ? { id: employee.id, empCode: employee.empCode, name: employee.name, designation: employee.designation, department: employee.department, branchName: employee.branchName } : null } });
  } catch (err) { fail(res, err); }
});

router.use(async (req, res, next) => {
  try {
    req.employee = await ownEmployee(req);
    if (!req.employee) return res.status(409).json({ status: 'error', code: 'EMPLOYEE_NOT_LINKED', message: 'Your account is not linked to an active employee record in this bank.' });
    next();
  } catch (err) { fail(res, err); }
});

router.get('/payslips', requireFeaturePermission('self.payslips', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const lines = await PayrollRunLine.findAll({
      where: { employeeId: req.employee.id },
      attributes: ['id', 'grossEarnings', 'totalDeductions', 'netPay'],
      include: [{ model: PayrollRun, where: { organizationId: req.user.organizationId, status: ['APPROVED', 'PAID'] }, attributes: ['year', 'month', 'status'] }],
      order: [[PayrollRun, 'year', 'DESC'], [PayrollRun, 'month', 'DESC'], ['id', 'DESC']],
    });
    res.json({ data: lines.map(line => ({ id: line.id, year: line.PayrollRun.year, month: line.PayrollRun.month, status: line.PayrollRun.status, grossEarnings: line.grossEarnings, totalDeductions: line.totalDeductions, netPay: line.netPay })) });
  } catch (err) { fail(res, err); }
});

router.get('/payslips/:id/pdf', requireFeaturePermission('self.payslips', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const line = await PayrollRunLine.findOne({ where: { id: req.params.id, employeeId: req.employee.id }, include: [{ model: PayrollRun, where: { organizationId: req.user.organizationId, status: ['APPROVED', 'PAID'] } }] });
    if (!line) return res.status(404).json({ status: 'error', message: 'Payslip not found.' });
    const org = await Organization.findByPk(req.user.organizationId, { attributes: ['id', 'name', 'shortName'] });
    const pdf = await buildPayslipPdf({ organization: org, employee: { empCode: line.empCode, name: line.employeeName, postName: line.postName }, payslip: JSON.parse(line.payslipJson), year: line.PayrollRun.year });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payslip-${line.empCode}-${line.PayrollRun.year}-${String(line.PayrollRun.month).padStart(2, '0')}.pdf"`);
    res.send(pdf);
  } catch (err) { fail(res, err); }
});

router.get('/leave/types', requireFeaturePermission('self.leave', SELF_SERVICE_ROLES), async (req, res) => {
  try { res.json({ data: await LeaveType.findAll({ where: { organizationId: req.user.organizationId, status: 'ACTIVE' }, order: [['name', 'ASC']] }) }); }
  catch (err) { fail(res, err); }
});
router.get('/leave/balances', requireFeaturePermission('self.leave', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const year = req.query.year == null ? await leave.currentYearLabel(req.user.organizationId) : Number(req.query.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return res.status(400).json({ status: 'error', message: 'Invalid year.' });
    res.json({ data: await leave.balancesFor(req.employee.id, year), year });
  } catch (err) { fail(res, err); }
});
router.get('/leave/applications', requireFeaturePermission('self.leave', SELF_SERVICE_ROLES), async (req, res) => {
  try { res.json({ data: await LeaveApplication.findAll({ where: { employeeId: req.employee.id }, include: [{ model: LeaveType }], order: [['fromDate', 'DESC'], ['id', 'DESC']] }) }); }
  catch (err) { fail(res, err); }
});
router.post('/leave/applications', requireFeaturePermission('self.leave', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const { leaveTypeId, fromDate, toDate, reason } = req.body || {};
    if (!isDateOnly(fromDate) || !isDateOnly(toDate)) return res.status(400).json({ status: 'error', message: 'Use valid YYYY-MM-DD dates.' });
    const row = await leave.applyLeave(req.employee, { leaveTypeId, fromDate, toDate, reason }, req.user.id);
    await audit(req, 'leave_application.create', { targetType: 'leave_application', targetId: row.id });
    res.status(201).json({ data: row });
  } catch (err) { fail(res, err); }
});
router.post('/leave/applications/:id/cancel', requireFeaturePermission('self.leave', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const row = await LeaveApplication.findOne({ where: { id: req.params.id, employeeId: req.employee.id } });
    if (!row) return res.status(404).json({ status: 'error', message: 'Leave application not found.' });
    if (row.status !== 'PENDING') return res.status(409).json({ status: 'error', message: 'Only pending leave requests can be withdrawn.' });
    await leave.cancelLeave(row, req.user.id);
    await audit(req, 'leave_application.cancel', { targetType: 'leave_application', targetId: row.id });
    res.json({ data: row });
  } catch (err) { fail(res, err); }
});

router.get('/policy', requireFeaturePermission('self.policies', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const policy = await EmployeePolicy.findOne({ where: { organizationId: req.user.organizationId }, order: [['version', 'DESC']] });
    const history = await EmployeePolicyAcknowledgement.findAll({ where: { userId: req.user.id, organizationId: req.user.organizationId }, include: [{ model: EmployeePolicy, attributes: ['version', 'title', 'body'] }], order: [['acknowledgedAt', 'DESC']] });
    res.json({ data: { policy, acknowledged: !!policy && history.some(row => row.policyId === policy.id), history } });
  } catch (err) { fail(res, err); }
});
router.post('/policy/acknowledge', requireFeaturePermission('self.policies', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const policy = await EmployeePolicy.findOne({ where: { organizationId: req.user.organizationId }, order: [['version', 'DESC']] });
    if (!policy) return res.status(404).json({ status: 'error', message: 'No policy has been published.' });
    if (Number(req.body?.version) !== policy.version) return res.status(409).json({ status: 'error', message: 'The policy has changed. Read the current version before acknowledging.' });
    const [row, created] = await EmployeePolicyAcknowledgement.findOrCreate({ where: { policyId: policy.id, userId: req.user.id }, defaults: { organizationId: req.user.organizationId, employeeId: req.employee.id, acknowledgedAt: new Date() } });
    if (created) await audit(req, 'employee_policy.acknowledge', { targetType: 'employee_policy', targetId: policy.id, details: { version: policy.version } });
    res.status(created ? 201 : 200).json({ data: row });
  } catch (err) { fail(res, err); }
});
router.get('/calendar', requireFeaturePermission('self.attendance', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const year = Number(req.query.year); const month = Number(req.query.month);
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) return res.status(400).json({ status: 'error', message: 'Valid year and month are required.' });
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const [holidays, applications] = await Promise.all([
      OrganizationHoliday.findAll({ where: { organizationId: req.user.organizationId, status: 'ACTIVE', date: { [Op.between]: [start, end] } }, order: [['date', 'ASC']] }),
      LeaveApplication.findAll({ where: { employeeId: req.employee.id, fromDate: { [Op.lte]: end }, toDate: { [Op.gte]: start }, status: ['PENDING', 'APPROVED'] }, include: [{ model: LeaveType, attributes: ['name'] }], order: [['fromDate', 'ASC']] }),
    ]);
    const time = await EmployeeTimeEntry.findAll({ where: { employeeId: req.employee.id, organizationId: req.user.organizationId, localDate: { [Op.between]: [start, end] } }, order: [['localDate', 'ASC']] });
    res.json({ data: { year, month, holidays, leave: applications, time } });
  } catch (err) { fail(res, err); }
});

router.get('/chart', requireFeaturePermission('chart.view', SELF_SERVICE_ROLES), async (req, res) => {
  try { res.json({ data: await organizationChart({ actor: req.user, at: req.query.at, view: 'employee' }) }); }
  catch (err) { fail(res, err); }
});
router.get('/workplace', requireFeaturePermission('self.attendance', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const chart = await organizationChart({ actor: req.user, at: req.query.at, view: 'employee' });
    res.json({ data: chart.employees.map(row => ({
      id: row.id, empCode: row.empCode, name: row.name, photoRef: row.photoRef,
      branchId: row.branch.id, branchName: row.branch.name,
      departmentId: row.department?.id || null, department: row.department?.name || null,
      positionId: row.position?.id || null, designation: row.position?.name || null, postName: row.position?.name || null,
      reportsToPositionId: row.position?.reportsToPositionId || null,
    })), context: chart.context, leadership: chart.leadership });
  } catch (err) { fail(res, err); }
});
router.get('/time', requireFeaturePermission('self.attendance', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const today = bankDate();
    const year = Number(req.query.year || today.slice(0, 4));
    const month = Number(req.query.month || today.slice(5, 7));
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) return res.status(400).json({ status: 'error', message: 'Invalid year or month.' });
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    res.json({ data: await EmployeeTimeEntry.findAll({ where: { employeeId: req.employee.id, organizationId: req.user.organizationId, localDate: { [Op.between]: [start, end] } }, order: [['localDate', 'DESC']] }) });
  } catch (err) { fail(res, err); }
});
router.post('/time/check-in', requireFeaturePermission('self.attendance', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const localDate = bankDate();
    if (await EmployeeTimeEntry.findOne({ where: { employeeId: req.employee.id, checkOutAt: null } }) || await EmployeeTimeEntry.findOne({ where: { employeeId: req.employee.id, localDate } })) return res.status(409).json({ status: 'error', message: 'Already checked in. Complete the open entry or ask HR for a correction.' });
    const row = await EmployeeTimeEntry.create({ organizationId: req.user.organizationId, employeeId: req.employee.id, localDate, checkInAt: new Date() });
    await audit(req, 'employee_time.check_in', { targetType: 'employee_time_entry', targetId: row.id });
    res.status(201).json({ data: row });
  } catch (err) { res.status(err.name === 'SequelizeUniqueConstraintError' ? 409 : 500).json({ status: 'error', message: err.message }); }
});
router.post('/time/check-out', requireFeaturePermission('self.attendance', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const row = await EmployeeTimeEntry.findOne({ where: { employeeId: req.employee.id, organizationId: req.user.organizationId, checkOutAt: null }, order: [['checkInAt', 'DESC']] });
    if (!row) return res.status(409).json({ status: 'error', message: 'No open check-in.' });
    const [changed] = await EmployeeTimeEntry.update({ checkOutAt: new Date() }, { where: { id: row.id, employeeId: req.employee.id, organizationId: req.user.organizationId, checkOutAt: null } });
    if (!changed) return res.status(409).json({ status: 'error', message: 'This check-in has already changed.' });
    await row.reload();
    await audit(req, 'employee_time.check_out', { targetType: 'employee_time_entry', targetId: row.id });
    res.json({ data: row });
  } catch (err) { fail(res, err); }
});

router.get('/expenses', requireFeaturePermission('self.claims', SELF_SERVICE_ROLES), async (req, res) => {
  try { res.json({ data: await ExpenseClaim.findAll({ where: { employeeId: req.employee.id, organizationId: req.user.organizationId }, order: [['createdAt', 'DESC'], ['id', 'DESC']] }) }); }
  catch (err) { fail(res, err); }
});
router.post('/expenses', requireFeaturePermission('self.claims', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const { expenseDate, category, purpose, amount, receiptDataUrl } = req.body || {};
    const rupees = Number(amount);
    if (!isDateOnly(expenseDate) || !String(category || '').trim() || !String(purpose || '').trim() || !Number.isSafeInteger(rupees) || rupees <= 0 || rupees > 100000000) return res.status(400).json({ status: 'error', message: 'Valid date, category, purpose, and positive whole-rupee amount are required.' });
    const { buf, mimeType } = documents.decodeUpload(receiptDataUrl);
    const row = await sequelize.transaction(async transaction => {
      const claim = await ExpenseClaim.create({ organizationId: req.user.organizationId, employeeId: req.employee.id, expenseDate, category: String(category).trim().slice(0, 64), purpose: String(purpose).trim().slice(0, 500), amount: rupees, submittedBy: req.user.id }, { transaction });
      await ExpenseReceipt.create({ claimId: claim.id, mimeType, data: buf, sizeBytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') }, { transaction });
      return claim;
    });
    await audit(req, 'expense_claim.submit', { targetType: 'expense_claim', targetId: row.id, details: { amount: row.amount } });
    res.status(201).json({ data: row });
  } catch (err) { fail(res, err); }
});
router.get('/expenses/:id/receipt', requireFeaturePermission('self.claims', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const row = await ExpenseClaim.findOne({ where: { id: req.params.id, employeeId: req.employee.id, organizationId: req.user.organizationId } });
    if (!row) return res.status(404).json({ status: 'error', message: 'Claim not found.' });
    const receipt = await ExpenseReceipt.findOne({ where: { claimId: row.id } });
    if (!receipt) return res.status(404).json({ status: 'error', message: 'Receipt not found.' });
    documents.send(res, receipt);
  } catch (err) { fail(res, err); }
});
router.post('/expenses/:id/withdraw', requireFeaturePermission('self.claims', SELF_SERVICE_ROLES), async (req, res) => {
  try {
    const row = await ExpenseClaim.findOne({ where: { id: req.params.id, employeeId: req.employee.id, organizationId: req.user.organizationId } });
    if (!row) return res.status(404).json({ status: 'error', message: 'Claim not found.' });
    if (!['SUBMITTED', 'PREPARED'].includes(row.status)) return res.status(409).json({ status: 'error', message: 'Only pending claims can be withdrawn.' });
    const [changed] = await ExpenseClaim.update({ status: 'WITHDRAWN' }, { where: { id: row.id, employeeId: req.employee.id, organizationId: req.user.organizationId, status: ['SUBMITTED', 'PREPARED'] } });
    if (!changed) return res.status(409).json({ status: 'error', message: 'This claim has already changed status.' });
    await row.reload();
    await audit(req, 'expense_claim.withdraw', { targetType: 'expense_claim', targetId: row.id });
    res.json({ data: row });
  } catch (err) { fail(res, err); }
});

module.exports = router;
