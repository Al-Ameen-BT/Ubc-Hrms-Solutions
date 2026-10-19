'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * One row per branch office, for the Organisation Profile (Org Admin) —
 * purely informational (name/code/address/phone), not linked to Employee's
 * own free-text branchName/branchCode fields.
 */
const OrganizationBranch = sequelize.define('OrganizationBranch', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  name: { type: DataTypes.STRING(255), allowNull: false },
  code: { type: DataTypes.STRING(32), allowNull: true },
  address: { type: DataTypes.TEXT, allowNull: true },
  phone: { type: DataTypes.STRING(64), allowNull: true },
  isHeadOffice: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_head_office' },
}, {
  tableName: 'organization_branch',
  indexes: [{ fields: ['organization_id'] }],
});

module.exports = OrganizationBranch;
