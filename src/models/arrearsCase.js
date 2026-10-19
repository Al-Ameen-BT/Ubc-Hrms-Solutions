'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * One employee's calculated DA arrears under one DaRevision — created by
 * services/arrears.js#calculateForRevision, never auto-paid (see that
 * file's header comment for the two-phase calculate/pay design this
 * implements). `effectiveTotalAmount` is what payment plans are built
 * against: totalAdjustedAmount when a manual adjustment has been recorded,
 * else totalCalculatedAmount.
 */
const ArrearsCase = sequelize.define('ArrearsCase', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  daRevisionId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'da_revision_id' },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  empCode: { type: DataTypes.STRING(32), allowNull: false, field: 'emp_code' }, // snapshot, for display without a join
  employeeName: { type: DataTypes.STRING(255), allowNull: false, field: 'employee_name' },

  monthsCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'months_count' },
  totalCalculatedAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'total_calculated_amount' },

  // Manual Adjustment (spec requirement #4) — a mandatory reason is
  // enforced in services/arrears.js, not at the DB layer.
  totalAdjustedAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'total_adjusted_amount' },
  adjustmentReason: { type: DataTypes.TEXT, allowNull: true, field: 'adjustment_reason' },
  adjustedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'adjusted_by' },
  adjustedAt: { type: DataTypes.DATE, allowNull: true, field: 'adjusted_at' },

  effectiveTotalAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'effective_total_amount' },

  paymentMode: {
    type: DataTypes.ENUM('NONE', 'SINGLE_SHOT', 'INSTALLMENT', 'CUSTOM_INSTALLMENT'),
    allowNull: false,
    defaultValue: 'NONE',
    field: 'payment_mode',
  },
  status: {
    type: DataTypes.ENUM('CALCULATED', 'PLAN_SET', 'PARTIALLY_PAID', 'FULLY_PAID'),
    allowNull: false,
    defaultValue: 'CALCULATED',
  },

  calculatedAt: { type: DataTypes.DATE, allowNull: true, field: 'calculated_at' },
  calculatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'calculated_by' },
}, {
  tableName: 'arrears_case',
  indexes: [{ unique: true, fields: ['da_revision_id', 'employee_id'] }],
});

module.exports = ArrearsCase;
