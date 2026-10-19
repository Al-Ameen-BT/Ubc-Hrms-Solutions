'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const PayScale = sequelize.define('PayScale', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  payRevisionId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'pay_revision_id' },
  code: { type: DataTypes.STRING(64), allowNull: false },
  name: { type: DataTypes.STRING(128), allowNull: false },
  scaleExpression: { type: DataTypes.STRING(255), field: 'scale_expression' },
  // "Grade Details" shown on an employee's payslip (name/scaleExpression
  // above + these two) — how many days this grade's pay is reckoned over.
  // payableDays defaults to 31 (calendar-day basis); monthDays is left
  // blank unless the bank uses a different fixed divisor (e.g. 30).
  payableDays: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, defaultValue: 31, field: 'payable_days' },
  monthDays: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'month_days' },
  effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false, field: 'effective_from' },
  effectiveTo: { type: DataTypes.DATEONLY, field: 'effective_to' },
  status: { type: DataTypes.ENUM('ACTIVE', 'SUPERSEDED'), allowNull: false, defaultValue: 'ACTIVE' },
}, {
  tableName: 'pay_scale',
  indexes: [{ unique: true, fields: ['organization_id', 'code'] }],
});

module.exports = PayScale;
