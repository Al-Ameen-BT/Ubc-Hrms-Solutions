'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const IncrementPolicy = sequelize.define('IncrementPolicy', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  policyName: { type: DataTypes.STRING(128), allowNull: false, field: 'policy_name' },
  dateBasis: {
    type: DataTypes.ENUM(
      'FIXED_COMMON_DATE',
      'DOJ_ANNIVERSARY',
      'DOA_ANNIVERSARY',
      'EMPLOYEE_SPECIFIC',
      'RULE_GRADE_CATEGORY_SPECIFIC'
    ),
    allowNull: false,
    field: 'date_basis',
  },
  fixedCommonDate: { type: DataTypes.STRING(5), field: 'fixed_common_date' }, // 'MM-DD'
  applicableGrade: { type: DataTypes.STRING(64), field: 'applicable_grade' },
  applicableCategory: { type: DataTypes.STRING(64), field: 'applicable_category' },
  incrementFrequencyMonths: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 12,
    field: 'increment_frequency_months',
  },
  effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false, field: 'effective_from' },
  effectiveTo: { type: DataTypes.DATEONLY, field: 'effective_to' },
  ruleReferenceId: { type: DataTypes.INTEGER.UNSIGNED, field: 'rule_reference_id' },
  status: { type: DataTypes.ENUM('DRAFT', 'ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'DRAFT' },
}, {
  tableName: 'increment_policy',
});

module.exports = IncrementPolicy;
