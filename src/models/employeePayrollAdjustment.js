'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

// Employee-specific earning/deduction rows imported from controlled payroll
// workbooks. A source reference is immutable and unique inside the tenant so
// retrying an approved preview cannot duplicate a payroll item.
const EmployeePayrollAdjustment = sequelize.define('EmployeePayrollAdjustment', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  kind: { type: DataTypes.ENUM('ALLOWANCE', 'DEDUCTION'), allowNull: false },
  code: { type: DataTypes.STRING(64), allowNull: false },
  name: { type: DataTypes.STRING(128), allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  payYear: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'pay_year' },
  payMonth: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'pay_month' },
  sourceReference: { type: DataTypes.STRING(180), allowNull: false, field: 'source_reference' },
  sourceSha256: { type: DataTypes.STRING(64), allowNull: false, field: 'source_sha256' },
  status: { type: DataTypes.ENUM('ACTIVE', 'VOID'), allowNull: false, defaultValue: 'ACTIVE' },
}, {
  tableName: 'employee_payroll_adjustment',
  indexes: [
    { name: 'uq_emp_pay_adj_org_source', unique: true, fields: ['organization_id', 'source_reference'] },
    { name: 'idx_emp_pay_adj_period', fields: ['employee_id', 'pay_year', 'pay_month', 'status'] },
  ],
});

module.exports = EmployeePayrollAdjustment;
