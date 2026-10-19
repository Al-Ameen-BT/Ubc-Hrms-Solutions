'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * One row per organisation/year — tracks whether that year's books are
 * still OPEN or have been CLOSED at year-end. `year` is the label the org
 * uses for it: for yearType CALENDAR that's the calendar year itself
 * (2026 = Jan-Dec 2026); for yearType FINANCIAL it's the year the FY
 * STARTS in (2026 = 1 Apr 2026 - 31 Mar 2027). See services/yearEnd.js
 * yearBounds()/yearLabelFor() for the boundary math, and
 * OrgPayrollSetting.yearType for the org's chosen convention.
 *
 * `summaryJson` snapshots the year's payroll/arrears totals at the moment
 * it was closed, so the closed figure stays fixed even if underlying data
 * is edited later (same "freeze at close" convention as a PayrollRun line).
 */
const YearEndClosure = sequelize.define('YearEndClosure', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  year: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  yearType: { type: DataTypes.ENUM('CALENDAR', 'FINANCIAL'), allowNull: false, field: 'year_type' },
  startDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'start_date' },
  endDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'end_date' },
  status: { type: DataTypes.ENUM('OPEN', 'CLOSED'), allowNull: false, defaultValue: 'OPEN' },
  closedAt: { type: DataTypes.DATE, allowNull: true, field: 'closed_at' },
  closedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'closed_by' },
  summaryJson: { type: DataTypes.TEXT, allowNull: true, field: 'summary_json' },
  remarks: { type: DataTypes.STRING(500), allowNull: true },
}, {
  tableName: 'year_end_closure',
  indexes: [{ unique: true, fields: ['organization_id', 'year'] }],
});

module.exports = YearEndClosure;
