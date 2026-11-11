'use strict';
const { Op } = require('sequelize');
const { sequelize, Employee, PostCadre, BankRuleCatalogue, EmployeeCompensationAssignment, EmployeeServiceHistory } = require('../models');
const { adoptionForDate } = require('./catalogueAdoption');
const { isDateOnly } = require('./dateUtils');

class AssignmentError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
async function assignmentForDate(employeeId, date, transaction) {
  return EmployeeCompensationAssignment.findOne({ where: { employeeId, status: 'APPROVED', effectiveDate: { [Op.lte]: date } }, order: [['effectiveDate', 'DESC'], ['id', 'DESC']], transaction });
}
async function validateAssignment(input, transaction) {
  const { organizationId, employeeId, catalogueId, postCode, stageNo, amount, effectiveDate, reason } = input;
  const employee = await Employee.findOne({ where: { id: employeeId, organizationId }, transaction });
  if (!employee) throw new AssignmentError('Employee not found in this bank.', 404);
  if (!isDateOnly(effectiveDate)) throw new AssignmentError('Valid effective date required.');
  if (!String(reason || '').trim() || String(reason).length > 500) throw new AssignmentError('A reason of at most 500 characters is required.');
  const adopted = await adoptionForDate(organizationId, effectiveDate, transaction);
  if (!adopted) throw new AssignmentError('Bank must approve a catalogue adoption before salary assignment.', 409);
  if (employee.directPay) {
    if (catalogueId || postCode || stageNo) throw new AssignmentError('Direct-pay staff cannot have a government post or stage.');
    const salary = Number(amount);
    if (!Number.isSafeInteger(salary) || salary <= 0 || salary > 9999999999) throw new AssignmentError('Direct-pay salary must be a positive whole-rupee amount.');
    return { employee, catalogueId: null, postCode: null, stageNo: null, amount: salary };
  }
  if (Number(adopted.catalogueId) !== Number(catalogueId)) throw new AssignmentError('Choose the bank-adopted catalogue revision for this date.', 409);
  const catalogue = await BankRuleCatalogue.findByPk(catalogueId, { transaction });
  const post = catalogue?.posts?.find(row => row.code === postCode);
  if (!post) throw new AssignmentError('Post is absent from the adopted catalogue.');
  if (!Number.isInteger(stageNo) || stageNo < 1 || stageNo > post.stages.length) throw new AssignmentError('Stage is absent from this post.');
  return { employee, catalogueId: catalogue.id, postCode, stageNo, amount: post.stages[stageNo - 1] };
}
async function proposeAssignment(input) {
  const clean = await validateAssignment(input);
  if (await EmployeeCompensationAssignment.count({ where: { employeeId: clean.employee.id, effectiveDate: input.effectiveDate, status: 'APPROVED' } })) throw new AssignmentError('An approved salary assignment already exists for this date.', 409);
  const prior = await assignmentForDate(clean.employee.id, input.effectiveDate);
  const next = prior ? null : await EmployeeCompensationAssignment.findOne({ where: { employeeId: clean.employee.id, status: 'APPROVED', effectiveDate: { [Op.gt]: input.effectiveDate } }, order: [['effectiveDate', 'ASC']] });
  const previousAmount = prior ? Number(prior.amount) : next ? Number(next.previousAmount) : Number(clean.employee.currentBasicPay) || 0;
  return EmployeeCompensationAssignment.create({ organizationId: input.organizationId, employeeId: clean.employee.id, catalogueId: clean.catalogueId, postCode: clean.postCode, stageNo: clean.stageNo, amount: clean.amount, previousAmount, effectiveDate: input.effectiveDate, reason: String(input.reason).trim(), preparedBy: input.actorId });
}
async function decideAssignment({ organizationId, proposalId, decision, actorId, reason }) {
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new AssignmentError('Decision must be APPROVED or REJECTED.');
  return sequelize.transaction(async transaction => {
    const row = await EmployeeCompensationAssignment.findOne({ where: { id: proposalId, organizationId }, transaction });
    if (!row) throw new AssignmentError('Salary proposal not found.', 404);
    const employee = await Employee.findByPk(row.employeeId, { transaction, lock: transaction.LOCK.UPDATE });
    if (row.status !== 'PENDING') throw new AssignmentError('This salary proposal has already changed.', 409);
    if (Number(row.preparedBy) === Number(actorId)) throw new AssignmentError('A different approving authority must decide this proposal.', 403);
    if (decision === 'APPROVED') {
      const clean = await validateAssignment({ ...row.toJSON(), reason: row.reason }, transaction);
      if (clean.amount !== Number(row.amount)) throw new AssignmentError('The government stage changed after proposal; create a new proposal.', 409);
      if (await EmployeeCompensationAssignment.count({ where: { employeeId: row.employeeId, effectiveDate: row.effectiveDate, status: 'APPROVED' }, transaction })) throw new AssignmentError('An approved salary assignment already exists for this date.', 409);
    }
    const [changed] = await EmployeeCompensationAssignment.update({ status: decision, decidedBy: actorId, decidedAt: new Date(), decisionReason: reason ? String(reason).slice(0, 500) : null }, { where: { id: row.id, organizationId, status: 'PENDING' }, transaction });
    if (!changed) throw new AssignmentError('This salary proposal has already changed.', 409);
    if (decision === 'APPROVED') {
      if (row.catalogueId) {
        const catalogue = await BankRuleCatalogue.findByPk(row.catalogueId, { transaction });
        const post = catalogue.posts.find(item => item.code === row.postCode);
        const [cadre] = await PostCadre.findOrCreate({ where: { organizationId, code: row.postCode }, defaults: { organizationId, code: row.postCode, name: post.name }, transaction });
        if (row.effectiveDate <= new Date().toISOString().slice(0, 10)) await employee.update({ postCadreId: cadre.id }, { transaction });
      }
      await EmployeeServiceHistory.create({ employeeId: employee.id, eventType: employee.directPay ? 'OTHER' : 'PAY_REVISION', eventDate: row.effectiveDate,
        remarks: `${row.reason} Approved salary: ₹${row.amount}${row.catalogueId ? `; catalogue #${row.catalogueId}, ${row.postCode}, stage ${row.stageNo}` : ' (direct-pay)'}.` }, { transaction });
      const today = new Date().toISOString().slice(0, 10);
      const current = await assignmentForDate(employee.id, today, transaction);
      if (current) await employee.update({ currentBasicPay: current.amount }, { transaction });
    }
    return EmployeeCompensationAssignment.findByPk(row.id, { transaction });
  });
}
module.exports = { AssignmentError, proposeAssignment, decideAssignment, assignmentForDate };
