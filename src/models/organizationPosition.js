'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('OrganizationPosition', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'branch_id' },
  departmentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'department_id' },
  code: { type: DataTypes.STRING(32), allowNull: false },
  name: { type: DataTypes.STRING(255), allowNull: false },
  postCadreId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'post_cadre_id' },
  reportsToPositionId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'reports_to_position_id' },
  capacity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1, validate: { isInt: true, min: 1 } },
  leadershipVisible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'leadership_visible' },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
  displayOrder: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'display_order' },
}, {
  tableName: 'organization_position',
  indexes: [
    { name: 'uq_org_position_branch_code', unique: true, fields: ['organization_id', 'branch_id', 'code'] },
    { name: 'idx_org_position_department', fields: ['organization_id', 'department_id'] },
  ],
});
