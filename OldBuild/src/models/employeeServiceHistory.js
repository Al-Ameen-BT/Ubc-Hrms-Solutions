'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const EmployeeServiceHistory = sequelize.define('EmployeeServiceHistory', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  eventType: {
    type: DataTypes.ENUM(
      'APPOINTMENT', 'PROBATION', 'CONFIRMATION', 'INCREMENT', 'PROMOTION',
      'TRANSFER', 'HIGHER_GRADE', 'PAY_REVISION', 'SUSPENSION', 'LWA',
      'BREAK_IN_SERVICE', 'DISCIPLINARY', 'RETIREMENT', 'DA_ARREARS_PAYMENT', 'OTHER'
    ),
    allowNull: false,
    field: 'event_type',
  },
  eventDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'event_date' },
  orderRef: { type: DataTypes.STRING(128), field: 'order_ref' },
  payHistoryId: { type: DataTypes.INTEGER.UNSIGNED, field: 'pay_history_id' },
  ruleReferenceId: { type: DataTypes.INTEGER.UNSIGNED, field: 'rule_reference_id' },
  governmentOrderId: { type: DataTypes.INTEGER.UNSIGNED, field: 'government_order_id' },
  remarks: { type: DataTypes.TEXT },
}, {
  tableName: 'employee_service_history',
});

module.exports = EmployeeServiceHistory;
