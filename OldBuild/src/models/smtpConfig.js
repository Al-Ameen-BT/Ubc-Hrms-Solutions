'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Outgoing mail server settings. organizationId NULL = the platform's own
 * SMTP (used for Super Admin mail, and as the fallback for any bank that
 * hasn't configured its own). A bank's row, when enabled, is used for that
 * bank's mail instead. The SMTP password is AES-256-GCM encrypted
 * (services/secretBox) and never returned by the API.
 */
const SmtpConfig = sequelize.define('SmtpConfig', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'organization_id' },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  host: { type: DataTypes.STRING(255), allowNull: true },
  port: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, defaultValue: 587 },
  // 'SSL' = implicit TLS (usually 465), 'STARTTLS' = upgrade (usually 587), 'NONE' = plain (test servers only)
  security: { type: DataTypes.ENUM('SSL', 'STARTTLS', 'NONE'), allowNull: false, defaultValue: 'STARTTLS' },
  username: { type: DataTypes.STRING(255), allowNull: true },
  passwordEnc: { type: DataTypes.TEXT, allowNull: true, field: 'password_enc' },
  fromName: { type: DataTypes.STRING(255), allowNull: true, field: 'from_name' },
  fromEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'from_email' },
  replyTo: { type: DataTypes.STRING(255), allowNull: true, field: 'reply_to' },
  lastTestAt: { type: DataTypes.DATE, allowNull: true, field: 'last_test_at' },
  lastTestOk: { type: DataTypes.BOOLEAN, allowNull: true, field: 'last_test_ok' },
  lastTestMessage: { type: DataTypes.STRING(500), allowNull: true, field: 'last_test_message' },
}, {
  tableName: 'smtp_config',
  indexes: [{ fields: ['organization_id'] }],
});

module.exports = SmtpConfig;
