'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('EmployeeDeviceLink', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'user_id' },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  challengeHash: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: 'challenge_hash' },
  claimHash: { type: DataTypes.STRING(64), field: 'claim_hash' },
  status: { type: DataTypes.ENUM('PENDING', 'CLAIMED', 'APPROVED', 'DENIED', 'CANCELLED', 'ISSUED'), allowNull: false, defaultValue: 'PENDING' },
  verificationCode: { type: DataTypes.STRING(6), field: 'verification_code' },
  deviceName: { type: DataTypes.STRING(80), field: 'device_name' },
  platform: { type: DataTypes.ENUM('android', 'ios') },
  expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
  deviceId: { type: DataTypes.INTEGER.UNSIGNED, field: 'device_id' },
}, { tableName: 'employee_device_link', indexes: [{ fields: ['user_id', 'status'] }, { fields: ['expires_at'] }] });
