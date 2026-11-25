'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('NotificationBroadcast', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  senderUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'sender_user_id' },
  title: { type: DataTypes.STRING(120), allowNull: false },
  message: { type: DataTypes.STRING(500), allowNull: false },
  recipientCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'recipient_count' },
  deliveredCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'delivered_count' },
  failedCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'failed_count' },
}, { tableName: 'notification_broadcast', indexes: [{ name: 'idx_notif_broadcast_org_created', fields: ['organization_id', 'created_at'] }] });
