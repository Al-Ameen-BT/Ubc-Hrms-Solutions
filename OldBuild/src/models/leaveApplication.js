'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * A leave application — filed by HR on the employee's behalf (this product
 * has no employee self-service login), decided by an approver. See
 * services/leave.js. `days` is the inclusive calendar-day span
 * (toDate - fromDate + 1); half-day/working-day-only granularity is not
 * modelled in this first slice.
 */
const LeaveApplication = sequelize.define('LeaveApplication', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  leaveTypeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'leave_type_id' },
  fromDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'from_date' },
  toDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'to_date' },
  days: { type: DataTypes.DECIMAL(6, 1), allowNull: false },
  reason: { type: DataTypes.STRING(500), allowNull: true },
  status: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'), allowNull: false, defaultValue: 'PENDING' },
  appliedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'applied_by' },
  decidedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'decided_by' },
  decidedAt: { type: DataTypes.DATE, allowNull: true, field: 'decided_at' },
  decisionReason: { type: DataTypes.STRING(500), allowNull: true, field: 'decision_reason' },
}, {
  tableName: 'leave_application',
});

module.exports = LeaveApplication;
