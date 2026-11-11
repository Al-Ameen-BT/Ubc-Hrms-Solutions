'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('EmployeeMobileDevice', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'user_id' },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  name: { type: DataTypes.STRING(80), allowNull: false },
  platform: { type: DataTypes.ENUM('android', 'ios'), allowNull: false },
  refreshHash: { type: DataTypes.STRING(64), allowNull: false, field: 'refresh_hash' },
  rotation: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  lastUsedAt: { type: DataTypes.DATE, allowNull: false, field: 'last_used_at' },
  revokedAt: { type: DataTypes.DATE, field: 'revoked_at' },
}, { tableName: 'employee_mobile_device', indexes: [{ fields: ['user_id', 'revoked_at'] }, { fields: ['organization_id'] }] });
