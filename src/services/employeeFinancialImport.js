'use strict';

const { Op } = require('sequelize');
const { sequelize, Employee, EmployeePayrollAdjustment, AuditLog } = require('../models');
const { can } = require('./accessControl');

class EmployeeFinancialImportError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const APPLICABLE = new Set(['EMPLOYEE_ALLOWANCE', 'EMPLOYEE_DEDUCTION']);

function period(payYear, payMonth) {
  const year = Number(payYear), month = Number(payMonth);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new EmployeeFinancialImportError('payYear must be between 2000 and 2100.');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new EmployeeFinancialImportError('payMonth must be between 1 and 12.');
  return { payYear: year, payMonth: month };
}

function summarize(rows) {
  return { total: rows.length, valid: rows.filter(row => !row.errors.length).length, invalid: rows.filter(row => row.errors.length).length };
}

async function validatePreview(parsed, { organizationId, payYear, payMonth, employeeWhere = {} }) {
  const pay = period(payYear, payMonth);
  const codes = [...new Set(parsed.rows.map(row => row.values.employeeCode).filter(Boolean))];
  const employees = codes.length ? await Employee.findAll({
    where: { [Op.and]: [{ organizationId, empCode: { [Op.in]: codes } }, employeeWhere] },
    attributes: ['id', 'empCode', 'name'],
  }) : [];
  const byCode = new Map(employees.map(employee => [String(employee.empCode).toUpperCase(), employee]));
  const seen = new Set();
  const rows = parsed.rows.map(input => {
    const errors = [...(input.errors || [])], values = { ...input.values, ...pay };
    const employee = byCode.get(String(values.employeeCode || '').toUpperCase());
    if (!employee) errors.push('Employee Code was not found in your permitted organisation scope.');
    if (!APPLICABLE.has(input.kind) && !errors.length) errors.push(`${input.kind} requires additional authoritative fields and cannot be applied from this workbook.`);
    if (seen.has(input.naturalKey)) errors.push('Duplicate source row reference in this workbook.');
    seen.add(input.naturalKey);
    if (employee) { values.employeeId = employee.id; values.employeeName = employee.name; }
    return { ...input, values, errors };
  });
  return { ...parsed, payPeriod: pay, rows, summary: summarize(rows) };
}

async function applyPreview(preview, actor, access) {
  const results = [];
  for (const item of preview.rows) {
    if (item.errors?.length) { results.push({ naturalKey: item.naturalKey, status: 'INVALID', errors: item.errors }); continue; }
    try {
      const result = await sequelize.transaction(async transaction => {
        const employee = await Employee.findOne({ where: { id: item.values.employeeId, organizationId: actor.organizationId }, transaction, lock: transaction.LOCK.UPDATE });
        if (!employee || String(employee.empCode).toUpperCase() !== String(item.values.employeeCode).toUpperCase()) throw new EmployeeFinancialImportError('Employee mapping changed; preview the workbook again.', 409);
        if (access && !can(access, 'compensation.prepare', employee)) throw new EmployeeFinancialImportError('Employee is outside your permitted organisation scope.', 403);
        const sourceReference = `${item.values.sourceReference}:${item.values.payYear}-${String(item.values.payMonth).padStart(2, '0')}`;
        const existing = await EmployeePayrollAdjustment.findOne({ where: { organizationId: actor.organizationId, sourceReference }, transaction, lock: transaction.LOCK.UPDATE });
        if (existing) {
          const expectedKind = item.kind === 'EMPLOYEE_ALLOWANCE' ? 'ALLOWANCE' : 'DEDUCTION';
          const expectedCode = item.values.allowanceCode || item.values.adjustmentCode;
          if (existing.employeeId === employee.id && existing.kind === expectedKind && existing.code === expectedCode && Number(existing.amount) === Number(item.values.amount)) return { id: existing.id, status: 'UNCHANGED' };
          throw new EmployeeFinancialImportError('This employee financial item already exists with different values; correct it through the controlled change workflow.', 409);
        }
        const created = await EmployeePayrollAdjustment.create({
          organizationId: actor.organizationId,
          employeeId: employee.id,
          kind: item.kind === 'EMPLOYEE_ALLOWANCE' ? 'ALLOWANCE' : 'DEDUCTION',
          code: item.values.allowanceCode || item.values.adjustmentCode,
          name: item.values.name || String(item.values.allowanceCode || item.values.adjustmentCode).replaceAll('_', ' ').toLowerCase(),
          amount: item.values.amount,
          payYear: item.values.payYear,
          payMonth: item.values.payMonth,
          sourceReference,
          sourceSha256: preview.source.sha256,
        }, { transaction });
        await AuditLog.create({
          organizationId: actor.organizationId,
          actorUserId: actor.id,
          actorEmail: actor.email,
          action: 'employee-financial-import.apply',
          targetType: 'employee_payroll_adjustment',
          targetId: String(created.id),
          details: { employeeId: employee.id, code: created.code, payYear: created.payYear, payMonth: created.payMonth, sourceSha256: preview.source.sha256 },
        }, { transaction });
        return { id: created.id, status: 'CREATED' };
      });
      results.push({ naturalKey: item.naturalKey, ...result });
    } catch (error) {
      results.push({ naturalKey: item.naturalKey, status: 'FAILED', errors: [error.message] });
    }
  }
  return {
    results,
    summary: {
      total: results.length,
      created: results.filter(row => row.status === 'CREATED').length,
      unchanged: results.filter(row => row.status === 'UNCHANGED').length,
      invalid: results.filter(row => row.status === 'INVALID').length,
      failed: results.filter(row => row.status === 'FAILED').length,
    },
  };
}

module.exports = { EmployeeFinancialImportError, validatePreview, applyPreview };
