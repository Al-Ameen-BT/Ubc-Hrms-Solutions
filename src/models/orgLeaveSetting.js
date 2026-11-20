'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Organisation-level leave calculation settings.
 * Configures how holidays and non-working days are handled across leave types.
 */
const OrgLeaveSetting = sequelize.define('OrgLeaveSetting', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true, field: 'organization_id' },

  // Master switch for Sandwich Rule / Calendar Days counting for leaves other than CL and LOP
  sandwichRuleEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'sandwich_rule_enabled' },

  // Casual Leave (CL) strictly excludes common holidays and weekly offs from leave deduction
  excludeHolidaysCasualLeave: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'exclude_holidays_casual_leave' },

  // Loss of Pay (LOP) strictly excludes common holidays and weekly offs from leave deduction
  excludeHolidaysLop: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'exclude_holidays_lop' },

  // Treat Sundays / weekly offs as non-working days (holidays)
  countSundaysAsHolidays: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'count_sundays_as_holidays' },

  // Weekly off schedule
  weekendPolicy: {
    type: DataTypes.ENUM('SUNDAY_ONLY', 'SATURDAY_SUNDAY', 'SECOND_FOURTH_SATURDAY_SUNDAY'),
    allowNull: false,
    defaultValue: 'SUNDAY_ONLY',
    field: 'weekend_policy',
  },

  remarks: { type: DataTypes.STRING(500), allowNull: true },
}, {
  tableName: 'org_leave_setting',
});

module.exports = OrgLeaveSetting;
