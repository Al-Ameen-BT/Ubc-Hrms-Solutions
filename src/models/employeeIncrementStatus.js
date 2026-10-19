'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const EmployeeIncrementStatus = sequelize.define('EmployeeIncrementStatus', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  currentIncrementDate: { type: DataTypes.DATEONLY, field: 'current_increment_date' },
  previousIncrementDate: { type: DataTypes.DATEONLY, field: 'previous_increment_date' },
  nextIncrementDate: { type: DataTypes.DATEONLY, field: 'next_increment_date' },
  eligibilityStatus: {
    type: DataTypes.ENUM('ELIGIBLE', 'NOT_ELIGIBLE', 'DEFERRED', 'WITHHELD'),
    allowNull: false,
    defaultValue: 'ELIGIBLE',
    field: 'eligibility_status',
  },
  incrementPolicyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'increment_policy_id' },
  effectiveDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'effective_date' },
  ruleReferenceId: { type: DataTypes.INTEGER.UNSIGNED, field: 'rule_reference_id' },
  calculationTrace: { type: DataTypes.JSON, field: 'calculation_trace' },
  calculatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'calculated_at' },
}, {
  tableName: 'employee_increment_status',
  updatedAt: false,
  createdAt: false,
});

module.exports = EmployeeIncrementStatus;
