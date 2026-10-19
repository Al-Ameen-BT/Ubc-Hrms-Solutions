'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * One row per employee per calendar month: how many Loss of Pay (LOP) days
 * were recorded that month. Attendance itself (present/absent per day) is
 * not tracked day-by-day here — only the LOP-day count HR/Payroll enters
 * after reconciling attendance, which is all the payslip (services/
 * payslip.js) needs to pro-rate Basic+DA+allowances for that month.
 */
const EmployeeAttendance = sequelize.define('EmployeeAttendance', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  year: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
  month: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, validate: { min: 1, max: 12 } },
  lopDays: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'lop_days' },
  remarks: { type: DataTypes.STRING(500) },
  markedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'marked_by' },
}, {
  tableName: 'employee_attendance',
  indexes: [{ unique: true, fields: ['employee_id', 'year', 'month'] }],
});

module.exports = EmployeeAttendance;
