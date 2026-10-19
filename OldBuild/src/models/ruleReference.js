'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const RuleReference = sequelize.define('RuleReference', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  ruleType: {
    type: DataTypes.ENUM('INCREMENT', 'PROMOTION', 'HIGHER_GRADE', 'PAY_REVISION', 'LEAVE', 'PENSION', 'SETTLEMENT', 'GENERAL'),
    allowNull: false,
    field: 'rule_type',
  },
  title: { type: DataTypes.STRING(255), allowNull: false },

  // KSR Rule Master fields (architecture doc §4)
  part: { type: DataTypes.STRING(32) },
  chapter: { type: DataTypes.STRING(32) },
  ruleNumber: { type: DataTypes.STRING(32), field: 'rule_number' },
  applicableEmployeeCategory: { type: DataTypes.STRING(64), field: 'applicable_employee_category' },
  applicablePostCadreId: { type: DataTypes.INTEGER.UNSIGNED, field: 'applicable_post_cadre_id' },
  conditions: { type: DataTypes.JSON },
  calculationMethod: { type: DataTypes.STRING(128), field: 'calculation_method' },
  governmentOrderId: { type: DataTypes.INTEGER.UNSIGNED, field: 'government_order_id' },
  effectiveFrom: { type: DataTypes.DATEONLY, field: 'effective_from' },
  effectiveTo: { type: DataTypes.DATEONLY, field: 'effective_to' },

  // Free-text GO fallback, kept for rules whose GO isn't registered as its own row yet
  goNumber: { type: DataTypes.STRING(64), field: 'go_number' },
  goDate: { type: DataTypes.DATEONLY, field: 'go_date' },
  issuingAuthority: { type: DataTypes.STRING(128), field: 'issuing_authority' },
  documentUrl: { type: DataTypes.STRING(500), field: 'document_url' },
  description: { type: DataTypes.TEXT },
  isVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_verified' },
  status: { type: DataTypes.ENUM('ACTIVE', 'SUPERSEDED', 'DRAFT'), allowNull: false, defaultValue: 'DRAFT' },
}, {
  tableName: 'rule_reference',
});

module.exports = RuleReference;
