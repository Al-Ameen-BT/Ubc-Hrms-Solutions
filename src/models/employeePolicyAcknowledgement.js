'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
module.exports = sequelize.define('EmployeePolicyAcknowledgement', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  policyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'policy_id' },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'user_id' },
  acknowledgedAt: { type: DataTypes.DATE, allowNull: false, field: 'acknowledged_at' },
}, { tableName: 'employee_policy_acknowledgement', indexes: [{ unique: true, fields: ['policy_id', 'user_id'] }] });
