'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
module.exports = sequelize.define('OrganizationHoliday', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  name: { type: DataTypes.STRING(255), allowNull: false },
  remarks: { type: DataTypes.STRING(500) },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
}, { tableName: 'organization_holiday', indexes: [{ unique: true, fields: ['organization_id', 'date'] }] });
