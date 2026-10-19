'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const EmployeeServiceEvent = sequelize.define('EmployeeServiceEvent', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  eventType: {
    type: DataTypes.ENUM('LWA', 'SUSPENSION', 'BREAK_IN_SERVICE', 'EXTRAORDINARY_LEAVE', 'REJOIN', 'OTHER'),
    allowNull: false,
    field: 'event_type',
  },
  startDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'start_date' },
  endDate: { type: DataTypes.DATEONLY, field: 'end_date' },
  affectsIncrementDate: {
    type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'affects_increment_date',
  },
  daysCount: { type: DataTypes.INTEGER.UNSIGNED, field: 'days_count' },
  orderRef: { type: DataTypes.STRING(128), field: 'order_ref' },
  remarks: { type: DataTypes.TEXT },
}, {
  tableName: 'employee_service_event',
});

module.exports = EmployeeServiceEvent;
