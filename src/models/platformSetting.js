'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Platform-wide settings, maintained by Super Admins. A single row (id = 1),
 * created on first read by services/settings.js — never more than one.
 */
const PlatformSetting = sequelize.define('PlatformSetting', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, defaultValue: 1 },
  platformName: { type: DataTypes.STRING(128), allowNull: false, defaultValue: 'UCB HRMS & Payroll', field: 'platform_name' },
  companyName: { type: DataTypes.STRING(255), allowNull: false, defaultValue: 'Banihal Technologies LLP', field: 'company_name' },
  supportEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'support_email' },
  supportPhone: { type: DataTypes.STRING(64), allowNull: true, field: 'support_phone' },
  // Public base URL used in emailed links (password reset). Falls back to
  // APP_BASE_URL env var, then to the host the request came in on.
  appBaseUrl: { type: DataTypes.STRING(255), allowNull: true, field: 'app_base_url' },
  loginMessage: { type: DataTypes.STRING(500), allowNull: true, field: 'login_message' },
  // How long audit_log rows are kept before the nightly purge removes them
  // (services/auditRetention.js). Kept here rather than hard-coded so a
  // Super Admin can tune it per compliance need without a redeploy.
  auditRetentionDays: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 180, field: 'audit_retention_days' },
}, {
  tableName: 'platform_settings',
});

module.exports = PlatformSetting;
