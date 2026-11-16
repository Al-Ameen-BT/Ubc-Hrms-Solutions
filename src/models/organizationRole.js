'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('OrganizationRole', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  code: { type: DataTypes.STRING(32), allowNull: false },
  name: { type: DataTypes.STRING(255), allowNull: false },
  templateCode: { type: DataTypes.STRING(32), allowNull: false, field: 'template_code' },
  isProtected: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_protected' },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
}, {
  tableName: 'organization_role',
  indexes: [
    { name: 'uq_org_role_code', unique: true, fields: ['organization_id', 'code'] },
    { name: 'uq_org_role_name', unique: true, fields: ['organization_id', 'name'] },
  ],
});
