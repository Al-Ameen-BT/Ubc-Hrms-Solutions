'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('PushSubscription', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'user_id' },
  endpoint: { type: DataTypes.TEXT, allowNull: false },
  endpointHash: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: 'endpoint_hash' },
  p256dh: { type: DataTypes.STRING(255), allowNull: false },
  auth: { type: DataTypes.STRING(255), allowNull: false },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
  failureCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'failure_count' },
  lastDeliveredAt: { type: DataTypes.DATE, allowNull: true, field: 'last_delivered_at' },
}, { tableName: 'push_subscription', indexes: [{ name: 'idx_push_subscription_user', fields: ['user_id', 'status'] }] });
