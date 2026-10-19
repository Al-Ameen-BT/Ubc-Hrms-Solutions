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

const { DaRevision, PayRevision } = require('../models');

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

async function create(organizationId, body) {
  const payload = fields(body, null);
  await validateForSave(payload, organizationId);
  return DaRevision.create({ organizationId, status: 'DRAFT', ...payload });
}

async function update(row, body) {
  if (row.status !== 'DRAFT') throw new DaRevisionError(`Only a Draft revision can be edited (this one is ${row.status}).`, 409);
  const payload = fields(body, row);
  await validateForSave(payload, row.organizationId);
  await row.update(payload);
  return row;
}

function advanceStatus(row, toStatus) {
  if (!STATUSES.includes(toStatus)) throw new DaRevisionError(`Status must be one of ${STATUSES.join(', ')}.`);
  if (toStatus === row.status) return row;
  // Only the forward step from the current status is allowed in one call —
  // keeps the lifecycle a straight line, same reasoning as PayrollRun's
  // PROCESSED -> APPROVED -> PAID chain.
  if (NEXT_STATUS[row.status] !== toStatus) {
    throw new DaRevisionError(`A ${row.status} revision can only move to ${NEXT_STATUS[row.status] || 'no further status'}.`, 409);
  }
  row.status = toStatus;
  return row.save();
}

module.exports = { DaRevisionError, STATUSES, SERVICE_CATEGORIES, fields, validateForSave, create, update, advanceStatus };
