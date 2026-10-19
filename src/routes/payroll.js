'use strict';

/**
 * Payroll engine — /api/v1/organizations/:orgId/payroll-runs
 *
 * POST   /                    process (or re-process) one org/year/month
 * GET    /                    list this org's runs, newest first
 * GET    /:id                 one run's header + totals
 * GET    /:id/lines           every employee's frozen payslip line
 * GET    /:id/lines/:empId    one employee's full frozen payslip (payslipJson)
 * POST   /:id/approve         PROCESSED -> APPROVED (locks the run)
 * POST   /:id/reject          PROCESSED -> REJECTED (frees the org/month for a fresh run)
 * POST   /:id/mark-paid       APPROVED -> PAID
 * DELETE /:id                 remove a PROCESSED/REJECTED run (not APPROVED/PAID)
 * GET    /:id/register.csv    full payroll register export (every column)
 * GET    /:id/bank-transfer.csv  disbursement file (netPay per employee with a bank account) — APPROVED/PAID only
 * GET    /:id/lines/:empId/payslip.pdf  one employee's frozen payslip as a downloadable PDF
 * POST   /:id/send-payslips   emails the payslip PDF to some/all employees in this run (any run status except REJECTED); body { employeeIds?: [...] } — omitted = everyone
 *
 * ORG_ADMIN/HR_ADMIN/PAYROLL_OFFICER may process, list and view. Approving
 * a run is restricted to APPROVING_AUTHORITY/ORG_ADMIN/SUPER_ADMIN — the
 * same person who ran the numbers should not be the only signoff. SUPER_
 * ADMIN may act on any organisation via the :orgId in the URL, matching
 * every other org-scoped router in this project.
 */

const express = require('express');
const { Organization, Employee, PayrollRun, PayrollRunLine } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { toCsv } = require('../services/csv');
const engine = require('../services/payrollEngine');
const { buildPayslipPdf } = require('../services/payslipPdf');
const { sendPayslipForLine } = require('../services/payslipEmail');

const router = express.Router({ mergeParams: true });

const VIEWERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'];
const PROCESSORS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER'];
const APPROVERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'APPROVING_AUTHORITY'];

router.use(authenticate, requireRole(...VIEWERS));

router.use((req, res, next) => {
  if (req.user.role !== 'SUPER_ADMIN' && String(req.params.orgId) !== String(req.user.organizationId)) {
    return res.status(403).json({ status: 'error', message: "Cannot access another organisation's payroll" });
  }
  next();
});

async function loadOrgOr404(req, res) {
  const org = await Organization.findByPk(req.params.orgId);
  if (!org) { res.status(404).json({ status: 'error', message: 'Organisation not found' }); return null; }
  return org;
}

async function loadRunOr404(req, res) {
  const run = await engine.loadRun(req.params.id);
  try {
    engine.assertOwnRun(run, req.user);
  } catch (err) {
    res.status(err.status || 404).json({ status: 'error', message: err.message });
    return null;
  }
  if (String(run.organizationId) !== String(req.params.orgId)) {
    res.status(404).json({ status: 'error', message: 'Payroll run not found' });
    return null;
  }
  return run;
}

function sendEngineError(res, err) {
  res.status(err.status || 400).json({ status: 'error', message: err.message });
}

// ------------------------------------------------------------- process
router.post('/', async (req, res) => {
  if (!PROCESSORS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot process payroll.' });
  try {
    const org = await loadOrgOr404(req, res); if (!org) return;
    const b = req.body || {};
    const run = await engine.processRun({ organizationId: org.id, year: b.year, month: b.month, userId: req.user.id });
    await audit(req, 'payroll.run.processed', {
      organizationId: org.id, targetType: 'payroll_run', targetId: run.id,
      details: { year: run.year, month: run.month, employeeCount: run.employeeCount, totalNetPay: run.totalNetPay },
    });
    res.status(201).json({ data: run });
  } catch (err) { sendEngineError(res, err); }
});

// ------------------------------------------------------------- list
router.get('/', async (req, res) => {
  try {
    const org = await loadOrgOr404(req, res); if (!org) return;
    const runs = await PayrollRun.findAll({ where: { organizationId: org.id }, order: [['year', 'DESC'], ['month', 'DESC'], ['id', 'DESC']] });
    res.json({ data: runs });
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

// ------------------------------------------------------------- one run
router.get('/:id', async (req, res) => {
  try {
    const run = await loadRunOr404(req, res); if (!run) return;
    res.json({ data: run });
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

router.get('/:id/lines', async (req, res) => {
  try {
    const run = await loadRunOr404(req, res); if (!run) return;
    const lines = await PayrollRunLine.findAll({
      where: { payrollRunId: run.id },
      attributes: { exclude: ['payslipJson'] },
      order: [['empCode', 'ASC']],
    });
    res.json({ data: lines });
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

router.get('/:id/lines/:empId', async (req, res) => {
  try {
    const run = await loadRunOr404(req, res); if (!run) return;
    const line = await PayrollRunLine.findOne({ where: { payrollRunId: run.id, employeeId: req.params.empId } });
    if (!line) return res.status(404).json({ status: 'error', message: 'No payslip for that employee in this run' });
    const out = line.toJSON();
    out.payslip = JSON.parse(out.payslipJson);
    delete out.payslipJson;
    res.json({ data: out });
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

router.get('/:id/lines/:empId/payslip.pdf', async (req, res) => {
  try {
    const run = await loadRunOr404(req, res); if (!run) return;
    const line = await PayrollRunLine.findOne({ where: { payrollRunId: run.id, employeeId: req.params.empId } });
    if (!line) return res.status(404).json({ status: 'error', message: 'No payslip for that employee in this run' });
    const org = await Organization.findByPk(run.organizationId, { attributes: ['id', 'name', 'shortName'] });
    const pdf = await buildPayslipPdf({
      organization: org,
      employee: { empCode: line.empCode, name: line.employeeName, postName: line.postName },
      payslip: JSON.parse(line.payslipJson),
      year: run.year,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payslip-${line.empCode}-${run.year}-${String(run.month).padStart(2, '0')}.pdf"`);
    res.send(pdf);
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

// ------------------------------------------------------------- payslip email
// Available for a run in any status except REJECTED (a rejected run's
// numbers were wrong, so its payslips should never reach anyone), and at
// any time after processing — not just right after it, so a run can be
// re-sent later or sent to stragglers whose email was fixed afterwards.
router.post('/:id/send-payslips', async (req, res) => {
  if (!PROCESSORS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot send payslips.' });
  try {
    const run = await loadRunOr404(req, res); if (!run) return;
    if (run.status === 'REJECTED') {
      return res.status(409).json({ status: 'error', message: 'A rejected run\'s payslips cannot be emailed.' });
    }
    const b = req.body || {};
    const where = { payrollRunId: run.id };
    if (Array.isArray(b.employeeIds) && b.employeeIds.length) where.employeeId = b.employeeIds;
    const lines = await PayrollRunLine.findAll({ where });
    if (!lines.length) return res.status(404).json({ status: 'error', message: 'No matching payslip lines in this run.' });

    const org = await Organization.findByPk(run.organizationId, { attributes: ['id', 'name', 'shortName'] });
    const employees = await Employee.findAll({ where: { id: lines.map((l) => l.employeeId) }, attributes: ['id', 'officeEmail', 'personalEmail'] });
    const employeeById = {}; employees.forEach((e) => { employeeById[e.id] = e; });

    const results = [];
    for (const line of lines) {
      const employee = employeeById[line.employeeId];
      // eslint-disable-next-line no-await-in-loop
      const r = employee
        ? await sendPayslipForLine({ organization: org, employee, run, line })
        : { sent: false, error: 'Employee record no longer exists.', skipped: true };
      results.push({ employeeId: line.employeeId, empCode: line.empCode, employeeName: line.employeeName, ...r });
    }

    const sent = results.filter((r) => r.sent).length;
    const failed = results.length - sent;
    await audit(req, 'payroll.run.payslips_emailed', {
      organizationId: run.organizationId, targetType: 'payroll_run', targetId: run.id,
      details: { attempted: results.length, sent, failed },
    });
    res.json({ data: { sent, failed, total: results.length, results } });
  } catch (err) { res.status(err.status || 500).json({ status: 'error', message: err.message }); }
});

// ------------------------------------------------------------- workflow
router.post('/:id/approve', async (req, res) => {
  if (!APPROVERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot approve payroll.' });
  try {
    const run = await loadRunOr404(req, res); if (!run) return;
    await engine.approveRun(run, req.user.id);
    await audit(req, 'payroll.run.approved', { organizationId: run.organizationId, targetType: 'payroll_run', targetId: run.id, details: { year: run.year, month: run.month } });
    res.json({ data: run });
  } catch (err) { sendEngineError(res, err); }
});

router.post('/:id/reject', async (req, res) => {
  if (!APPROVERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot reject payroll.' });
  try {
    const run = await loadRunOr404(req, res); if (!run) return;
    await engine.rejectRun(run, req.user.id, (req.body || {}).reason);
    await audit(req, 'payroll.run.rejected', { organizationId: run.organizationId, targetType: 'payroll_run', targetId: run.id, details: { year: run.year, month: run.month } });
    res.json({ data: run });
  } catch (err) { sendEngineError(res, err); }
});

router.post('/:id/mark-paid', async (req, res) => {
  if (!APPROVERS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot mark payroll as paid.' });
  try {
    const run = await loadRunOr404(req, res); if (!run) return;
    await engine.markPaid(run, req.user.id);
    await audit(req, 'payroll.run.marked_paid', { organizationId: run.organizationId, targetType: 'payroll_run', targetId: run.id, details: { year: run.year, month: run.month } });
    res.json({ data: run });
  } catch (err) { sendEngineError(res, err); }
});

router.delete('/:id', async (req, res) => {
  if (!PROCESSORS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot delete a payroll run.' });
  try {
    const run = await loadRunOr404(req, res); if (!run) return;
    await engine.deleteRun(run);
    await audit(req, 'payroll.run.deleted', { organizationId: run.organizationId, targetType: 'payroll_run', targetId: req.params.id, details: { year: run.year, month: run.month } });
    res.status(204).end();
  } catch (err) { sendEngineError(res, err); }
});

// ------------------------------------------------------------- exports
const REGISTER_HEADERS = [
  'empCode', 'employeeName', 'postName', 'actualBasic', 'basic', 'da', 'hra', 'riskAllowance', 'otherAllowance',
  'cca', 'conveyance', 'medicalAllowance', 'bonus', 'grossEarnings',
  'pfEmployee', 'vpf', 'welfareFund', 'gsli', 'professionalTax', 'incomeTax',
  'festivalAdvance', 'recurringDeposit', 'lic', 'housingLoan', 'vehicleLoan', 'totalDeductions',
  'lopDays', 'netPay',
];

router.get('/:id/register.csv', async (req, res) => {
  try {
    const run = await loadRunOr404(req, res); if (!run) return;
    const lines = await PayrollRunLine.findAll({ where: { payrollRunId: run.id }, order: [['empCode', 'ASC']] });
    const rows = lines.map((l) => {
      const p = JSON.parse(l.payslipJson);
      return {
        empCode: l.empCode, employeeName: l.employeeName, postName: l.postName || '',
        ...p.earnings, ...p.deductions, lopDays: l.lopDays, netPay: l.netPay,
      };
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-register-${run.organizationId}-${engine.monthKey(run.year, run.month)}.csv"`);
    res.send(toCsv(rows, REGISTER_HEADERS));
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

const BANK_HEADERS = ['empCode', 'employeeName', 'bankName', 'bankAccountNumber', 'bankIfsc', 'netPay'];

router.get('/:id/bank-transfer.csv', async (req, res) => {
  try {
    const run = await loadRunOr404(req, res); if (!run) return;
    if (!['APPROVED', 'PAID'].includes(run.status)) {
      return res.status(409).json({ status: 'error', message: 'A bank transfer file can only be generated for an approved payroll run.' });
    }
    const lines = await PayrollRunLine.findAll({
      where: { payrollRunId: run.id, hasBankDetails: true },
      order: [['empCode', 'ASC']],
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bank-transfer-${run.organizationId}-${engine.monthKey(run.year, run.month)}.csv"`);
    res.send(toCsv(lines.map((l) => l.toJSON()), BANK_HEADERS));
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

module.exports = router;
