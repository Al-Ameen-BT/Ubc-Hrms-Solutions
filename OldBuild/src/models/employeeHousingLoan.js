'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * One row per Housing Loan an employee has availed. An employee may hold
 * MULTIPLE housing loans; each is its own row, shown and deducted
 * separately (never merged into one figure). The monthly EMI is computed
 * (not stored) from totalLoanAmount/interestRatePercent/periodMonths using
 * the standard reducing-balance amortisation formula — see
 * services/loans.js's housingLoanStatus(). periodMonths is derived from
 * emiStartDate/emiEndDate at creation time (months between the two dates)
 * so the two given dates and the period always agree.
 */
const EmployeeHousingLoan = sequelize.define('EmployeeHousingLoan', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  totalLoanAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'total_loan_amount' },
  interestRatePercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, field: 'interest_rate_percent' },
  emiStartDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'emi_start_date' },
  emiEndDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'emi_end_date' },
  periodMonths: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'period_months' },
  closureDate: { type: DataTypes.DATEONLY, field: 'closure_date' },
  remarks: { type: DataTypes.STRING(500) },
}, {
  tableName: 'employee_housing_loan',
});

module.exports = EmployeeHousingLoan;
