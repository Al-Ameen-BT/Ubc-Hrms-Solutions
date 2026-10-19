'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * One row per Festival Advance an employee has availed. Up to one month's
 * (Basic+DA), repaid over festivalAdvanceRepayMonths (org setting, default
 * 10) — the employee may choose a SHORTER period (repayMonths can be edited
 * down after creation) but never longer than the org's standard. Repayment
 * progress is computed live from availedDate (see services/loans.js) rather
 * than posted month by month, so there is no separate "instalment" table —
 * consistent with how services/payslip.js computes everything else live.
 * A new advance is refused (services/loans.js) while an unrepaid one exists.
 */
const EmployeeFestivalAdvance = sequelize.define('EmployeeFestivalAdvance', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  availedDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'availed_date' },
  repayMonths: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'repay_months' },
  remarks: { type: DataTypes.STRING(500) },
}, {
  tableName: 'employee_festival_advance',
});

module.exports = EmployeeFestivalAdvance;
