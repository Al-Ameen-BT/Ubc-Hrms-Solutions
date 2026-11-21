'use strict';

/**
 * DA Revision Master — validation and status-transition rules for
 * models/daRevision.js. Kept separate from the arrears calculation engine
 * (services/arrears.js) the same way GO/RuleReference master data is kept
 * separate from the payroll engine that reads it.
 *
 * Status lifecycle: DRAFT -> APPROVED -> ACTIVE -> CLOSED. Arrears may only
 * be calculated for a revision that is APPROVED or ACTIVE (not a DRAFT
 * still being edited, not a CLOSED one). A revision can only move
 * "backwards" is not supported — corrections while still DRAFT are done by
 * editing the row directly; once APPROVED, the numbers are meant to be
 * final (matching the pay-history "never rewrite" rule used elsewhere).
 */

const { sequelize, Organization, DaRevision, PayRevision, OrgPayrollSetting } = require('../models');

class DaRevisionError extends Error {
  constructor(message, status) { super(message); this.status = status || 400; }
}

const STATUSES = ['DRAFT', 'APPROVED', 'ACTIVE', 'CLOSED'];
const NEXT_STATUS = { DRAFT: 'APPROVED', APPROVED: 'ACTIVE', ACTIVE: 'CLOSED' };
const SERVICE_CATEGORIES = ['ALL', 'REGULAR', 'PART_TIME_CONTINGENT'];

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function round3(n) { return Math.round((Number(n) || 0) * 1000) / 1000; }

/** Whitelists + validates the create/update payload. Does NOT persist. */
function fields(body, existing) {
  const b = body || {};
  const out = {};
  const get = (key) => (Object.prototype.hasOwnProperty.call(b, key) ? b[key] : (existing ? existing[key] : undefined));

  const orderNumber = get('orderNumber');
  if (orderNumber !== undefined) out.orderNumber = orderNumber ? String(orderNumber).trim().slice(0, 128) : null;
  const orderDate = get('orderDate');
  if (orderDate !== undefined) out.orderDate = orderDate || null;
  const effectiveFrom = get('effectiveFrom');
  if (effectiveFrom !== undefined) out.effectiveFrom = effectiveFrom || null;
  const effectiveTo = get('effectiveTo');
  if (effectiveTo !== undefined) out.effectiveTo = effectiveTo || null;

  const previousDaPercent = get('previousDaPercent');
  const increasePercent = get('increasePercent');
  if (previousDaPercent !== undefined) out.previousDaPercent = num(previousDaPercent);
  if (increasePercent !== undefined) out.increasePercent = num(increasePercent);

  const applicableEmployeeCategory = get('applicableEmployeeCategory');
  if (applicableEmployeeCategory !== undefined) out.applicableEmployeeCategory = applicableEmployeeCategory ? String(applicableEmployeeCategory).trim().slice(0, 64) : 'ALL';
  const applicableServiceCategory = get('applicableServiceCategory');
  if (applicableServiceCategory !== undefined) {
    if (!SERVICE_CATEGORIES.includes(applicableServiceCategory)) throw new DaRevisionError(`applicableServiceCategory must be one of ${SERVICE_CATEGORIES.join(', ')}.`);
    out.applicableServiceCategory = applicableServiceCategory;
  }
  const applicablePayRevisionId = get('applicablePayRevisionId');
  if (applicablePayRevisionId !== undefined) out.applicablePayRevisionId = applicablePayRevisionId || null;

  const remarks = get('remarks');
  if (remarks !== undefined) out.remarks = remarks ? String(remarks).slice(0, 4000) : null;

  // Revised DA % is always derived — never trust a client-sent value.
  const finalPrevious = out.previousDaPercent !== undefined ? out.previousDaPercent : (existing ? Number(existing.previousDaPercent) : null);
  const finalIncrease = out.increasePercent !== undefined ? out.increasePercent : (existing ? Number(existing.increasePercent) : null);
  if (finalPrevious !== null && finalIncrease !== null) out.revisedDaPercent = round3(finalPrevious + finalIncrease);

  return out;
}

async function validateForSave(payload, organizationId) {
  if (!payload.orderNumber) throw new DaRevisionError('Order Number is required.');
  if (!payload.orderDate) throw new DaRevisionError('Order Date is required.');
  if (!payload.effectiveFrom) throw new DaRevisionError('Effective From is required.');
  if (payload.previousDaPercent === null || payload.previousDaPercent === undefined) throw new DaRevisionError('Previous DA % is required.');
  if (payload.increasePercent === null || payload.increasePercent === undefined) throw new DaRevisionError('Increase % is required.');
  if (payload.increasePercent === 0) throw new DaRevisionError('Increase % cannot be zero — this module is for a DA change, not a no-op order.');
  if (payload.effectiveTo && String(payload.effectiveTo) < String(payload.effectiveFrom)) throw new DaRevisionError('Effective To cannot be before Effective From.');
  if (payload.applicablePayRevisionId) {
    const pr = await PayRevision.findByPk(payload.applicablePayRevisionId);
    if (!pr || String(pr.organizationId) !== String(organizationId)) throw new DaRevisionError('applicablePayRevisionId: no such Pay Revision in this organisation.');
  }
}

async function create(organizationId, body, userId) {
  const payload = fields(body, null);
  await validateForSave(payload, organizationId);
  return DaRevision.create({ organizationId, status: 'DRAFT', ...payload, preparedBy: userId || null });
}

async function update(row, body, userId) {
  return sequelize.transaction(async transaction => {
    await row.reload({ transaction, lock: transaction.LOCK.UPDATE });
    if (row.status !== 'DRAFT') throw new DaRevisionError(`Only a Draft revision can be edited (this one is ${row.status}).`, 409);
    const payload = fields(body, row);
    await validateForSave(payload, row.organizationId);
    await row.update({ ...payload, ...(userId ? { preparedBy: userId } : {}) }, { transaction });
    return row;
  });
}

async function advanceStatus(row, toStatus, userId) {
  if (!STATUSES.includes(toStatus)) throw new DaRevisionError(`Status must be one of ${STATUSES.join(', ')}.`);
  return sequelize.transaction(async transaction => {
    await row.reload({ transaction, lock: transaction.LOCK.UPDATE });
    if (toStatus === row.status) return row;
    if (NEXT_STATUS[row.status] !== toStatus) throw new DaRevisionError(`A ${row.status} revision can only move to ${NEXT_STATUS[row.status] || 'no further status'}.`, 409);
    if (toStatus === 'APPROVED') {
      const org = await Organization.findByPk(row.organizationId, { transaction });
      if (org.accessControlMode === 'PERMISSIONS' && (!userId || !row.preparedBy || String(userId) === String(row.preparedBy))) throw new DaRevisionError('A separate authority must approve this revision.', 403);
      row.approvedBy = userId || null; row.approvedAt = new Date();
    }
    if (toStatus === 'ACTIVE') {
      const [settings] = await OrgPayrollSetting.findOrCreate({
        where: { organizationId: row.organizationId },
        defaults: { organizationId: row.organizationId },
        transaction,
      });
      if (row.revisedDaPercent != null) {
        settings.daPercent = row.revisedDaPercent;
        await settings.save({ transaction });
      }
    }
    row.status = toStatus;
    return row.save({ transaction });
  });
}

module.exports = { DaRevisionError, STATUSES, SERVICE_CATEGORIES, fields, validateForSave, create, update, advanceStatus };
