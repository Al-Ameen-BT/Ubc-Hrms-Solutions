'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('UserRoleDepartment', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  userRoleAssignmentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'user_role_assignment_id' },
  departmentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'department_id' },
}, {
  tableName: 'user_role_department',
  indexes: [
    { name: 'uq_user_role_department', unique: true, fields: ['organization_id', 'user_role_assignment_id', 'department_id'] },
  ],
});
