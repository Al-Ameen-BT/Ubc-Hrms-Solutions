'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * The month-by-month calculation ledger behind one ArrearsCase's total —
 * exactly the "show your work" record the spec's worked example demands
 * (Applicable Basic Pay x DA Difference % for that specific month, not a
 * flat Total Months x Current Basic x %). Read-only once created; a
 * recalculation (services/arrears.js#calculateCase) replaces every row for
 * the case, but only while the case has no PAID installments.
 */
const ArrearsMonthDetail = sequelize.define('ArrearsMonthDetail', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  arrearsCaseId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'arrears_case_id' },
  year: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  month: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

  basicPayApplicable: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'basic_pay_applicable' },
  // Where basicPayApplicable came from — see services/arrears.js#basicPayAsOfMonth's
  // 3-tier fallback (frozen payroll run > pay-history event log > current estimate).
  basicPaySource: {
    type: DataTypes.ENUM('PAYROLL_RUN', 'PAY_HISTORY', 'CURRENT_ESTIMATE'),
    allowNull: false,
    field: 'basic_pay_source',
  },

  previousDaPercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, field: 'previous_da_percent' },
  revisedDaPercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, field: 'revised_da_percent' },
  daDifferencePercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, field: 'da_difference_percent' },

  arrearsAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'arrears_amount' },
}, {
  tableName: 'arrears_month_detail',
  indexes: [{ unique: true, fields: ['arrears_case_id', 'year', 'month'] }],
});

module.exports = ArrearsMonthDetail;
