'use strict';
const { sequelize, BankRuleCatalogue, OrgPayrollSetting } = require('../models');
const { CLASSES, PART_TIME_CONTINGENT } = require('../seed/payScalesUCB');
const { expandScaleExpression } = require('./payScaleExpr');
const { FIELDS } = require('./payrollSettings');

class CatalogueError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function text(value, label, max, required = false) {
  if (value == null || value === '') {
    if (required) throw new CatalogueError(`${label} is required.`);
    return '';
  }
  if (typeof value !== 'string' || value.trim().length > max) throw new CatalogueError(`${label} must be text of at most ${max} characters.`);
  const out = value.trim();
  if (required && !out) throw new CatalogueError(`${label} is required.`);
  return out;
}
function date(value, label, required = false) {
  if (!value && !required) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value || value < '1900-01-01' || value > '2199-12-31') {
    throw new CatalogueError(`${label} must be a valid date between 1900 and 2199.`);
  }
  return value;
}
function integer(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new CatalogueError(`${label} must be a whole number from ${min} to ${max}.`);
  return value;
}
function expandStages(expression) {
  const expr = text(expression, 'Scale expression', 255, true);
  const number = '\\d+';
  if (!new RegExp(`^${number}(?:-${number}/[1-9]\\d*-${number})*$`).test(expr)) {
    throw new CatalogueError('Invalid scale expression. Use whole-rupee amounts: START-INCREMENT/COUNT-CHECKPOINT, or a single integer amount.');
  }
  const counts = [...expr.matchAll(/\/(\d+)/g)].map(m => Number(m[1]));
  if (counts.some(n => n > 200) || counts.reduce((sum, n) => sum + n, 0) > 500) throw new CatalogueError('Scale expression exceeds the 500-stage increment limit (200 per band).');
  // Expand integer paise through the incumbent parser to keep decimal checkpoints exact.
  const paiseExpr = expr.split('-').map(token => {
    const [amount, count] = token.split('/');
    return `${Math.round(Number(amount) * 100)}${count ? `/${count}` : ''}`;
  }).join('-');
  let amounts;
  try { amounts = expandScaleExpression(paiseExpr).amounts.map(n => n / 100); }
  catch (err) { throw new CatalogueError(`Invalid scale expression: ${err.message}`); }
  if (amounts.some((n, i) => !Number.isFinite(n) || n <= 0 || n > 9999999999.99 || (i && n <= amounts[i - 1]))) throw new CatalogueError('Scale stages must be positive, increasing amounts within the supported salary range.');
  return amounts;
}
function payrollFields() {
  return FIELDS.map(key => {
    const attr = OrgPayrollSetting.rawAttributes[key];
    const type = attr.type.key;
    const field = { key, type, nullable: attr.allowNull === true };
    field.category = key.startsWith('festivalAdvance') ? 'Recoverable advances'
      : key.startsWith('medicalAllowance') || key.startsWith('bonus') ? 'Annual earnings'
      : key.startsWith('stagnation') ? 'Pay progression'
      : key.startsWith('od') ? 'Overdraft'
      : key.startsWith('pf') ? 'Provident fund'
      : key.startsWith('gsli') || key.startsWith('pt') ? 'Insurance & tax'
      : key.startsWith('vehicleLoan') ? 'Vehicle loans'
      : ['retirementAge', 'yearType'].includes(key) ? 'Service & reporting' : 'Monthly earnings';
    if (type === 'ENUM') field.options = attr.values || attr.type.values;
    if (type === 'DECIMAL' || type === 'INTEGER') {
      field.min = type === 'INTEGER' ? 1 : 0;
      field.max = type === 'DECIMAL' ? (10 ** (attr.type.options.precision - attr.type.options.scale)) - 10 ** -attr.type.options.scale : 1200;
      if (/Percent$/.test(key)) field.max = Math.min(field.max, 100);
      if (/Month[12]?$/.test(key)) field.max = 12;
      if (key === 'retirementAge') { field.min = 45; field.max = 75; }
      if (type === 'INTEGER' && field.max > 1200) field.max = 1200;
      if (key === 'stagnationExtraStages') field.min = 0;
      if (type === 'DECIMAL') {
        field.decimals = /Percent$/.test(key) || key === 'odMultiplier' ? attr.type.options.scale : 0;
        if (!field.decimals) field.max = Math.floor(field.max);
      }
    }
    return field;
  });
}
function validatePayroll(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CatalogueError('Payroll defaults must be an object.');
  const metadata = Object.fromEntries(payrollFields().map(f => [f.key, f]));
  const out = {};
  for (const [key, input] of Object.entries(value)) {
    if (!Object.hasOwn(metadata, key)) throw new CatalogueError(`Unsupported payroll setting: ${key}.`);
    const f = metadata[key];
    if (input === null && f.nullable) { out[key] = null; continue; }
    if (f.type === 'BOOLEAN') {
      if (typeof input !== 'boolean') throw new CatalogueError(`${key} must be true or false.`);
    } else if (f.type === 'ENUM') {
      if (!f.options.includes(input)) throw new CatalogueError(`${key} must be one of: ${f.options.join(', ')}.`);
    } else if (f.type === 'DATEONLY') { date(input, key, true); }
    else {
      if (typeof input !== 'number' || !Number.isFinite(input) || input < f.min || input > f.max || (f.type === 'INTEGER' && !Number.isInteger(input)) || (f.decimals != null && Math.abs(input * 10 ** f.decimals - Math.round(input * 10 ** f.decimals)) > 0.00001)) throw new CatalogueError(`${key} must be ${f.type === 'INTEGER' ? 'a whole number' : 'a number'} from ${f.min} to ${f.max}${f.decimals != null ? ` with at most ${f.decimals} decimal places` : ''}.`);
    }
    out[key] = input;
  }
  return out;
}
function validateCatalogue(body, publishing = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CatalogueError('Catalogue details are required.');
  const bankClass = body.bankClass;
  if (!Object.hasOwn(CLASSES, bankClass)) throw new CatalogueError('Choose a supported bank class.');
  let sourceUrl = text(body.sourceUrl, 'Source URL', 1000, publishing);
  if (sourceUrl) {
    let url;
    try { url = new URL(sourceUrl); } catch { throw new CatalogueError('Source URL must be an HTTPS document link.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new CatalogueError('Source URL must be an HTTPS document link without credentials.');
    sourceUrl = url.href;
    if (sourceUrl.length > 1000) throw new CatalogueError('Source URL is too long.');
  }
  const posts = body.posts === undefined ? [] : body.posts;
  const rules = body.rules === undefined ? [] : body.rules;
  if (!Array.isArray(posts) || posts.length > 100 || (publishing && !posts.length)) throw new CatalogueError('Provide 1–100 posts before publishing.');
  if (!Array.isArray(rules) || rules.length > 100) throw new CatalogueError('Rules must be a list of at most 100 entries.');
  const seen = new Set();
  const normalizedPosts = posts.map(p => {
    if (!p || typeof p !== 'object') throw new CatalogueError('Each post must contain a code, name and scale.');
    const code = text(p.code, 'Post code', 32, true).toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*$/.test(code) || seen.has(code)) throw new CatalogueError('Post codes must be unique and use letters, numbers and underscores.');
    seen.add(code);
    const scaleExpression = text(p.scaleExpression, 'Scale expression', 255);
    let stages;
    if (scaleExpression) stages = expandStages(scaleExpression);
    else {
      stages = p.stages;
      if (!Array.isArray(stages) || !stages.length || stages.length > 501 || stages.some((n, i) => !Number.isSafeInteger(n) || n <= 0 || n > 9999999999 || (i > 0 && n <= stages[i - 1]))) {
        throw new CatalogueError('Explicit stages must be 1–501 increasing positive whole-rupee amounts.');
      }
    }
    return { code, name: text(p.name, 'Post name', 128, true), scaleExpression,
      payableDays: integer(p.payableDays ?? 30, 'Payable days', 1, 31),
      monthDays: p.monthDays == null ? null : integer(p.monthDays, 'Month days', 1, 31), stages };
  });
  return {
    bankClass, name: text(body.name, 'Revision name', 128, true),
    orderNumber: text(body.orderNumber, 'Government order number', 128, publishing),
    issuingAuthority: text(body.issuingAuthority, 'Issuing authority', 255, publishing),
    orderDate: date(body.orderDate, 'Order date', publishing),
    effectiveDate: date(body.effectiveDate, 'Effective date', publishing), sourceUrl,
    notes: text(body.notes, 'Notes', 10000), posts: normalizedPosts,
    rules: rules.map(r => {
      if (!r || typeof r !== 'object') throw new CatalogueError('Each rule must contain a title and reference.');
      return { title: text(r.title, 'Rule title', 128, true), reference: text(r.reference, 'Rule reference', 255, publishing), description: text(r.description, 'Rule details', 4000, true) };
    }),
    payrollDefaults: validatePayroll(body.payrollDefaults),
    supersedesId: body.supersedesId == null ? null : integer(body.supersedesId, 'Predecessor revision', 1, 2147483647),
  };
}
function referenceForClass(bankClass) {
  if (!Object.hasOwn(CLASSES, bankClass)) throw new CatalogueError('Unknown bank class.');
  return { bankClass, label: CLASSES[bankClass].label,
    note: 'Reference library only. Verify every figure and the actual effective date against an official government order before publication. Part-time contingent scale is common to all classes.',
    posts: [...CLASSES[bankClass].posts, PART_TIME_CONTINGENT].map(p => ({ code: p.code, name: p.name, scaleExpression: p.rev, payableDays: 30, monthDays: null, stages: expandStages(p.rev) })) };
}
async function createDraft(actorId, body) {
  return BankRuleCatalogue.create({ ...validateCatalogue(body), createdByUserId: actorId });
}
async function load(id, transaction) {
  const row = await BankRuleCatalogue.findByPk(id, { transaction });
  if (!row) throw new CatalogueError('Catalogue revision not found.', 404);
  return row;
}
function assertDraft(row, version) {
  if (row.status !== 'DRAFT') throw new CatalogueError('Only a draft can be changed. Create a successor revision instead.', 409);
  if (!Number.isInteger(version) || row.version !== version) throw new CatalogueError('This revision changed. Reload it before continuing.', 409);
}
async function updateDraft(id, body) {
  const row = await load(id);
  assertDraft(row, body.version);
  const payload = validateCatalogue(body);
  const [count] = await BankRuleCatalogue.update({ ...payload, version: row.version + 1 }, { where: { id: row.id, status: 'DRAFT', version: row.version } });
  if (!count) throw new CatalogueError('This revision changed. Reload it before continuing.', 409);
  return load(id);
}
async function deleteDraft(id, version) {
  const row = await load(id);
  assertDraft(row, version);
  const count = await BankRuleCatalogue.destroy({ where: { id: row.id, status: 'DRAFT', version } });
  if (!count) throw new CatalogueError('This revision changed. Reload it before continuing.', 409);
}
async function publish(id, actorId, body) {
  return sequelize.transaction(async transaction => {
    const row = await load(id, transaction);
    assertDraft(row, body.version);
    if (body.verified !== true) throw new CatalogueError('Confirm that the source and all figures have been verified.');
    const verificationNote = text(body.verificationNote, 'Verification note', 4000, true);
    const payload = validateCatalogue(row.toJSON(), true);
    if (payload.supersedesId) {
      const previous = await load(payload.supersedesId, transaction);
      if (previous.bankClass !== row.bankClass) throw new CatalogueError('A successor must use the same bank class.');
      if (previous.status !== 'PUBLISHED' || payload.effectiveDate <= previous.effectiveDate) throw new CatalogueError('Supersede the current published revision with a later effective date.');
      const [changed] = await BankRuleCatalogue.update({ status: 'SUPERSEDED', currentClassKey: null, version: previous.version + 1 }, { where: { id: previous.id, status: 'PUBLISHED', version: previous.version }, transaction });
      if (!changed) throw new CatalogueError('The predecessor changed. Reload before publishing.', 409);
    } else if (await BankRuleCatalogue.count({ where: { bankClass: row.bankClass, status: 'PUBLISHED' }, transaction })) {
      throw new CatalogueError('This class already has a published revision. Create a successor that explicitly supersedes it.', 409);
    }
    try {
      const [changed] = await BankRuleCatalogue.update({ ...payload, status: 'PUBLISHED', version: row.version + 1,
        currentClassKey: row.bankClass, publicationKey: `${row.bankClass}:${payload.effectiveDate}`,
        publishedByUserId: actorId, publishedAt: new Date(), verificationNote,
      }, { where: { id: row.id, status: 'DRAFT', version: row.version }, transaction });
      if (!changed) throw new CatalogueError('This revision changed. Reload before publishing.', 409);
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') throw new CatalogueError('A competing publication exists for this class or effective date. Reload the catalogue.', 409);
      throw err;
    }
    return load(id, transaction);
  });
}
module.exports = { CatalogueError, validateCatalogue, validatePayroll, expandStages, payrollFields, referenceForClass, createDraft, updateDraft, deleteDraft, publish };
