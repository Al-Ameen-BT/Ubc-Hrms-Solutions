'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Admin-defined Deduction master, category-based.
 * Supports configurable deduction categories (STATUTORY, WELFARE, SOCIETY, INSURANCE, LOAN, VOLUNTARY, OTHER),
 * frequencies (MONTHLY, YEARLY, ONE_TIME), and calculation modes (FLAT or PERCENTAGE).
 * Also supports optional employer matching / contribution.
 */
const DeductionType = sequelize.define('DeductionType', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  name: { type: DataTypes.STRING(128), allowNull: false },
  category: {
    type: DataTypes.ENUM('STATUTORY', 'WELFARE', 'SOCIETY', 'INSURANCE', 'LOAN', 'VOLUNTARY', 'OTHER'),
    allowNull: false,
    defaultValue: 'OTHER',
  },
  calculationType: {
    type: DataTypes.ENUM('FLAT', 'PERCENTAGE'),
    allowNull: false,
    defaultValue: 'FLAT',
    field: 'calculation_type',
  },
  percentageBase: {
    type: DataTypes.ENUM('BASIC', 'BASIC_PLUS_DA', 'GROSS'),
    allowNull: true,
    field: 'percentage_base',
  },
  percentageValue: {
    type: DataTypes.DECIMAL(6, 3),
    allowNull: true,
    field: 'percentage_value',
  },
  frequency: {
    type: DataTypes.ENUM('MONTHLY', 'YEARLY', 'ONE_TIME'),
    allowNull: false,
    defaultValue: 'MONTHLY',
  },
  month: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }, // 1-12; required for YEARLY/ONE_TIME
  year: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }, // required for ONE_TIME
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  employerAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'employer_amount' },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
  remarks: { type: DataTypes.STRING(500), allowNull: true },
}, {
  tableName: 'deduction_type',
});

module.exports = DeductionType;
