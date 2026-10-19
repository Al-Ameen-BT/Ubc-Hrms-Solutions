'use strict';

/**
 * Admin-defined Allowance master (models/allowanceType.js,
 * allowanceTypePost.js). Lets a bank add a new allowance from the UI —
 * name, frequency, applicable post(s) — without a code change, on top of
 * the fixed set services/payslip.js already computes (DA/HRA/Risk/Other/
 * CCA/Conveyance/Medical/Bonus).
 */

const { AllowanceType, AllowanceTypePost, PostCadre } = require('../models');

class AllowanceError extends Error {
  constructor(message, status) { super(message); this.status = status || 400; }
}

function validateBody(b) {
  if (!b.name || !String(b.name).trim()) throw new AllowanceError('name is required.');
  const frequency = b.frequency;
  if (!['MONTHLY', 'YEARLY', 'ONE_TIME'].includes(frequency)) {
    throw new AllowanceError('frequency must be MONTHLY, YEARLY or ONE_TIME.');
  }
  let month = b.month != null && b.month !== '' ? Number(b.month) : null;
  let year = b.year != null && b.year !== '' ? Number(b.year) : null;
  if (frequency === 'MONTHLY') { month = null; year = null; }
  if (frequency === 'YEARLY') {
    if (!(month >= 1 && month <= 12)) throw new AllowanceError('A YEARLY allowance needs a month (1-12) it is paid in.');
    year = null;
  }
  if (frequency === 'ONE_TIME') {
    if (!(month >= 1 && month <= 12)) throw new AllowanceError('A ONE_TIME allowance needs a month (1-12) it is paid in.');
    if (!(year >= 2000 && year <= 2100)) throw new AllowanceError('A ONE_TIME allowance needs the year it is paid in.');
  }
  const amount = Number(b.amount);
  if (!(amount > 0)) throw new AllowanceError('amount must be a positive number.');
  return { name: String(b.name).trim(), frequency, month, year, amount };
}

async function create(organizationId, body) {
  const clean = validateBody(body);
  return AllowanceType.create({ ...clean, organizationId, remarks: body.remarks ? String(body.remarks).slice(0, 500) : null });
}

async function update(row, body) {
  const clean = validateBody({ ...row.toJSON(), ...body });
  await row.update({ ...clean, remarks: body.remarks !== undefined ? (body.remarks ? String(body.remarks).slice(0, 500) : null) : row.remarks });
  return row;
}

/** Replaces the set of Post Cadres this allowance applies to. Empty array = applies to every post. */
async function setPosts(row, postCadreIds) {
  const ids = Array.isArray(postCadreIds) ? [...new Set(postCadreIds.map(Number))] : [];
  if (ids.length) {
    const found = await PostCadre.findAll({ where: { id: ids, organizationId: row.organizationId } });
    if (found.length !== ids.length) throw new AllowanceError('One or more postCadreIds do not belong to this organisation.');
  }
  await AllowanceTypePost.destroy({ where: { allowanceTypeId: row.id } });
  if (ids.length) await AllowanceTypePost.bulkCreate(ids.map((postCadreId) => ({ allowanceTypeId: row.id, postCadreId })));
  return AllowanceTypePost.findAll({ where: { allowanceTypeId: row.id } });
}

/**
 * The list of {id, name, amount} custom allowances an employee is eligible
 * for in a given year/month — for services/payslip.js to add into earnings.
 * `postCadreId` may be null (employee with no post on record) — such an
 * employee is only eligible for allowances with NO post restriction.
 */
async function applicableAllowancesFor(organizationId, postCadreId, year, month) {
  const types = await AllowanceType.findAll({
    where: { organizationId, status: 'ACTIVE' },
    include: [{ model: AllowanceTypePost, required: false }],
    order: [['name', 'ASC']],
  });
  const out = [];
  for (const t of types) {
    const posts = t.AllowanceTypePosts || [];
    if (posts.length && !(postCadreId && posts.some((p) => Number(p.postCadreId) === Number(postCadreId)))) continue;
    let applies = false;
    if (t.frequency === 'MONTHLY') applies = true;
    else if (t.frequency === 'YEARLY') applies = Number(t.month) === Number(month);
    else if (t.frequency === 'ONE_TIME') applies = Number(t.month) === Number(month) && Number(t.year) === Number(year);
    if (applies) out.push({ id: t.id, name: t.name, amount: Number(t.amount) || 0 });
  }
  return out;
}

module.exports = { AllowanceError, create, update, setPosts, applicableAllowancesFor };
