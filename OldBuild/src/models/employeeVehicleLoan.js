'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * One row per Vehicle Loan an employee has availed. Whether MULTIPLE loans
 * per employee are allowed at once is an org toggle
 * (OrgPayrollSetting.vehicleLoanAllowMultiple, default OFF — one at a time,
 * matching how this has worked so far); when several are allowed, each row
 * is shown and deducted separately.
 *
 * interestRatePercent, if set (defaults to the org's
 * vehicleLoanInterestRatePercent), drives an automatically-computed EMI via
 * the standard reducing-balance ("diminishing") amortisation formula — the
 * same one Housing Loan uses (see services/loans.js reducingBalanceEmi()).
 * emiAmount is only used when interestRatePercent is null (a manually
 * entered EMI, for a loan with no rate on record) — see loans.js
 * vehicleLoanStatus() for exactly how the two interact.
 */
const EmployeeVehicleLoan = sequelize.define('EmployeeVehicleLoan', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  totalAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'total_amount' },
  vehicleType: { type: DataTypes.STRING(100), field: 'vehicle_type' },
  startDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'start_date' },
  endDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'end_date' },
  periodMonths: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'period_months' },
  interestRatePercent: { type: DataTypes.DECIMAL(6, 3), allowNull: true, field: 'interest_rate_percent' },
  emiAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'emi_amount' },
  closureDate: { type: DataTypes.DATEONLY, field: 'closure_date' },
  remarks: { type: DataTypes.STRING(500) },
}, {
  tableName: 'employee_vehicle_loan',
});

module.exports = EmployeeVehicleLoan;
