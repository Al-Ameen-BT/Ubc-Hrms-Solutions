'use strict';
const express = require('express');
const { BankRuleCatalogue } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const catalogue = require('../services/bankRuleCatalogue');
const { CLASSES } = require('../seed/payScalesUCB');
const router = express.Router();
router.use(authenticate, requireRole('SUPER_ADMIN'));
const classes = Object.entries(CLASSES).map(([code, value]) => ({ code, label: value.label }));
function fail(res, err) {
  if (!err.status) console.error('[bank-catalogue]', err);
  res.status(err.status || 500).json({ status: 'error', message: err.status ? err.message : 'Could not complete the catalogue request. Please try again.' });
}
function action(handler) {
  return async (req, res) => { try { await handler(req, res); } catch (err) { fail(res, err); } };
}
async function record(req, name, id) {
  await audit(req, `bank-catalogue.${name}`, { organizationId: null, targetType: 'bank-rule-catalogue', targetId: id });
}
router.get('/metadata', (req, res) => res.json({ data: { classes, payrollFields: catalogue.payrollFields() } }));
router.get('/reference/:bankClass', action(async (req, res) => res.json({ data: catalogue.referenceForClass(req.params.bankClass) })));
router.get('/', action(async (req, res) => {
  const where = {};
  if (req.query.bankClass !== undefined) {
    if (!classes.some(c => c.code === req.query.bankClass)) throw new catalogue.CatalogueError('Unknown bank class.');
    where.bankClass = req.query.bankClass;
  }
  if (req.query.status !== undefined) {
    if (!['DRAFT', 'PUBLISHED', 'SUPERSEDED'].includes(req.query.status)) throw new catalogue.CatalogueError('Unknown catalogue status.');
    where.status = req.query.status;
  }
  const rows = await BankRuleCatalogue.findAll({ where, order: [['id', 'DESC']] });
  res.json({ data: rows.map(row => {
    const { posts, rules, payrollDefaults, notes, verificationNote, ...summary } = row.toJSON();
    return { ...summary, postCount: posts.length, ruleCount: rules.length, payrollSettingCount: Object.keys(payrollDefaults).length };
  }) });
}));
router.post('/', action(async (req, res) => {
  const row = await catalogue.createDraft(req.user.id, req.body);
  await record(req, 'create', row.id);
  res.status(201).json({ data: row });
}));
router.post('/preview', action(async (req, res) => res.json({ data: catalogue.validateCatalogue(req.body) })));
router.param('id', (req, res, next, id) => {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return res.status(400).json({ status: 'error', message: 'Invalid catalogue ID.' });
  next();
});
router.get('/:id', action(async (req, res) => {
  const row = await BankRuleCatalogue.findByPk(req.params.id);
  if (!row) throw new catalogue.CatalogueError('Catalogue revision not found.', 404);
  res.json({ data: row });
}));
router.put('/:id', action(async (req, res) => {
  const row = await catalogue.updateDraft(req.params.id, req.body || {});
  await record(req, 'update', row.id);
  res.json({ data: row });
}));
router.post('/:id/publish', action(async (req, res) => {
  const row = await catalogue.publish(req.params.id, req.user.id, req.body || {});
  await record(req, 'publish', row.id);
  res.json({ data: row });
}));
router.delete('/:id', action(async (req, res) => {
  await catalogue.deleteDraft(req.params.id, (req.body || {}).version);
  await record(req, 'delete-draft', req.params.id);
  res.json({ status: 'ok' });
}));
module.exports = router;
