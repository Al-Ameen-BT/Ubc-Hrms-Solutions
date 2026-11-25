'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const EmployeeServiceInformation = sequelize.define('EmployeeServiceInformation', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true, field: 'employee_id' },
  probationPeriodDays: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'probation_period_days' },
  probationDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'probation_date' },
  confirmationPeriodDays: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'confirmation_period_days' },
  confirmationDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'confirmation_date' },
  lastIncrementDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'last_increment_date' },
  lastPromotionDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'last_promotion_date' },
  lastTransferDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'last_transfer_date' },
  seniorityDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'seniority_date' },
  seniorityNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'seniority_number' },
  retirementDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'retirement_date' },
  resignationDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'resignation_date' },
  resignationReason: { type: DataTypes.STRING(1000), allowNull: true, field: 'resignation_reason' },
  serviceLastDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'service_last_date' },
  pfJoiningDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'pf_joining_date' },
  pensionJoiningDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'pension_joining_date' },
  pfExitDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'pf_exit_date' },
  pensionExitDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'pension_exit_date' },
}, { tableName: 'employee_service_information' });

module.exports = EmployeeServiceInformation;
