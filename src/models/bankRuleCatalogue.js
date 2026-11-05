'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

// Platform-owned snapshots; organisation salary tables remain tenant-owned.
const BankRuleCatalogue = sequelize.define('BankRuleCatalogue', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(128), allowNull: false },
  bankClass: { type: DataTypes.ENUM('SPECIAL_GRADE', 'CLASS_I', 'CLASS_II', 'CLASS_III', 'CLASS_IV', 'CLASS_V'), allowNull: false, field: 'bank_class' },
  status: { type: DataTypes.ENUM('DRAFT', 'PUBLISHED', 'SUPERSEDED'), allowNull: false, defaultValue: 'DRAFT' },
  orderNumber: { type: DataTypes.STRING(128), field: 'order_number' },
  issuingAuthority: { type: DataTypes.STRING(255), field: 'issuing_authority' },
  orderDate: { type: DataTypes.DATEONLY, field: 'order_date' },
  effectiveDate: { type: DataTypes.DATEONLY, field: 'effective_date' },
  sourceUrl: { type: DataTypes.STRING(1000), field: 'source_url' },
  notes: { type: DataTypes.TEXT },
  posts: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  rules: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  payrollDefaults: { type: DataTypes.JSON, allowNull: false, defaultValue: {}, field: 'payroll_defaults' },
  supersedesId: { type: DataTypes.INTEGER.UNSIGNED, field: 'supersedes_id' },
  version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  // Unique on publication only; prevents concurrent independent heads per class.
  currentClassKey: { type: DataTypes.STRING(32), allowNull: true, unique: true, field: 'current_class_key' },
  publicationKey: { type: DataTypes.STRING(64), allowNull: true, unique: true, field: 'publication_key' },
  createdByUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'created_by_user_id' },
  publishedByUserId: { type: DataTypes.INTEGER.UNSIGNED, field: 'published_by_user_id' },
  publishedAt: { type: DataTypes.DATE, field: 'published_at' },
  verificationNote: { type: DataTypes.TEXT, field: 'verification_note' },
}, { tableName: 'bank_rule_catalogue' });
module.exports = BankRuleCatalogue;
