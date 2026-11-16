'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
module.exports = sequelize.define('EmployeeTransfer', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'branch_id' },
  departmentId: { type: DataTypes.INTEGER.UNSIGNED, field: 'department_id' },
  positionId: { type: DataTypes.INTEGER.UNSIGNED, field: 'position_id' },
  compensationProposalId: { type: DataTypes.INTEGER.UNSIGNED, field: 'compensation_proposal_id' },
  roleChanges: { type: DataTypes.JSON, allowNull: false, field: 'role_changes' },
  effectiveDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'effective_date' },
  reason: { type: DataTypes.STRING(500), allowNull: false },
  status: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'ACTIVATED'), allowNull: false, defaultValue: 'PENDING' },
  preparedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'prepared_by' },
  decidedBy: { type: DataTypes.INTEGER.UNSIGNED, field: 'decided_by' },
  decidedAt: { type: DataTypes.DATE, field: 'decided_at' },
  decisionReason: { type: DataTypes.STRING(500), field: 'decision_reason' },
  activatedAt: { type: DataTypes.DATE, field: 'activated_at' },
}, { tableName: 'employee_transfer', indexes: [
  { name: 'idx_transfer_due', fields: ['status', 'effective_date'] },
  { name: 'idx_transfer_employee', fields: ['organization_id', 'employee_id'] },
  { name: 'idx_transfer_comp', fields: ['compensation_proposal_id'] },
], hooks: {
  beforeUpdate(row) {
    const permitted = ['status', 'activatedAt', 'updatedAt'];
    if (row.previous('status') === 'PENDING') permitted.push('decidedBy', 'decidedAt', 'decisionReason');
    if ((row.changed() || []).some(key => !permitted.includes(key)) || ['ACTIVATED', 'REJECTED'].includes(row.previous('status'))) throw new Error('Transfer history and decision metadata are immutable');
  },
} });
