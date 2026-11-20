'use strict';

/**
 * Admin-defined Deduction master (models/deductionType.js, deductionTypePost.js).
 * Allows banks to manage all custom deduction categories, values, and variables
 * (Society deductions, Welfare funds, Insurance, Association fees, Voluntary deductions, etc.)
 * directly from the application UI without code changes.
 */

const { DeductionType, DeductionTypePost, PostCadre } = require('../models');
const { toPaise, toRupees, percentOf, add } = require('../utils/money');

class DeductionError extends Error {
  constructor(message, status) { super(message); this.status = status || 400; }
}

const VALID_CATEGORIES = ['STATUTORY', 'WELFARE', 'SOCIETY', 'INSURANCE', 'LOAN', 'VOLUNTARY', 'OTHER'];

function validateBody(b) {
  if (!b.name || !String(b.name).trim()) throw new DeductionError('name is required.');
  const name = String(b.name).trim();

  const category = b.category || 'OTHER';
  if (!VALID_CATEGORIES.includes(category)) {
    throw new DeductionError(`category must be one of: ${VALID_CATEGORIES.join(', ')}.`);
  }

  const calculationType = b.calculationType || 'FLAT';
  if (!['FLAT', 'PERCENTAGE'].includes(calculationType)) {
    throw new DeductionError('calculationType must be FLAT or PERCENTAGE.');
  }

  let percentageBase = b.percentageBase || null;
  let percentageValue = b.percentageValue != null && b.percentageValue !== '' ? Number(b.percentageValue) : null;
  if (calculationType === 'PERCENTAGE') {
    if (!['BASIC', 'BASIC_PLUS_DA', 'GROSS'].includes(percentageBase)) {
      throw new DeductionError('percentageBase must be BASIC, BASIC_PLUS_DA, or GROSS.');
    }
    if (!(percentageValue > 0 && percentageValue <= 100)) {
      throw new DeductionError('percentageValue must be between 0 and 100.');
    }
  } else {
    percentageBase = null;
    percentageValue = null;
  }

  const frequency = b.frequency || 'MONTHLY';
  if (!['MONTHLY', 'YEARLY', 'ONE_TIME'].includes(frequency)) {
    throw new DeductionError('frequency must be MONTHLY, YEARLY or ONE_TIME.');
  }

  let month = b.month != null && b.month !== '' ? Number(b.month) : null;
  let year = b.year != null && b.year !== '' ? Number(b.year) : null;
  if (frequency === 'MONTHLY') { month = null; year = null; }
  if (frequency === 'YEARLY') {
    if (!(month >= 1 && month <= 12)) throw new DeductionError('A YEARLY deduction needs a month (1-12) it is deducted in.');
    year = null;
  }
  if (frequency === 'ONE_TIME') {
    if (!(month >= 1 && month <= 12)) throw new DeductionError('A ONE_TIME deduction needs a month (1-12) it is deducted in.');
    if (!(year >= 2000 && year <= 2100)) throw new DeductionError('A ONE_TIME deduction needs the year it is deducted in.');
  }

  const amount = Number(b.amount || 0);
  if (calculationType === 'FLAT' && !(amount >= 0)) {
    throw new DeductionError('amount must be a valid number (>= 0).');
  }

  const employerAmount = b.employerAmount != null && b.employerAmount !== '' ? Number(b.employerAmount) : null;
  if (employerAmount !== null && !(employerAmount >= 0)) {
    throw new DeductionError('employerAmount must be >= 0.');
  }

  return {
    name,
    category,
    calculationType,
    percentageBase,
    percentageValue,
    frequency,
    month,
    year,
    amount,
    employerAmount,
  };
}

async function create(organizationId, body) {
  const clean = validateBody(body);
  return DeductionType.create({
    ...clean,
    organizationId,
    remarks: body.remarks ? String(body.remarks).slice(0, 500) : null,
  });
}

async function update(row, body) {
  const clean = validateBody({ ...row.toJSON(), ...body });
  await row.update({
    ...clean,
    remarks: body.remarks !== undefined ? (body.remarks ? String(body.remarks).slice(0, 500) : null) : row.remarks,
  });
  return row;
}

/** Replaces the set of Post Cadres this deduction applies to. Empty array = applies to every post. */
async function setPosts(row, postCadreIds) {
  const ids = Array.isArray(postCadreIds) ? [...new Set(postCadreIds.map(Number))] : [];
  if (ids.length) {
    const found = await PostCadre.findAll({ where: { id: ids, organizationId: row.organizationId } });
    if (found.length !== ids.length) throw new DeductionError('One or more postCadreIds do not belong to this organisation.');
  }
  await DeductionTypePost.destroy({ where: { deductionTypeId: row.id } });
  if (ids.length) await DeductionTypePost.bulkCreate(ids.map((postCadreId) => ({ deductionTypeId: row.id, postCadreId })));
  return DeductionTypePost.findAll({ where: { deductionTypeId: row.id } });
}

/**
 * The list of custom deductions an employee is subject to in a given year/month.
 * salaryContext: { basicPaise, daPaise, grossPaise } for percentage calculations.
 */
async function applicableDeductionsFor(organizationId, postCadreId, year, month, salaryContext = {}) {
  const types = await DeductionType.findAll({
    where: { organizationId, status: 'ACTIVE' },
    include: [{ model: DeductionTypePost, required: false }],
    order: [['category', 'ASC'], ['name', 'ASC']],
  });
  const out = [];
  for (const t of types) {
    const posts = t.DeductionTypePosts || [];
    if (posts.length && !(postCadreId && posts.some((p) => Number(p.postCadreId) === Number(postCadreId)))) continue;
    let applies = false;
    if (t.frequency === 'MONTHLY') applies = true;
    else if (t.frequency === 'YEARLY') applies = Number(t.month) === Number(month);
    else if (t.frequency === 'ONE_TIME') applies = Number(t.month) === Number(month) && Number(t.year) === Number(year);

    if (applies) {
      let deductionAmount = Number(t.amount) || 0;
      if (t.calculationType === 'PERCENTAGE' && t.percentageValue > 0) {
        const basic = salaryContext.basicPaise || 0;
        const da = salaryContext.daPaise || 0;
        const gross = salaryContext.grossPaise || add(basic, da);
        let basePaise = basic;
        if (t.percentageBase === 'BASIC_PLUS_DA') basePaise = add(basic, da);
        else if (t.percentageBase === 'GROSS') basePaise = gross;
        deductionAmount = toRupees(percentOf(basePaise, t.percentageValue));
      }
      out.push({
        id: t.id,
        name: t.name,
        category: t.category,
        amount: deductionAmount,
        employerAmount: t.employerAmount != null ? Number(t.employerAmount) : 0,
      });
    }
  }
  return out;
}

module.exports = {
  DeductionError,
  VALID_CATEGORIES,
  create,
  update,
  setPosts,
  applicableDeductionsFor,
};
