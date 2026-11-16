'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('UserRoleAssignment', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'user_id' },
  roleId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'role_id' },
  scopeType: { type: DataTypes.ENUM('OWN', 'DEPARTMENT', 'SELECTED_BRANCHES', 'ORGANISATION'), allowNull: false, field: 'scope_type' },
  effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false, field: 'effective_from' },
  effectiveTo: { type: DataTypes.DATEONLY, allowNull: true, field: 'effective_to' },
  assignedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'assigned_by' },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
}, {
  tableName: 'user_role_assignment',
  indexes: [
    { name: 'idx_user_role_dates', fields: ['organization_id', 'user_id', 'effective_from', 'effective_to'] },
    { name: 'idx_user_role_role', fields: ['organization_id', 'role_id'] },
  ],
});
