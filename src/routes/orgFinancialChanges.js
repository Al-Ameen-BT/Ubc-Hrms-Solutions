'use strict';
const express = require('express');
const { FinancialChangeProposal } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const changes = require('../services/financialChanges');
const router = express.Router();
router.use(authenticate, requireRole('ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'));
router.get('/', async (req, res) => {
  try { res.json({ data: await FinancialChangeProposal.findAll({ where: { organizationId: req.user.organizationId }, order: [['effectiveDate', 'DESC'], ['id', 'DESC']] }) }); }
  catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});
router.post('/', requireRole('ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'PAYROLL_OFFICER'), async (req, res) => {
  try {
    const row = await changes.proposeFinancialChange({ ...req.body, organizationId: req.user.organizationId, actorId: req.user.id });
    await audit(req, 'financial.change.propose', { targetType: 'financial_change_proposal', targetId: row.id });
    res.status(201).json({ data: row });
  } catch (err) { res.status(err.status || 500).json({ status: 'error', message: err.message }); }
});
router.post('/:id/decide', requireRole('APPROVING_AUTHORITY'), async (req, res) => {
  try {
    const row = await changes.decideFinancialChange({ organizationId: req.user.organizationId, proposalId: req.params.id, decision: req.body?.decision, actorId: req.user.id });
    await audit(req, 'financial.change.decide', { targetType: 'financial_change_proposal', targetId: row.id, details: { decision: row.status } });
    res.json({ data: row });
  } catch (err) { res.status(err.status || 500).json({ status: 'error', message: err.message }); }
});
module.exports = router;
