'use strict';

/**
 * Pay revisions, pay scales and their stages.
 *
 *   /pay-revisions          org-scoped CRUD (crudFactory)
 *   /pay-scales             org-scoped CRUD (crudFactory)
 *   /pay-scales/:id/stages  GET the stage ladder, PUT to save it
 *
 * Stages are saved as a whole ladder but never deleted: an existing stage
 * may be referenced by employees' current position and by pay-history
 * rows, so saving only inserts new stage numbers and updates amounts of
 * existing ones. Changing the amount of a stage that's already in use is
 * refused — that would silently rewrite pay history; a new pay revision is
 * the correct way to change pay.
 */

const express = require('express');
const crudRouter = require('./crudFactory');
const { authenticate, requireRole } = require('../middleware/auth');
const { PayRevision, PayScale, PayStage, RuleReference, Employee, EmployeePayHistory } = require('../models');
const { audit } = require('../services/audit');
const { Op } = require('sequelize');

const WRITE = ['ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER'];

const revisions = crudRouter(PayRevision, {
  fields: ['organizationId', 'name', 'effectiveDate', 'ruleReferenceId', 'description', 'status'],
  softDeleteValue: 'SUPERSEDED',
  writeRoles: WRITE,
  refs: { ruleReferenceId: RuleReference },
});

const scalesCrud = crudRouter(PayScale, {
  fields: ['organizationId', 'payRevisionId', 'code', 'name', 'scaleExpression', 'payableDays', 'monthDays', 'effectiveFrom', 'effectiveTo', 'status'],
  softDeleteValue: 'SUPERSEDED',
  writeRoles: WRITE,
  refs: { payRevisionId: PayRevision },
});

const stagesRouter = express.Router({ mergeParams: true });
stagesRouter.use(authenticate);

async function loadScale(req, res) {
  const scale = await PayScale.findByPk(req.params.id);
  if (!scale || (req.user.role !== 'SUPER_ADMIN' && String(scale.organizationId) !== String(req.user.organizationId))) {
    res.status(404).json({ status: 'error', message: 'Pay scale not found' });
    return null;
  }
  return scale;
}

async function stagesInUse(stageIds) {
  if (!stageIds.length) return new Set();
  const [emp, hist] = await Promise.all([
    Employee.findAll({ where: { currentStageId: { [Op.in]: stageIds } }, attributes: ['currentStageId'] }),
    EmployeePayHistory.findAll({
      where: { [Op.or]: [{ newStageId: { [Op.in]: stageIds } }, { previousStageId: { [Op.in]: stageIds } }] },
      attributes: ['newStageId', 'previousStageId'],
    }),
  ]);
  const used = new Set();
  emp.forEach((e) => used.add(e.currentStageId));
  hist.forEach((h) => { used.add(h.newStageId); used.add(h.previousStageId); });
  return used;
}

stagesRouter.get('/', requireRole('SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'DEPARTMENT_HEAD'), async (req, res) => {
  try {
    const scale = await loadScale(req, res);
    if (!scale) return;
    const stages = await PayStage.findAll({ where: { payScaleId: scale.id }, order: [['stageNo', 'ASC']] });
    const used = await stagesInUse(stages.map((s) => s.id));
    res.json({ data: stages.map((s) => ({ id: s.id, stageNo: s.stageNo, amount: Number(s.amount), inUse: used.has(s.id) })) });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// PUT { stages: [{ stageNo, amount }, ...] }
stagesRouter.put('/', requireRole('SUPER_ADMIN', ...WRITE), async (req, res) => {
  try {
    const scale = await loadScale(req, res);
    if (!scale) return;
    const input = Array.isArray((req.body || {}).stages) ? req.body.stages : null;
    if (!input) return res.status(400).json({ status: 'error', message: 'stages must be an array of { stageNo, amount }' });
    const seen = new Set();
    const clean = [];
    for (const s of input) {
      const stageNo = Number(s.stageNo);
      const amount = Number(s.amount);
      if (!Number.isInteger(stageNo) || stageNo < 1) return res.status(400).json({ status: 'error', message: `Invalid stage number: ${s.stageNo}` });
      if (!(amount > 0)) return res.status(400).json({ status: 'error', message: `Stage ${stageNo}: amount must be greater than zero` });
      if (seen.has(stageNo)) return res.status(400).json({ status: 'error', message: `Stage ${stageNo} appears twice` });
      seen.add(stageNo);
      clean.push({ stageNo, amount: Math.round(amount * 100) / 100 });
    }
    clean.sort((a, b) => a.stageNo - b.stageNo);
    for (let i = 1; i < clean.length; i++) {
      if (clean[i].amount <= clean[i - 1].amount) {
        return res.status(400).json({ status: 'error', message: `Stage ${clean[i].stageNo} (₹${clean[i].amount}) must be higher than stage ${clean[i - 1].stageNo} (₹${clean[i - 1].amount}).` });
      }
    }
    const existing = await PayStage.findAll({ where: { payScaleId: scale.id } });
    const byNo = new Map(existing.map((s) => [s.stageNo, s]));
    const used = await stagesInUse(existing.map((s) => s.id));
    const missing = existing.filter((s) => !seen.has(s.stageNo));
    if (missing.length) {
      return res.status(400).json({ status: 'error', message: `Stages cannot be removed once created (missing: ${missing.map((s) => s.stageNo).join(', ')}). Supersede the scale with a new pay revision instead.` });
    }
    for (const s of clean) {
      const row = byNo.get(s.stageNo);
      if (row && Number(row.amount) !== s.amount && used.has(row.id)) {
        return res.status(400).json({ status: 'error', message: `Stage ${s.stageNo} is already used in employees' pay records, so its amount cannot be changed.` });
      }
    }
    await PayStage.sequelize.transaction(async (t) => {
      for (const s of clean) {
        const row = byNo.get(s.stageNo);
        if (row) {
          if (Number(row.amount) !== s.amount) await row.update({ amount: s.amount }, { transaction: t });
        } else {
          await PayStage.create({ payScaleId: scale.id, stageNo: s.stageNo, amount: s.amount }, { transaction: t });
        }
      }
    });
    await audit(req, 'payscale.stages.update', { organizationId: scale.organizationId, targetType: 'pay_scale', targetId: scale.id, details: { count: clean.length } });
    const stages = await PayStage.findAll({ where: { payScaleId: scale.id }, order: [['stageNo', 'ASC']] });
    const nowUsed = await stagesInUse(stages.map((s) => s.id));
    res.json({ data: stages.map((s) => ({ id: s.id, stageNo: s.stageNo, amount: Number(s.amount), inUse: nowUsed.has(s.id) })) });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

const scales = express.Router();
scales.use('/:id/stages', stagesRouter);
scales.use('/', scalesCrud);

/** Used by the employee refs check: a stage belongs to the org via its scale. */
async function stageBelongsToOrg(stageId, orgId) {
  const stage = await PayStage.findByPk(stageId);
  if (!stage) return false;
  const scale = await PayScale.findByPk(stage.payScaleId);
  return !!scale && String(scale.organizationId) === String(orgId);
}

module.exports = { revisions, scales, stageBelongsToOrg };
