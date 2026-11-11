'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
module.exports = sequelize.define('EmployeeCompensationAssignment', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  catalogueId: { type: DataTypes.INTEGER.UNSIGNED, field: 'catalogue_id' },
  postCode: { type: DataTypes.STRING(32), field: 'post_code' },
  stageNo: { type: DataTypes.INTEGER.UNSIGNED, field: 'stage_no' },
  amount: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  previousAmount: { type: DataTypes.BIGINT.UNSIGNED, field: 'previous_amount' },
  effectiveDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'effective_date' },
  reason: { type: DataTypes.STRING(500), allowNull: false },
  status: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'), allowNull: false, defaultValue: 'PENDING' },
  preparedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'prepared_by' },
  decidedBy: { type: DataTypes.INTEGER.UNSIGNED, field: 'decided_by' },
  decidedAt: { type: DataTypes.DATE, field: 'decided_at' },
  decisionReason: { type: DataTypes.STRING(500), field: 'decision_reason' },
}, { tableName: 'employee_compensation_assignment', indexes: [{ name: 'idx_compensation_employee_status_date', fields: ['employee_id', 'status', 'effective_date'] }, { name: 'idx_compensation_org_status', fields: ['organization_id', 'status'] }] });
