'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('OrganizationDepartment', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'branch_id' },
  code: { type: DataTypes.STRING(32), allowNull: false },
  name: { type: DataTypes.STRING(255), allowNull: false },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
  displayOrder: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'display_order' },
}, {
  tableName: 'organization_department',
  indexes: [
    { name: 'uq_org_dept_branch_code', unique: true, fields: ['organization_id', 'branch_id', 'code'] },
    { name: 'uq_org_dept_branch_name', unique: true, fields: ['organization_id', 'branch_id', 'name'] },
  ],
});
