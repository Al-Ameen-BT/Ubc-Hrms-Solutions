'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * An admin-defined allowance, on top of the fixed set (DA/HRA/Risk/Other/
 * CCA/Conveyance/Medical/Bonus) that services/payslip.js already computes.
 * Unlike those, this is genuinely data-driven — a bank can add a new
 * allowance (e.g. "Hill Tract Allowance", "Officiating Allowance") from the
 * UI, without a code change.
 *
 * frequency:
 *   MONTHLY    — paid every month, amount as-is.
 *   YEARLY     — paid once every year, in `month` (e.g. an annual uniform
 *                allowance paid every April).
 *   ONE_TIME   — paid exactly once, in `month`/`year` (e.g. a one-off
 *                festival grant sanctioned for a specific month).
 *
 * Eligibility is by Post Cadre (see AllowanceTypePost, the join table) — an
 * allowance with no posts attached applies to every post. Amount is a flat
 * rupee figure applied to every eligible ACTIVE employee; it is NOT
 * pro-rated for Loss of Pay, matching how Risk/Other Allowance already
 * behave (services/payslip.js proRate() is not applied to these).
 */
const AllowanceType = sequelize.define('AllowanceType', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  name: { type: DataTypes.STRING(128), allowNull: false },
  calculationType: { type: DataTypes.ENUM('FLAT', 'PERCENTAGE'), allowNull: false, defaultValue: 'FLAT', field: 'calculation_type' },
  percentageBase: { type: DataTypes.ENUM('BASIC', 'BASIC_PLUS_DA', 'GROSS'), allowNull: true, field: 'percentage_base' },
  percentageValue: { type: DataTypes.DECIMAL(6, 3), allowNull: true, field: 'percentage_value' },
  maxAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'max_amount' },
  requiresEmployeeFlag: { type: DataTypes.STRING(64), allowNull: true, field: 'requires_employee_flag' },
  frequency: { type: DataTypes.ENUM('MONTHLY', 'YEARLY', 'ONE_TIME'), allowNull: false, defaultValue: 'MONTHLY' },
  month: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }, // 1-12; required for YEARLY/ONE_TIME
  year: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }, // required for ONE_TIME only
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
  remarks: { type: DataTypes.STRING(500), allowNull: true },
  catalogueId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'catalogue_id' },
  catalogueRuleCode: { type: DataTypes.STRING(64), allowNull: true, field: 'catalogue_rule_code' },
  customizableFields: { type: DataTypes.JSON, allowNull: false, defaultValue: [], field: 'customizable_fields' },
}, { tableName: 'allowance_type' });

module.exports = AllowanceType;
