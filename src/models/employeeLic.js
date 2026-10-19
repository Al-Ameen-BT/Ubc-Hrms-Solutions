'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * One row per LIC (Life Insurance Corporation) policy an employee has taken
 * a salary deduction for. An employee may hold MULTIPLE policies at once —
 * each is its own row and each contributes its own deductionAmount to the
 * payslip every month it is active. A policy is "active" for a given month
 * when that month falls on/after startedDate and (closureDate is unset OR
 * that month is before closureDate) — see services/loans.js. maturityDate is
 * informational (does not by itself stop the deduction; closureDate is what
 * an admin sets when the policy is actually closed/surrendered early).
 */
const EmployeeLic = sequelize.define('EmployeeLic', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  policyNumber: { type: DataTypes.STRING(100), field: 'policy_number' },
  openingDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'opening_date' },
  startedDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'started_date' },
  deductionAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, field: 'deduction_amount' },
  sumAssuredAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'sum_assured_amount' },
  maturityDate: { type: DataTypes.DATEONLY, field: 'maturity_date' },
  closureDate: { type: DataTypes.DATEONLY, field: 'closure_date' },
  remarks: { type: DataTypes.STRING(500) },
}, {
  tableName: 'employee_lic',
});

module.exports = EmployeeLic;
