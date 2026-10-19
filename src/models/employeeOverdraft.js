'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * One row per Employee Overdraft actually availed (a real loan record, not
 * just an eligibility figure). Eligibility ceiling and the maximum
 * repayment period (shortened automatically if the employee is retiring —
 * standard age 60 from date of birth — sooner than the org's normal 84
 * months) are enforced at creation time in services/loans.js. Like Festival
 * Advance, repayment progress is computed live from availedDate rather than
 * posted monthly.
 *
 * interestRatePercent is a SNAPSHOT of the organisation's
 * OrgPayrollSetting.odInterestRatePercent on the day this Overdraft was
 * created — later changes to the org's rate never touch an existing
 * Overdraft; only a new one picks up the new rate. Interest is flat/simple
 * over the full repayment period (amount x rate% x repayMonths/12), added
 * once to the principal and then split evenly across the instalments — not
 * a reducing-balance calculation. Confirm this matches the bank's actual
 * OD product before relying on it for real payroll.
 */
const EmployeeOverdraft = sequelize.define('EmployeeOverdraft', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  availedDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'availed_date' },
  repayMonths: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'repay_months' },
  interestRatePercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 0, field: 'interest_rate_percent' },
  accountId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'account_id' }, // -> EmployeeBankAccount (accountType OD) this Overdraft is availed against
  remarks: { type: DataTypes.STRING(500) },
}, {
  tableName: 'employee_overdraft',
});

module.exports = EmployeeOverdraft;
