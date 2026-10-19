'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * One payroll processing run for one organisation for one calendar month —
 * the "batch" that turns the live/estimated payslip preview (services/
 * payslip.js, still used as-is for a single employee's on-screen preview)
 * into a persisted, immutable payroll register once it is actually run.
 *
 * Lifecycle: DRAFT/PROCESSED (re-runnable — re-processing replaces every
 * PayrollRunLine so it always reflects the latest master data) ->
 * APPROVED (an Approving Authority signs off; the run and its lines
 * become read-only) -> PAID (disbursement file has been generated/marked
 * sent). A REJECTED run is also frozen (kept for the record) but can be
 * superseded by starting a fresh run for the same organisation/month
 * (see services/payrollEngine.js — at most one run per org/month is kept
 * "live" at a time; a REJECTED one is excluded from that uniqueness check
 * to explicitly allow the do-over run).
 */
const PayrollRun = sequelize.define('PayrollRun', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  year: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  month: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false }, // 1-12
  status: {
    type: DataTypes.ENUM('PROCESSED', 'APPROVED', 'REJECTED', 'PAID'),
    allowNull: false,
    defaultValue: 'PROCESSED',
  },
  employeeCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'employee_count' },
  totalGrossEarnings: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0, field: 'total_gross_earnings' },
  totalDeductions: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0, field: 'total_deductions' },
  totalNetPay: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0, field: 'total_net_pay' },
  processedAt: { type: DataTypes.DATE, allowNull: true, field: 'processed_at' },
  processedByUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'processed_by_user_id' },
  approvedAt: { type: DataTypes.DATE, allowNull: true, field: 'approved_at' },
  approvedByUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'approved_by_user_id' },
  paidAt: { type: DataTypes.DATE, allowNull: true, field: 'paid_at' },
  paidByUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'paid_by_user_id' },
  rejectionReason: { type: DataTypes.TEXT, allowNull: true, field: 'rejection_reason' },
  notes: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'payroll_run',
  indexes: [{ unique: false, fields: ['organization_id', 'year', 'month'] }],
});

module.exports = PayrollRun;
