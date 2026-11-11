'use strict';

const express = require('express');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize, User, Employee, PostCadre, BankRuleCatalogue, EmployeeCompensationAssignment, PayrollRun, PayrollRunLine, LeaveType, LeaveApplication, Organization, EmployeePolicy, EmployeePolicyAcknowledgement, OrganizationHoliday, EmployeeTimeEntry, ExpenseClaim, ExpenseReceipt } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const leave = require('../services/leave');
const { buildPayslipPdf } = require('../services/payslipPdf');
const documents = require('../services/documents');
const { isDateOnly } = require('../services/dateUtils');

const router = express.Router();
router.use(authenticate, requireRole('EMPLOYEE'));

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

router.get('/context', async (req, res) => {
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

router.get('/payslips', async (req, res) => {
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

router.get('/payslips/:id/pdf', async (req, res) => {
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

router.get('/leave/types', async (req, res) => {
  try { res.json({ data: await LeaveType.findAll({ where: { organizationId: req.user.organizationId, status: 'ACTIVE' }, order: [['name', 'ASC']] }) }); }
  catch (err) { fail(res, err); }
});
router.get('/leave/balances', async (req, res) => {
  try {
    const year = req.query.year == null ? await leave.currentYearLabel(req.user.organizationId) : Number(req.query.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return res.status(400).json({ status: 'error', message: 'Invalid year.' });
    res.json({ data: await leave.balancesFor(req.employee.id, year), year });
  } catch (err) { fail(res, err); }
});
router.get('/leave/applications', async (req, res) => {
  try { res.json({ data: await LeaveApplication.findAll({ where: { employeeId: req.employee.id }, include: [{ model: LeaveType }], order: [['fromDate', 'DESC'], ['id', 'DESC']] }) }); }
  catch (err) { fail(res, err); }
});
router.post('/leave/applications', async (req, res) => {
  try {
    const { leaveTypeId, fromDate, toDate, reason } = req.body || {};
    if (!isDateOnly(fromDate) || !isDateOnly(toDate)) return res.status(400).json({ status: 'error', message: 'Use valid YYYY-MM-DD dates.' });
    const row = await leave.applyLeave(req.employee, { leaveTypeId, fromDate, toDate, reason }, req.user.id);
    await audit(req, 'leave_application.create', { targetType: 'leave_application', targetId: row.id });
    res.status(201).json({ data: row });
  } catch (err) { fail(res, err); }
});
router.post('/leave/applications/:id/cancel', async (req, res) => {
  try {
    const row = await LeaveApplication.findOne({ where: { id: req.params.id, employeeId: req.employee.id } });
    if (!row) return res.status(404).json({ status: 'error', message: 'Leave application not found.' });
    if (row.status !== 'PENDING') return res.status(409).json({ status: 'error', message: 'Only pending leave requests can be withdrawn.' });
    await leave.cancelLeave(row, req.user.id);
    await audit(req, 'leave_application.cancel', { targetType: 'leave_application', targetId: row.id });
    res.json({ data: row });
  } catch (err) { fail(res, err); }
});

router.get('/policy', async (req, res) => {
  try {
    const policy = await EmployeePolicy.findOne({ where: { organizationId: req.user.organizationId }, order: [['version', 'DESC']] });
    const history = await EmployeePolicyAcknowledgement.findAll({ where: { userId: req.user.id, organizationId: req.user.organizationId }, include: [{ model: EmployeePolicy, attributes: ['version', 'title', 'body'] }], order: [['acknowledgedAt', 'DESC']] });
    res.json({ data: { policy, acknowledged: !!policy && history.some(row => row.policyId === policy.id), history } });
  } catch (err) { fail(res, err); }
});
router.post('/policy/acknowledge', async (req, res) => {
  try {
    const policy = await EmployeePolicy.findOne({ where: { organizationId: req.user.organizationId }, order: [['version', 'DESC']] });
    if (!policy) return res.status(404).json({ status: 'error', message: 'No policy has been published.' });
    if (Number(req.body?.version) !== policy.version) return res.status(409).json({ status: 'error', message: 'The policy has changed. Read the current version before acknowledging.' });
    const [row, created] = await EmployeePolicyAcknowledgement.findOrCreate({ where: { policyId: policy.id, userId: req.user.id }, defaults: { organizationId: req.user.organizationId, employeeId: req.employee.id, acknowledgedAt: new Date() } });
    if (created) await audit(req, 'employee_policy.acknowledge', { targetType: 'employee_policy', targetId: policy.id, details: { version: policy.version } });
    res.status(created ? 201 : 200).json({ data: row });
  } catch (err) { fail(res, err); }
});
router.get('/calendar', async (req, res) => {
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

router.get('/workplace', async (req, res) => {
  try {
    const employees = await Employee.findAll({ where: { organizationId: req.user.organizationId, status: 'ACTIVE' }, attributes: ['id', 'empCode', 'name', 'branchName', 'department', 'designation'], include: [{ model: PostCadre, attributes: ['name'] }], order: [['branchName', 'ASC'], ['department', 'ASC'], ['name', 'ASC']] });
    const assignments = await EmployeeCompensationAssignment.findAll({ where: { organizationId: req.user.organizationId, status: 'APPROVED', effectiveDate: { [Op.lte]: bankDate() }, employeeId: { [Op.in]: employees.map(row => row.id) } }, order: [['effectiveDate', 'DESC'], ['id', 'DESC']] });
    const byEmployee = new Map();
    for (const assignment of assignments) if (!byEmployee.has(assignment.employeeId)) byEmployee.set(assignment.employeeId, assignment);
    const catalogues = await BankRuleCatalogue.findAll({ where: { id: { [Op.in]: [...new Set(assignments.map(row => row.catalogueId).filter(Boolean))] } } });
    const byCatalogue = new Map(catalogues.map(row => [row.id, row]));
    res.json({ data: employees.map(row => {
      const assignment = byEmployee.get(row.id);
      const post = byCatalogue.get(assignment?.catalogueId)?.posts?.find(item => item.code === assignment.postCode);
      return { id: row.id, empCode: row.empCode, name: row.name, branchName: row.branchName, department: row.department, designation: row.designation, postName: post?.name || row.PostCadre?.name || null };
    }) });
  } catch (err) { fail(res, err); }
});
router.get('/time', async (req, res) => {
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
router.post('/time/check-in', async (req, res) => {
  try {
    const localDate = bankDate();
    if (await EmployeeTimeEntry.findOne({ where: { employeeId: req.employee.id, checkOutAt: null } }) || await EmployeeTimeEntry.findOne({ where: { employeeId: req.employee.id, localDate } })) return res.status(409).json({ status: 'error', message: 'Already checked in. Complete the open entry or ask HR for a correction.' });
    const row = await EmployeeTimeEntry.create({ organizationId: req.user.organizationId, employeeId: req.employee.id, localDate, checkInAt: new Date() });
    await audit(req, 'employee_time.check_in', { targetType: 'employee_time_entry', targetId: row.id });
    res.status(201).json({ data: row });
  } catch (err) { res.status(err.name === 'SequelizeUniqueConstraintError' ? 409 : 500).json({ status: 'error', message: err.message }); }
});
router.post('/time/check-out', async (req, res) => {
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

router.get('/expenses', async (req, res) => {
  try { res.json({ data: await ExpenseClaim.findAll({ where: { employeeId: req.employee.id, organizationId: req.user.organizationId }, order: [['createdAt', 'DESC'], ['id', 'DESC']] }) }); }
  catch (err) { fail(res, err); }
});
router.post('/expenses', async (req, res) => {
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
router.get('/expenses/:id/receipt', async (req, res) => {
  try {
    const row = await ExpenseClaim.findOne({ where: { id: req.params.id, employeeId: req.employee.id, organizationId: req.user.organizationId } });
    if (!row) return res.status(404).json({ status: 'error', message: 'Claim not found.' });
    const receipt = await ExpenseReceipt.findOne({ where: { claimId: row.id } });
    if (!receipt) return res.status(404).json({ status: 'error', message: 'Receipt not found.' });
    documents.send(res, receipt);
  } catch (err) { fail(res, err); }
});
router.post('/expenses/:id/withdraw', async (req, res) => {
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
