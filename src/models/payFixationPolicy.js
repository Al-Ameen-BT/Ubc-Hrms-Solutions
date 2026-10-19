'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const PayFixationPolicy = sequelize.define('PayFixationPolicy', {
  policyId: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true, field: 'policy_id' },
  policyName: { type: DataTypes.STRING(128), allowNull: false, field: 'policy_name' },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false, field: 'effective_from' },
  effectiveTo: { type: DataTypes.DATEONLY, field: 'effective_to' },
  promotionMethod: {
    type: DataTypes.ENUM(
      'NOTIONAL_INCREMENT_THEN_FIX',
      'DIRECT_NEXT_HIGHER_STAGE',
      'DEFER_TO_NEXT_INCREMENT',
      'CUSTOM'
    ),
    allowNull: false,
    field: 'promotion_method',
  },
  notionalIncrementEnabled: {
    type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'notional_increment_enabled',
  },
  notionalIncrementCount: {
    type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1, field: 'notional_increment_count',
  },
  fixationMethod: { type: DataTypes.STRING(64), field: 'fixation_method' },
  nextIncrementOptionEnabled: {
    type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'next_increment_option_enabled',
  },
  optionDeadlineDays: { type: DataTypes.INTEGER.UNSIGNED, field: 'option_deadline_days' },
  stageSelectionMethod: {
    type: DataTypes.ENUM('NEXT_HIGHER_STAGE', 'NEXT_EQUAL_OR_HIGHER', 'CUSTOM_RULE'),
    allowNull: false,
    field: 'stage_selection_method',
  },
  roundingMethod: {
    type: DataTypes.ENUM('NONE', 'ROUND_UP', 'ROUND_DOWN', 'ROUND_NEAREST'),
    allowNull: false,
    defaultValue: 'NONE',
    field: 'rounding_method',
  },
  applicableGrade: { type: DataTypes.STRING(64), field: 'applicable_grade' },
  applicableCategory: { type: DataTypes.STRING(64), field: 'applicable_category' },
  ruleReferenceId: { type: DataTypes.INTEGER.UNSIGNED, field: 'rule_reference_id' },
  goReference: { type: DataTypes.STRING(128), field: 'go_reference' },
  status: { type: DataTypes.ENUM('DRAFT', 'ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'DRAFT' },
}, {
  tableName: 'pay_fixation_policy',
});

module.exports = PayFixationPolicy;
