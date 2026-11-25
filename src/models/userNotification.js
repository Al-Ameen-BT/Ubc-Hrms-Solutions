'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('UserNotification', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'user_id' },
  broadcastId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'broadcast_id' },
  readAt: { type: DataTypes.DATE, allowNull: true, field: 'read_at' },
}, { tableName: 'user_notification', indexes: [
  { name: 'uq_user_notification_broadcast', unique: true, fields: ['user_id', 'broadcast_id'] },
  { name: 'idx_user_notification_inbox', fields: ['user_id', 'read_at', 'created_at'] },
] });
