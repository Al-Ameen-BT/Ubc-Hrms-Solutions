'use strict';
const express = require('express');
const { ExpenseClaim, ExpenseReceipt, Employee } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const documents = require('../services/documents');
const { isDateOnly } = require('../services/dateUtils');
const router = express.Router();
router.use(authenticate, requireRole('ORG_ADMIN', 'HR_ADMIN', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'));
const canPrepare = (role) => ['ACCOUNTS_OFFICER', 'PAYROLL_OFFICER'].includes(role);
const canDecide = (role) => ['APPROVING_AUTHORITY', 'ORG_ADMIN'].includes(role);
const canPay = (role) => role === 'ACCOUNTS_OFFICER';
const error = (res, err) => res.status(err.status || 500).json({ status: 'error', message: err.message });
async function ownClaim(req, res) {
  const row = await ExpenseClaim.findOne({ where: { id: req.params.id, organizationId: req.user.organizationId } });
  if (!row) res.status(404).json({ status: 'error', message: 'Claim not found.' });
  return row;
}
router.get('/', async (req, res) => {
  try {
    const rows = await ExpenseClaim.findAll({ where: { organizationId: req.user.organizationId }, include: [{ model: Employee, attributes: ['id', 'empCode', 'name'] }], order: [['createdAt', 'DESC'], ['id', 'DESC']] });
    res.json({ data: rows });
  } catch (err) { error(res, err); }
});
router.get('/:id/receipt', async (req, res) => {
  try {
    const row = await ownClaim(req, res); if (!row) return;
    const receipt = await ExpenseReceipt.findOne({ where: { claimId: row.id } });
    if (!receipt) return res.status(404).json({ status: 'error', message: 'Receipt not found.' });
    documents.send(res, receipt);
  } catch (err) { error(res, err); }
});
router.post('/:id/prepare', async (req, res) => {
  if (!canPrepare(req.user.role)) return res.status(403).json({ status: 'error', message: 'Accounts or payroll officer required.' });
  try {
    const row = await ownClaim(req, res); if (!row) return;
    if (row.status !== 'SUBMITTED') return res.status(409).json({ status: 'error', message: 'Only submitted claims can be prepared.' });
    if (row.submittedBy === req.user.id) return res.status(403).json({ status: 'error', message: 'You cannot prepare your own claim.' });
    const [changed] = await ExpenseClaim.update({ status: 'PREPARED', preparedBy: req.user.id, preparedAt: new Date() }, { where: { id: row.id, organizationId: req.user.organizationId, status: 'SUBMITTED' } });
    if (!changed) return res.status(409).json({ status: 'error', message: 'This claim has already changed status.' });
    await row.reload();
    await audit(req, 'expense_claim.prepare', { targetType: 'expense_claim', targetId: row.id });
    res.json({ data: row });
  } catch (err) { error(res, err); }
});
router.post('/:id/decide', async (req, res) => {
  if (!canDecide(req.user.role)) return res.status(403).json({ status: 'error', message: 'Approving authority required.' });
  try {
    const row = await ownClaim(req, res); if (!row) return;
    if (row.status !== 'PREPARED') return res.status(409).json({ status: 'error', message: 'Only prepared claims can be decided.' });
    if (row.submittedBy === req.user.id || row.preparedBy === req.user.id) return res.status(403).json({ status: 'error', message: 'A separate authority must decide this claim.' });
    const decision = req.body?.decision;
    const reason = String(req.body?.reason || '').trim();
    if (!['APPROVED', 'REJECTED'].includes(decision) || (decision === 'REJECTED' && !reason)) return res.status(400).json({ status: 'error', message: 'APPROVED or REJECTED decision and a rejection reason are required.' });
    const [changed] = await ExpenseClaim.update({ status: decision, decidedBy: req.user.id, decidedAt: new Date(), decisionReason: reason || null }, { where: { id: row.id, organizationId: req.user.organizationId, status: 'PREPARED' } });
    if (!changed) return res.status(409).json({ status: 'error', message: 'This claim has already changed status.' });
    await row.reload();
    await audit(req, 'expense_claim.decide', { targetType: 'expense_claim', targetId: row.id, details: { decision, reason } });
    res.json({ data: row });
  } catch (err) { error(res, err); }
});
router.post('/:id/pay', async (req, res) => {
  if (!canPay(req.user.role)) return res.status(403).json({ status: 'error', message: 'Accounts officer required.' });
  try {
    const row = await ownClaim(req, res); if (!row) return;
    if (row.status !== 'APPROVED') return res.status(409).json({ status: 'error', message: 'Only approved claims can be marked paid.' });
    if (row.submittedBy === req.user.id || row.decidedBy === req.user.id) return res.status(403).json({ status: 'error', message: 'A separate accounts officer must record payment.' });
    const paymentReference = String(req.body?.paymentReference || '').trim();
    const paidAt = req.body?.paidAt;
    if (!paymentReference || paymentReference.length > 128 || !isDateOnly(paidAt)) return res.status(400).json({ status: 'error', message: 'Payment reference and valid date are required.' });
    const [changed] = await ExpenseClaim.update({ status: 'PAID', paidBy: req.user.id, paidAt, paymentReference }, { where: { id: row.id, organizationId: req.user.organizationId, status: 'APPROVED' } });
    if (!changed) return res.status(409).json({ status: 'error', message: 'This claim has already changed status.' });
    await row.reload();
    await audit(req, 'expense_claim.pay', { targetType: 'expense_claim', targetId: row.id, details: { paymentReference, paidAt } });
    res.json({ data: row });
  } catch (err) { error(res, err); }
});
module.exports = router;
