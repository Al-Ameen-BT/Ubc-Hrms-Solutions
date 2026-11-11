'use strict';
const { Op } = require('sequelize');
const { BankRuleCatalogue, EmployeeCompensationAssignment, OrganizationCatalogueAdoption, FinancialChangeProposal } = require('../models');
const { assignmentForDate } = require('./compensationAssignments');
const { adoptionForDate } = require('./catalogueAdoption');

class CompensationError extends Error { constructor(message, status = 409) { super(message); this.status = status; } }
async function resolveCompensation(employee, date, { transaction } = {}) {
  const assignment = await assignmentForDate(employee.id, date, transaction);
  if (!assignment) {
    const first = await EmployeeCompensationAssignment.findOne({ where: { employeeId: employee.id, status: 'APPROVED', effectiveDate: { [Op.gt]: date } }, order: [['effectiveDate', 'ASC']], transaction });
    return { source: employee.directPay ? 'DIRECT_PAY_LEGACY' : 'LEGACY', basicPay: first?.previousAmount ?? (Number(employee.currentBasicPay) || 0), postCode: null, stageNo: null, catalogueId: null, orderNumber: null, payableDays: employee.CurrentPayScale?.payableDays || 30, monthDays: employee.CurrentPayScale?.monthDays || null };
  }
  if (employee.directPay) return { source: 'DIRECT_PAY', basicPay: Number(assignment.amount), postCode: null, stageNo: null, catalogueId: null, orderNumber: null, payableDays: 30, monthDays: null };
  const catalogue = await BankRuleCatalogue.findByPk(assignment.catalogueId, { transaction });
  const post = catalogue?.posts?.find(row => row.code === assignment.postCode);
  const amount = post?.stages?.[assignment.stageNo - 1];
  if (!catalogue || !post || amount !== Number(assignment.amount)) throw new CompensationError('Approved government salary assignment no longer resolves to its published stage.');
  return { source: 'CATALOGUE', basicPay: amount, postCode: post.code, postName: post.name, stageNo: assignment.stageNo, catalogueId: catalogue.id, bankClass: catalogue.bankClass, orderNumber: catalogue.orderNumber, scaleExpression: post.scaleExpression || null, payableDays: post.payableDays, monthDays: post.monthDays };
}
async function effectiveSettingsForDate(employee, date, bankSettings, compensation) {
  const resolved = compensation || await resolveCompensation(employee, date);
  const dated = await require('./financialChanges').settingsForDate(employee.organizationId, date, bankSettings);
  if (resolved.source !== 'CATALOGUE') return dated;
  const adoption = await adoptionForDate(employee.organizationId, date);
  const catalogue = adoption ? await BankRuleCatalogue.findByPk(adoption.catalogueId) : null;
  return catalogue ? { ...dated, ...catalogue.payrollDefaults } : dated;
}
function previousDate(date) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
async function segmentsForMonth(employee, year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const changes = await EmployeeCompensationAssignment.findAll({ where: { employeeId: employee.id, status: 'APPROVED', effectiveDate: { [Op.gt]: start, [Op.lte]: end } }, order: [['effectiveDate', 'ASC']] });
  const adoptions = await OrganizationCatalogueAdoption.findAll({ where: { organizationId: employee.organizationId, status: 'APPROVED', effectiveDate: { [Op.gt]: start, [Op.lte]: end } }, order: [['effectiveDate', 'ASC']] });
  const financial = await FinancialChangeProposal.findAll({ where: { organizationId: employee.organizationId, status: 'APPROVED', effectiveDate: { [Op.gt]: start, [Op.lte]: end }, [Op.or]: [{ targetType: 'ORG_SETTINGS' }, { targetType: 'EMPLOYEE', targetId: employee.id }] } });
  const boundaries = [...new Set([start, ...changes.map(row => row.effectiveDate), ...adoptions.map(row => row.effectiveDate), ...financial.map(row => row.effectiveDate)])].sort();
  const segments = [];
  for (let i = 0; i < boundaries.length; i++) {
    const fromDate = boundaries[i];
    const toDate = i + 1 < boundaries.length ? previousDate(boundaries[i + 1]) : end;
    const compensation = await resolveCompensation(employee, fromDate);
    const adoption = compensation.source === 'CATALOGUE' ? await adoptionForDate(employee.organizationId, fromDate) : null;
    const rule = adoption ? await BankRuleCatalogue.findByPk(adoption.catalogueId) : null;
    const bankSettings = await require('./financialChanges').settingsForDate(employee.organizationId, fromDate);
    const employeeFields = await require('./financialChanges').employeeForDate(employee, fromDate);
    segments.push({ fromDate, toDate, ...compensation, settings: { ...bankSettings, ...(rule?.payrollDefaults || {}) }, employeeFields });
  }
  return segments;
}
module.exports = { CompensationError, resolveCompensation, effectiveSettingsForDate, segmentsForMonth };
