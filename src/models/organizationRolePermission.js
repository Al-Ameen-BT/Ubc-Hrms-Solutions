'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('OrganizationRolePermission', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  roleId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'role_id' },
  permissionCode: { type: DataTypes.STRING(128), allowNull: false, field: 'permission_code' },
}, {
  tableName: 'organization_role_permission',
  indexes: [
    { name: 'uq_org_role_permission', unique: true, fields: ['organization_id', 'role_id', 'permission_code'] },
  ],
});
