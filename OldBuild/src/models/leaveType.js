'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * One row per leave type an organisation offers (Casual Leave, Earned
 * Leave, Half Pay Leave, Maternity Leave, ...) — see services/leave.js.
 *
 * accrualMethod:
 *   FIXED_ANNUAL       — the full `annualDays` is credited once, at the
 *                         start of each leave year (e.g. Casual Leave: all
 *                         20 days on 1 Jan / 1 Apr, non-cumulative if
 *                         carryForward is false).
 *   ACCRUAL_PER_MONTH  — `annualDays` / 12 is credited at the end of each
 *                         month (e.g. Earned Leave accruing through the year).
 *   NONE               — not balance-tracked at all (e.g. Special Casual
 *                         Leave sanctioned case-by-case) — applications
 *                         against a NONE-accrual type skip the balance check.
 */
const LeaveType = sequelize.define('LeaveType', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  code: { type: DataTypes.STRING(16), allowNull: false },
  name: { type: DataTypes.STRING(128), allowNull: false },
  accrualMethod: { type: DataTypes.ENUM('FIXED_ANNUAL', 'ACCRUAL_PER_MONTH', 'NONE'), allowNull: false, defaultValue: 'FIXED_ANNUAL', field: 'accrual_method' },
  annualDays: { type: DataTypes.DECIMAL(6, 1), allowNull: false, defaultValue: 0, field: 'annual_days' },
  maxAccumulation: { type: DataTypes.DECIMAL(6, 1), allowNull: true, field: 'max_accumulation' }, // null = unlimited carry-forward
  carryForward: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'carry_forward' },
  encashable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  paidPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 100, field: 'paid_percent' }, // e.g. 50 for Half Pay Leave
  requiresApproval: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'requires_approval' },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
  remarks: { type: DataTypes.STRING(500), allowNull: true },
}, {
  tableName: 'leave_type',
  indexes: [{ unique: true, fields: ['organization_id', 'code'] }],
});

module.exports = LeaveType;
