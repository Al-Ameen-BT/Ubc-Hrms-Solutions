'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * One row per employee/leaveType/leave-year — the running balance (see
 * services/leave.js). `year` follows the organisation's yearType (see
 * YearEndClosure/OrgPayrollSetting.yearType) the same way it does there.
 * closingBalance = openingBalance + accrued - availed, recomputed and
 * cached on every accrual/approval/cancellation so it can be read directly
 * without re-deriving it each time.
 */
const EmployeeLeaveBalance = sequelize.define('EmployeeLeaveBalance', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  leaveTypeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'leave_type_id' },
  year: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  openingBalance: { type: DataTypes.DECIMAL(6, 1), allowNull: false, defaultValue: 0, field: 'opening_balance' },
  accrued: { type: DataTypes.DECIMAL(6, 1), allowNull: false, defaultValue: 0 },
  availed: { type: DataTypes.DECIMAL(6, 1), allowNull: false, defaultValue: 0 },
  closingBalance: { type: DataTypes.DECIMAL(6, 1), allowNull: false, defaultValue: 0, field: 'closing_balance' },
  lastAccrualMonth: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'last_accrual_month' }, // guards against double-accrual for the same month
}, {
  tableName: 'employee_leave_balance',
  indexes: [{ unique: true, fields: ['employee_id', 'leave_type_id', 'year'] }],
});

module.exports = EmployeeLeaveBalance;
