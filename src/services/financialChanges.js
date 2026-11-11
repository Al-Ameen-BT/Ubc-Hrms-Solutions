'use strict';
const { Op } = require('sequelize');
const { sequelize, Organization, Employee, OrgPayrollSetting, BankRuleCatalogue, FinancialChangeProposal } = require('../models');
const { getSettings, FIELDS } = require('./payrollSettings');
const { adoptionForDate } = require('./catalogueAdoption');
const { isDateOnly } = require('./dateUtils');

const EMPLOYEE_FIELDS = ['riskAllowance', 'otherAllowance', 'vpfPercent', 'welfareFundOptIn', 'welfareFundAmount', 'gsliOptIn', 'gsliAmount', 'ptAmount', 'taxRegime', 'taxOtherDeductions', 'daType', 'fixedDaAmount', 'hraType', 'fixedHraAmount', 'ccaOptIn', 'ccaAmount', 'conveyanceOptIn', 'conveyanceAmount'];
class FinancialChangeError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
function cleanPatch(targetType, patch) {
  const attrs = targetType === 'ORG_SETTINGS' ? OrgPayrollSetting.rawAttributes : Employee.rawAttributes;
  const clean = {};
  for (const [key, value] of Object.entries(patch)) {
    const field = attrs[key];
    if (value === null || value === '') {
      if (!field?.allowNull) throw new FinancialChangeError(`${key} requires a value.`);
      clean[key] = null;
    } else if (field.type.key === 'BOOLEAN') {
      if (typeof value !== 'boolean') throw new FinancialChangeError(`${key} must be true or false.`);
      clean[key] = value;
    } else if (field.type.key === 'ENUM') {
      if (!field.type.values.includes(value)) throw new FinancialChangeError(`${key} has an invalid value.`);
      clean[key] = value;
    } else if (field.type.key === 'DATEONLY') {
      if (!isDateOnly(value)) throw new FinancialChangeError(`${key} must be a valid date.`);
      clean[key] = value;
    } else if (['DECIMAL', 'INTEGER'].includes(field.type.key)) {
      const number = Number(value);
      const maximum = field.type.key === 'DECIMAL' ? 10 ** (field.type.options.precision - field.type.options.scale) - 10 ** -field.type.options.scale : 9999999999;
      if (!Number.isFinite(number) || number < 0 || number > maximum || (key.endsWith('Percent') && number > 100)) throw new FinancialChangeError(`${key} must be a valid number within the supported range.`);
      if (field.type.key === 'INTEGER' && !Number.isInteger(number)) throw new FinancialChangeError(`${key} must be a whole number.`);
      const normalized = field.type.key === 'DECIMAL' && !key.endsWith('Percent') ? require('../utils/money').roundRupees(number) : number;
      if (normalized > maximum) throw new FinancialChangeError(`${key} exceeds the supported amount range.`);
      clean[key] = normalized;
    } else throw new FinancialChangeError(`${key} is not a supported value.`);
  }
  return clean;
}
async function validate({ organizationId, targetType, targetId, patch, effectiveDate, reason }, transaction) {
  if (!isDateOnly(effectiveDate)) throw new FinancialChangeError('Valid effective date required.');
  if (!String(reason || '').trim() || String(reason).length > 500) throw new FinancialChangeError('A reason of at most 500 characters is required.');
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length) throw new FinancialChangeError('A nonempty change is required.');
  const allowed = targetType === 'ORG_SETTINGS' ? FIELDS : targetType === 'EMPLOYEE' ? EMPLOYEE_FIELDS : null;
  if (!allowed || Object.keys(patch).some(key => !allowed.includes(key))) throw new FinancialChangeError('This financial field is not supported here. Government stages use salary assignments.');
  if (targetType === 'EMPLOYEE') {
    const employee = await Employee.findOne({ where: { id: targetId, organizationId }, transaction });
    if (!employee) throw new FinancialChangeError('Employee not found in this bank.', 404);
    if (!await require('./compensationAssignments').assignmentForDate(employee.id, effectiveDate, transaction)) throw new FinancialChangeError('Approve a salary assignment for this date before proposing employee financial changes.', 409);
  } else if (targetId != null) throw new FinancialChangeError('Organisation settings do not have a target ID.');
  const adoption = await adoptionForDate(organizationId, effectiveDate, transaction);
  if (!adoption) throw new FinancialChangeError('Approve catalogue adoption before proposing financial changes.', 409);
  if (targetType === 'ORG_SETTINGS') {
    const catalogue = await BankRuleCatalogue.findByPk(adoption.catalogueId, { transaction });
    const controlled = Object.keys(catalogue?.payrollDefaults || {});
    if (Object.keys(patch).some(key => controlled.includes(key))) throw new FinancialChangeError('A government-controlled rate can change only through a published revision.', 409);
  }
  const cleaned = cleanPatch(targetType, patch);
  if (targetType === 'ORG_SETTINGS') require('./bankRuleCatalogue').validatePayroll(cleaned);
  return { organizationId, targetType, targetId: targetType === 'EMPLOYEE' ? targetId : null, patch: cleaned, effectiveDate, reason: String(reason).trim() };
}
async function proposeFinancialChange(input) {
  const clean = await validate(input);
  return FinancialChangeProposal.create({ ...clean, preparedBy: input.actorId });
}
async function decideFinancialChange({ organizationId, proposalId, decision, actorId }) {
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new FinancialChangeError('Decision must be APPROVED or REJECTED.');
  return sequelize.transaction(async transaction => {
    await Organization.findByPk(organizationId, { transaction, lock: transaction.LOCK.UPDATE });
    const row = await FinancialChangeProposal.findOne({ where: { id: proposalId, organizationId }, transaction });
    if (!row) throw new FinancialChangeError('Financial proposal not found.', 404);
    if (row.status !== 'PENDING') throw new FinancialChangeError('This proposal has already changed.', 409);
    if (Number(row.preparedBy) === Number(actorId)) throw new FinancialChangeError('A different approving authority must decide this proposal.', 403);
    if (decision === 'APPROVED') await validate(row.toJSON(), transaction);
    const [changed] = await FinancialChangeProposal.update({ status: decision, decidedBy: actorId, decidedAt: new Date() }, { where: { id: row.id, status: 'PENDING' }, transaction });
    if (!changed) throw new FinancialChangeError('This proposal has already changed.', 409);
    return FinancialChangeProposal.findByPk(row.id, { transaction });
  });
}
async function approvedPatches(organizationId, targetType, targetId, date) {
  return FinancialChangeProposal.findAll({ where: { organizationId, targetType, targetId, status: 'APPROVED', effectiveDate: { [Op.lte]: date } }, order: [['effectiveDate', 'ASC'], ['id', 'ASC']] });
}
async function settingsForDate(organizationId, date, base) {
  const row = base || await getSettings(organizationId);
  const result = { ...(row.toJSON?.() || row) };
  for (const change of await approvedPatches(organizationId, 'ORG_SETTINGS', null, date)) Object.assign(result, change.patch);
  return result;
}
async function employeeForDate(employee, date) {
  const result = { ...(employee.toJSON?.() || employee) };
  for (const change of await approvedPatches(employee.organizationId, 'EMPLOYEE', employee.id, date)) Object.assign(result, change.patch);
  return result;
}
module.exports = { FinancialChangeError, EMPLOYEE_FIELDS, proposeFinancialChange, decideFinancialChange, settingsForDate, employeeForDate };
