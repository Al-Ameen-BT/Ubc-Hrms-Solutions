'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('OrganizationResponsibilityAssignment', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'user_id' },
  responsibility: { type: DataTypes.ENUM('BRANCH_MANAGER', 'SENIOR_MANAGER', 'GENERAL_MANAGER', 'DATA_PROTECTION_OFFICER'), allowNull: false },
  scopeType: { type: DataTypes.ENUM('BRANCH', 'ORGANISATION'), allowNull: false, field: 'scope_type' },
  branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'branch_id' },
  effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false, field: 'effective_from' },
  effectiveTo: { type: DataTypes.DATEONLY, allowNull: true, field: 'effective_to' },
  assignedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'assigned_by' },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
}, {
  tableName: 'organization_responsibility_assignment',
  indexes: [
    { name: 'idx_org_resp_employee_dates', fields: ['organization_id', 'employee_id', 'effective_from', 'effective_to'] },
    { name: 'idx_org_resp_branch', fields: ['organization_id', 'branch_id', 'responsibility'] },
  ],
});
