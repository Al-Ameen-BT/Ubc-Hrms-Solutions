'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
module.exports = sequelize.define('EmployeeTimeEntry', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  localDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'local_date' },
  checkInAt: { type: DataTypes.DATE, allowNull: false, field: 'check_in_at' },
  checkOutAt: { type: DataTypes.DATE, field: 'check_out_at' },
  correctedBy: { type: DataTypes.INTEGER.UNSIGNED, field: 'corrected_by' },
  correctionReason: { type: DataTypes.STRING(500), field: 'correction_reason' },
}, { tableName: 'employee_time_entry', indexes: [{ unique: true, fields: ['employee_id', 'local_date'] }, { fields: ['organization_id', 'local_date'] }] });
