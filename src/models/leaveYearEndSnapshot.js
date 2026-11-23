'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Immutable audit snapshot of an executed Annual Leave Rollover.
 * Records the transition from year Y -> Y+1, summarizing lapsed days (CL),
 * carried forward days (EL), capped days (at statutory 300-day limit),
 * and new opening balances credited.
 */
const LeaveYearEndSnapshot = sequelize.define('LeaveYearEndSnapshot', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  fromYear: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'from_year' },
  toYear: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'to_year' },
  cycleType: { type: DataTypes.ENUM('CALENDAR', 'FINANCIAL'), allowNull: false, defaultValue: 'CALENDAR', field: 'cycle_type' },
  employeesCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'employees_count' },
  totalLapsedDays: { type: DataTypes.DECIMAL(8, 1), allowNull: false, defaultValue: 0, field: 'total_lapsed_days' },
  totalCarriedForwardDays: { type: DataTypes.DECIMAL(8, 1), allowNull: false, defaultValue: 0, field: 'total_carried_forward_days' },
  totalCappedDays: { type: DataTypes.DECIMAL(8, 1), allowNull: false, defaultValue: 0, field: 'total_capped_days' },
  executedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'executed_at' },
  executedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'executed_by' },
  summaryJson: { type: DataTypes.TEXT, allowNull: true, field: 'summary_json' },
  remarks: { type: DataTypes.STRING(500), allowNull: true },
}, {
  tableName: 'leave_year_end_snapshot',
  indexes: [{ unique: true, fields: ['organization_id', 'from_year', 'to_year'] }],
});

module.exports = LeaveYearEndSnapshot;
