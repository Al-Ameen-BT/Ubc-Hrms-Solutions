'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('UserRoleBranch', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  userRoleAssignmentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'user_role_assignment_id' },
  branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'branch_id' },
}, {
  tableName: 'user_role_branch',
  indexes: [
    { name: 'uq_user_role_branch', unique: true, fields: ['organization_id', 'user_role_assignment_id', 'branch_id'] },
  ],
});
