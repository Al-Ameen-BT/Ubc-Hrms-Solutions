'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
module.exports = sequelize.define('ExpenseReceipt', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  claimId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true, field: 'claim_id' },
  mimeType: { type: DataTypes.STRING(64), allowNull: false, field: 'mime_type' },
  data: { type: DataTypes.BLOB('long'), allowNull: false },
  sizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'size_bytes' },
  sha256: { type: DataTypes.STRING(64), allowNull: false },
}, { tableName: 'expense_receipt' });
