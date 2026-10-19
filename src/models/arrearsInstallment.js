'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * One month's slice of an ArrearsCase's payment plan (Single Shot,
 * Installment, or Custom Installment — all three are just different ways
 * of producing this table's rows; see services/arrears.js). Arrears are
 * paid SEPARATELY from salary, never bundled into a payroll run: a PENDING
 * row is marked PAID by an explicit "Pay this installment" action
 * (services/arrears.js#payInstallment), which also posts an entry to the
 * employee's Service Book (serviceHistoryId below) and makes a downloadable
 * receipt available.
 *
 * paidInPayrollRunId is legacy — an earlier design routed arrears through
 * the payroll engine and this column recorded which run paid an
 * installment. That integration has been removed (arrears are no longer
 * added to any payslip), so the column is kept only so any rows a deployed
 * database already has from that design still read back cleanly; new rows
 * never set it.
 */
const ArrearsInstallment = sequelize.define('ArrearsInstallment', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  arrearsCaseId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'arrears_case_id' },
  year: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  month: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  status: { type: DataTypes.ENUM('PENDING', 'PAID'), allowNull: false, defaultValue: 'PENDING' },
  paidInPayrollRunId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'paid_in_payroll_run_id' }, // legacy — see header comment
  paidAt: { type: DataTypes.DATE, allowNull: true, field: 'paid_at' },
  paidBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'paid_by' }, // -> User.id, who marked it paid
  serviceHistoryId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'service_history_id' }, // -> EmployeeServiceHistory.id, the Service Book entry this payment posted
  createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'created_by' },
}, {
  tableName: 'arrears_installment',
  indexes: [{ unique: true, fields: ['arrears_case_id', 'year', 'month'] }],
});

module.exports = ArrearsInstallment;
