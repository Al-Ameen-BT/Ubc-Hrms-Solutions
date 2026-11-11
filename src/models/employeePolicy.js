'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
module.exports = sequelize.define('EmployeePolicy', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  title: { type: DataTypes.STRING(255), allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
  publishedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'published_by' },
}, { tableName: 'employee_policy', indexes: [{ unique: true, fields: ['organization_id', 'version'] }] });
