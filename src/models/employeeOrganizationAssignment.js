'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('EmployeeOrganizationAssignment', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'branch_id' },
  departmentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'department_id' },
  positionId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'position_id' },
  effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false, field: 'effective_from' },
  effectiveTo: { type: DataTypes.DATEONLY, allowNull: true, field: 'effective_to' },
  assignedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'assigned_by' },
  transferId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'transfer_id' },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
}, {
  tableName: 'employee_organization_assignment',
  indexes: [
    { name: 'idx_emp_org_dates', fields: ['organization_id', 'employee_id', 'effective_from', 'effective_to'] },
    { name: 'idx_emp_org_position_dates', fields: ['organization_id', 'position_id', 'effective_from', 'effective_to'] },
  ],
});
