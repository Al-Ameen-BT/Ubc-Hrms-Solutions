'use strict';

/**
 * DA Arrears Management — /api/v1/da-revisions and /api/v1/arrears-cases
 *
 * DA Revision Master (the Government Order record):
 *   GET    /da-revisions                 list this org's revisions
 *   GET    /da-revisions/:id             one revision
 *   POST   /da-revisions                 create (starts as DRAFT)
 *   PUT    /da-revisions/:id             edit (DRAFT only)
 *   POST   /da-revisions/:id/status      advance DRAFT->APPROVED->ACTIVE->CLOSED
 *   GET    /da-revisions/:id/document        the uploaded GO scan's metadata
 *   GET    /da-revisions/:id/document/file   the GO scan's bytes
 *   POST   /da-revisions/:id/document        upload/replace the GO scan
 *   DELETE /da-revisions/:id/document        remove the GO scan
 *   POST   /da-revisions/:id/calculate   calculate (or recalculate) arrears for every eligible employee
 *   GET    /da-revisions/:id/cases       every employee's ArrearsCase under this revision
 *
 * Arrears Cases (one employee's calculated arrears + payment plan):
 *   GET    /arrears-cases/:id                    case detail — month-by-month ledger + installments
 *   PUT    /arrears-cases/:id/adjust             Manual Adjustment (mandatory reason) — spec payment mode 4
 *   POST   /arrears-cases/:id/payment-plan       set Single Shot / Installment / Custom Installment — spec modes 1-3
 *   DELETE /arrears-cases/:id/payment-plan       clear the still-pending part of the plan
 *   POST   /arrears-cases/:id/installments/:installmentId/pay          pay one installment — standalone,
 *          separate from salary. Marks it PAID, posts a Service Book entry, makes a receipt available.
 *   GET    /arrears-cases/:id/installments/:installmentId/receipt.pdf  that installment's PDF receipt (PAID only)
 *
 * Same role split as payroll.js: VIEWERS may read; PROCESSORS may create/
 * edit/calculate/set payment plans; final DRAFT->APPROVED signoff on a
 * revision is reserved for APPROVERS — the same separation of duties
 * payroll approval already uses, since an arrears order is itself a
 * financial commitment.
 */

const express = require('express');
const {
  DaRevision, DaRevisionDocument, ArrearsCase, ArrearsMonthDetail, ArrearsInstallment, PayrollRun, Employee, Organization, PostCadre,
} = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const attachments = require('../services/attachments');
const daRevisions = require('../services/daRevisions');
const arrears = require('../services/arrears');
const { buildArrearsReceiptPdf } = require('../services/arrearsReceiptPdf');

const VIEWERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'];
const PROCESSORS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER'];
const APPROVERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'APPROVING_AUTHORITY'];

function sendErr(res, err) { res.status(err.status || 500).json({ status: 'error', message: err.message }); }

function orgIdFor(req) {
  // Every route here is org-scoped by the caller's own organisation, same
  // as orgSettings.js — a SUPER_ADMIN has no organisation of their own and
  // administers revisions through an org's own admins, not directly.
  return req.user.organizationId;
}

// ---------------------------------------------------------- DA Revisions

const revisions = express.Router();
revisions.use(authenticate, requireRole(...VIEWERS));

async function loadRevisionOr404(req, res) {
  const row = await DaRevision.findByPk(req.params.id);
  if (!row || (req.user.role !== 'SUPER_ADMIN' && String(row.organizationId) !== String(orgIdFor(req)))) {
    res.status(404).json({ status: 'error', message: 'DA Revision not found' });
    return null;
  }
  return row;
}

revisions.get('/', async (req, res) => {
  try {
    const rows = await DaRevision.findAll({ where: { organizationId: orgIdFor(req) }, order: [['effectiveFrom', 'DESC'], ['id', 'DESC']] });
    res.json({ data: rows });
  } catch (err) { sendErr(res, err); }
});

revisions.get('/:id', async (req, res) => {
  try {
    const row = await loadRevisionOr404(req, res); if (!row) return;
    const doc = await attachments.info(DaRevisionDocument, 'daRevisionId', row.id);
    res.json({ data: { ...row.toJSON(), document: doc } });
  } catch (err) { sendErr(res, err); }
});

revisions.post('/', async (req, res) => {
  if (!PROCESSORS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot create a DA Revision.' });
  try {
    const row = await daRevisions.create(orgIdFor(req), req.body);
    await audit(req, 'da_revision.create', { organizationId: row.organizationId, targetType: 'da_revision', targetId: row.id, details: { orderNumber: row.orderNumber } });
    res.status(201).json({ data: row });
  } catch (err) { sendErr(res, err); }
});

revisions.put('/:id', async (req, res) => {
  if (!PROCESSORS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot edit a DA Revision.' });
  try {
    const row = await loadRevisionOr404(req, res); if (!row) return;
    await daRevisions.update(row, req.body);
    await audit(req, 'da_revision.update', { organizationId: row.organizationId, targetType: 'da_revision', targetId: row.id });
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

revisions.post('/:id/status', async (req, res) => {
  try {
    const row = await loadRevisionOr404(req, res); if (!row) return;
    const toStatus = req.body && req.body.status;
    const needsApprover = row.status === 'DRAFT' && toStatus === 'APPROVED';
    const allowed = needsApprover ? APPROVERS : PROCESSORS;
    if (!allowed.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot make this status change.' });
    await daRevisions.advanceStatus(row, toStatus);
    await audit(req, 'da_revision.status', { organizationId: row.organizationId, targetType: 'da_revision', targetId: row.id, details: { status: row.status } });
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

// ---- Government Order scan (mirrors routes/governmentOrderDocuments.js) ----
revisions.get('/:id/document', async (req, res) => {
  try {
    const row = await loadRevisionOr404(req, res); if (!row) return;
    res.json({ data: await attachments.info(DaRevisionDocument, 'daRevisionId', row.id) });
  } catch (err) { sendErr(res, err); }
});

revisions.get('/:id/document/file', async (req, res) => {
  try {
    const row = await loadRevisionOr404(req, res); if (!row) return;
    const doc = await attachments.get(DaRevisionDocument, 'daRevisionId', row.id);
    if (!doc) return res.status(404).json({ status: 'error', message: 'No document uploaded for this DA Revision' });
    attachments.send(res, doc);
  } catch (err) { sendErr(res, err); }
});

revisions.post('/:id/document', async (req, res) => {
  if (!PROCESSORS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot upload a document.' });
  try {
    const row = await loadRevisionOr404(req, res); if (!row) return;
    const b = req.body || {};
    const meta = await attachments.save(DaRevisionDocument, 'daRevisionId', row.id, { label: b.label, dataUrl: b.dataUrl }, req.user.id);
    await audit(req, 'da_revision.document.upload', { organizationId: row.organizationId, targetType: 'da_revision', targetId: row.id, details: { sizeBytes: meta.sizeBytes } });
    res.status(201).json({ data: meta });
  } catch (err) { sendErr(res, err); }
});

revisions.delete('/:id/document', async (req, res) => {
  if (!PROCESSORS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot delete this document.' });
  try {
    const row = await loadRevisionOr404(req, res); if (!row) return;
    await attachments.remove(DaRevisionDocument, 'daRevisionId', row.id);
    await audit(req, 'da_revision.document.delete', { organizationId: row.organizationId, targetType: 'da_revision', targetId: row.id });
    res.json({ status: 'ok' });
  } catch (err) { sendErr(res, err); }
});

// ---- Calculation ----
revisions.post('/:id/calculate', async (req, res) => {
  if (!PROCESSORS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot calculate arrears.' });
  try {
    const row = await loadRevisionOr404(req, res); if (!row) return;
    const cases = await arrears.calculateForRevision(row, req.user.id);
    await audit(req, 'da_revision.calculate', { organizationId: row.organizationId, targetType: 'da_revision', targetId: row.id, details: { employeeCount: cases.length } });
    res.json({ data: { employeeCount: cases.length, totalAmount: arrears.round2(cases.reduce((s, c) => s + Number(c.totalCalculatedAmount), 0)) } });
  } catch (err) { sendErr(res, err); }
});

revisions.get('/:id/cases', async (req, res) => {
  try {
    const row = await loadRevisionOr404(req, res); if (!row) return;
    const rows = await ArrearsCase.findAll({ where: { daRevisionId: row.id }, order: [['empCode', 'ASC']] });
    res.json({ data: rows });
  } catch (err) { sendErr(res, err); }
});

// ---------------------------------------------------------- Arrears Cases

const cases = express.Router();
cases.use(authenticate, requireRole(...VIEWERS));

async function loadCaseOr404(req, res) {
  try {
    return await arrears.loadCaseOr404(req.params.id, orgIdFor(req));
  } catch (err) {
    if (req.user.role === 'SUPER_ADMIN') {
      const row = await ArrearsCase.findByPk(req.params.id);
      if (row) return row;
    }
    res.status(err.status || 404).json({ status: 'error', message: err.message });
    return null;
  }
}

cases.get('/:id', async (req, res) => {
  try {
    const row = await loadCaseOr404(req, res); if (!row) return;
    const [months, installments, revision] = await Promise.all([
      ArrearsMonthDetail.findAll({ where: { arrearsCaseId: row.id }, order: [['year', 'ASC'], ['month', 'ASC']] }),
      ArrearsInstallment.findAll({
        where: { arrearsCaseId: row.id },
        include: [{ model: PayrollRun, as: 'PaidInPayrollRun', required: false, attributes: ['id', 'year', 'month', 'status'] }],
        order: [['year', 'ASC'], ['month', 'ASC']],
      }),
      DaRevision.findByPk(row.daRevisionId),
    ]);
    res.json({ data: { case: row, months, installments, revision } });
  } catch (err) { sendErr(res, err); }
});

cases.put('/:id/adjust', async (req, res) => {
  if (!PROCESSORS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot adjust arrears.' });
  try {
    const row = await loadCaseOr404(req, res); if (!row) return;
    const b = req.body || {};
    await arrears.adjustAmount(row, { approvedAmount: b.approvedAmount, reason: b.reason, userId: req.user.id });
    await audit(req, 'arrears_case.adjust', { organizationId: row.organizationId, targetType: 'arrears_case', targetId: row.id, details: { approvedAmount: b.approvedAmount, reason: b.reason } });
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

cases.post('/:id/payment-plan', async (req, res) => {
  if (!PROCESSORS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot set a payment plan.' });
  try {
    const row = await loadCaseOr404(req, res); if (!row) return;
    const b = req.body || {};
    const mode = b.mode;
    if (mode === 'SINGLE_SHOT') await arrears.setSingleShot(row, { year: b.year, month: b.month, userId: req.user.id });
    else if (mode === 'INSTALLMENT') await arrears.setInstallments(row, { numberOfInstallments: b.numberOfInstallments, startYear: b.startYear, startMonth: b.startMonth, userId: req.user.id });
    else if (mode === 'CUSTOM_INSTALLMENT') await arrears.setCustomInstallments(row, { installments: b.installments, userId: req.user.id });
    else return res.status(400).json({ status: 'error', message: 'mode must be SINGLE_SHOT, INSTALLMENT or CUSTOM_INSTALLMENT.' });
    await audit(req, 'arrears_case.payment_plan', { organizationId: row.organizationId, targetType: 'arrears_case', targetId: row.id, details: { mode } });
    await row.reload();
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

cases.delete('/:id/payment-plan', async (req, res) => {
  if (!PROCESSORS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot clear a payment plan.' });
  try {
    const row = await loadCaseOr404(req, res); if (!row) return;
    await arrears.clearPaymentPlan(row);
    await audit(req, 'arrears_case.payment_plan.clear', { organizationId: row.organizationId, targetType: 'arrears_case', targetId: row.id });
    await row.reload();
    res.json({ data: row });
  } catch (err) { sendErr(res, err); }
});

// ---- Standalone installment payment + receipt (arrears are paid separately from salary) ----

cases.post('/:id/installments/:installmentId/pay', async (req, res) => {
  if (!PROCESSORS.includes(req.user.role)) return res.status(403).json({ status: 'error', message: 'Your role cannot pay an arrears installment.' });
  try {
    const row = await loadCaseOr404(req, res); if (!row) return;
    const installment = await arrears.payInstallment(row, req.params.installmentId, req.user.id);
    await audit(req, 'arrears_case.installment.pay', {
      organizationId: row.organizationId,
      targetType: 'arrears_installment',
      targetId: installment.id,
      details: { arrearsCaseId: row.id, year: installment.year, month: installment.month, amount: installment.amount },
    });
    res.json({ data: installment });
  } catch (err) { sendErr(res, err); }
});

cases.get('/:id/installments/:installmentId/receipt.pdf', async (req, res) => {
  try {
    const row = await loadCaseOr404(req, res); if (!row) return;
    const { installment, daRevision, monthLabel, receiptNumber } = await arrears.receiptData(row, req.params.installmentId);
    const [employee, org] = await Promise.all([
      Employee.findByPk(row.employeeId, { attributes: ['empCode', 'name', 'designation'], include: [{ model: PostCadre, attributes: ['name'] }] }),
      Organization.findByPk(row.organizationId, { attributes: ['id', 'name', 'shortName'] }),
    ]);
    const postName = employee && (employee.PostCadre ? employee.PostCadre.name : employee.designation);
    const pdf = await buildArrearsReceiptPdf({
      organization: org,
      employee: { empCode: (employee && employee.empCode) || row.empCode, name: (employee && employee.name) || row.employeeName, postName: postName || '-' },
      installment, arrearsCase: row, daRevision, monthLabel, receiptNumber,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="arrears-receipt-${receiptNumber}.pdf"`);
    res.send(pdf);
  } catch (err) { sendErr(res, err); }
});

module.exports = { revisions, cases };
