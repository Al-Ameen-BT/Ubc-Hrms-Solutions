'use strict';
const express = require('express');
const { Organization, BankRuleCatalogue, OrganizationCatalogueAdoption } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const adoption = require('../services/catalogueAdoption');
const router = express.Router();
router.use(authenticate, requireRole('ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'));

router.get('/', async (req, res) => {
  try {
    const org = await Organization.findByPk(req.user.organizationId);
    const [available, history] = await Promise.all([
      BankRuleCatalogue.findAll({ where: { bankClass: org.bankClass, status: 'PUBLISHED' }, order: [['effectiveDate', 'DESC']] }),
      OrganizationCatalogueAdoption.findAll({ where: { organizationId: org.id }, include: [{ model: BankRuleCatalogue, attributes: ['name', 'orderNumber', 'bankClass', 'effectiveDate', 'posts', 'payrollDefaults'] }], order: [['effectiveDate', 'DESC'], ['id', 'DESC']] }),
    ]);
    res.json({ data: { available, history, requiresCatalogueAdoption: !!org.requiresCatalogueAdoption } });
  } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});
router.post('/', requireRole('ORG_ADMIN'), async (req, res) => {
  try {
    const row = await adoption.proposeAdoption({ organizationId: req.user.organizationId, catalogueId: req.body?.catalogueId, effectiveDate: req.body?.effectiveDate, actorId: req.user.id });
    await audit(req, 'catalogue.adoption.propose', { targetType: 'organization_catalogue_adoption', targetId: row.id });
    res.status(201).json({ data: row });
  } catch (err) { res.status(err.status || 500).json({ status: 'error', message: err.message }); }
});
router.post('/:id/decide', requireRole('APPROVING_AUTHORITY'), async (req, res) => {
  try {
    const row = await adoption.decideAdoption({ organizationId: req.user.organizationId, proposalId: req.params.id, decision: req.body?.decision, actorId: req.user.id, reason: req.body?.reason });
    await audit(req, 'catalogue.adoption.decide', { targetType: 'organization_catalogue_adoption', targetId: row.id, details: { decision: row.status } });
    res.json({ data: row });
  } catch (err) { res.status(err.status || 500).json({ status: 'error', message: err.message }); }
});
module.exports = router;
