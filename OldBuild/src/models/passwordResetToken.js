'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Emailed "forgot password" links. Only the SHA-256 of the token is stored,
 * so a database read can't be turned into a working reset link. Single use,
 * 30-minute expiry; issuing a new one voids any older unused ones.
 */
const PasswordResetToken = sequelize.define('PasswordResetToken', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'user_id' },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: 'token_hash' },
  expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
  usedAt: { type: DataTypes.DATE, allowNull: true, field: 'used_at' },
  requestedIp: { type: DataTypes.STRING(64), allowNull: true, field: 'requested_ip' },
}, {
  tableName: 'password_reset_token',
  updatedAt: false,
});

module.exports = PasswordResetToken;
