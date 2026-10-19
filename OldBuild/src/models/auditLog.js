'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Append-only record of security-relevant and administrative actions:
 * sign-ins (successful and failed), MFA changes, user/organisation changes,
 * licence changes, settings changes. Rows are never updated or deleted by
 * the application. organizationId is the tenant the action concerns (NULL
 * for platform-level actions), which is what scopes an Org Admin's view.
 */
const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'organization_id' },
  actorUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'actor_user_id' },
  actorEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'actor_email' },
  action: { type: DataTypes.STRING(64), allowNull: false },
  targetType: { type: DataTypes.STRING(64), allowNull: true, field: 'target_type' },
  targetId: { type: DataTypes.STRING(64), allowNull: true, field: 'target_id' },
  details: { type: DataTypes.JSON, allowNull: true },
  ip: { type: DataTypes.STRING(64), allowNull: true },
}, {
  tableName: 'audit_log',
  updatedAt: false,
  indexes: [{ fields: ['organization_id', 'created_at'] }, { fields: ['created_at'] }],
});

module.exports = AuditLog;
