'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * One employee's payslip within a PayrollRun — a frozen snapshot of exactly
 * what services/payslip.js's computePayslip() returned at the moment the
 * run was processed, plus a few master-data fields copied in at that same
 * moment (name, post, bank details) so the line still reads correctly even
 * if the employee is later renamed, transferred, or their bank details
 * change. Nothing here is ever recomputed after the run is processed —
 * that immutability is the whole point of a "run" versus the live preview.
 */
const PayrollRunLine = sequelize.define('PayrollRunLine', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  payrollRunId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'payroll_run_id' },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },

  // Snapshot of identifying master data at processing time.
  empCode: { type: DataTypes.STRING(32), allowNull: false, field: 'emp_code' },
  employeeName: { type: DataTypes.STRING(255), allowNull: false, field: 'employee_name' },
  postName: { type: DataTypes.STRING(255), allowNull: true, field: 'post_name' },
  bankName: { type: DataTypes.STRING(255), allowNull: true, field: 'bank_name' },
  bankAccountNumber: { type: DataTypes.STRING(32), allowNull: true, field: 'bank_account_number' },
  bankIfsc: { type: DataTypes.STRING(16), allowNull: true, field: 'bank_ifsc' },

  // Headline totals, pulled out of payslipJson for easy sorting/summing.
  grossEarnings: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'gross_earnings' },
  totalDeductions: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'total_deductions' },
  netPay: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'net_pay' },
  lopDays: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'lop_days' },

  // Full computePayslip() output — earnings, deductions, loanStatus,
  // incomeTaxDetail, grade, note — stored verbatim as the immutable record.
  payslipJson: { type: DataTypes.TEXT, allowNull: false, field: 'payslip_json' },

  hasBankDetails: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'has_bank_details' },
  exceptionNote: { type: DataTypes.STRING(500), allowNull: true, field: 'exception_note' }, // e.g. "No bank account on record"

  // Payslip email delivery (services/payslipEmail.js) — a line can be
  // emailed more than once (re-sent on request), so this is simply the
  // most recent attempt's outcome, not a history.
  payslipEmailedAt: { type: DataTypes.DATE, allowNull: true, field: 'payslip_emailed_at' },
  payslipEmailError: { type: DataTypes.STRING(500), allowNull: true, field: 'payslip_email_error' },
}, {
  tableName: 'payroll_run_line',
  indexes: [{ unique: true, fields: ['payroll_run_id', 'employee_id'] }],
});

module.exports = PayrollRunLine;
