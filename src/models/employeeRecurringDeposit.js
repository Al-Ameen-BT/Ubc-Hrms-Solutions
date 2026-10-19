'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Optional Recurring Deposit, usually opened alongside an Overdraft
 * (overdraftId set) — see services/loans.js. monthlyAmount defaults to the
 * linked Overdraft's own monthly instalment when created, but is a plain
 * editable field so the admin/employee can change it.
 *
 * NOTE — Rule verification required: the user's spec ties the RD amount to
 * "the OD repayment split amount + interest amount"; no interest rate was
 * given, so the suggested default is principal-only (matches the
 * Overdraft's own instalment). Whether the RD should automatically stop
 * once the linked Overdraft is fully repaid is also unconfirmed — for now
 * it keeps running until closed by hand (status ACTIVE/CLOSED).
 */
const EmployeeRecurringDeposit = sequelize.define('EmployeeRecurringDeposit', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  overdraftId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'overdraft_id' },
  monthlyAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, field: 'monthly_amount' },
  startDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'start_date' },
  status: { type: DataTypes.ENUM('ACTIVE', 'CLOSED'), allowNull: false, defaultValue: 'ACTIVE' },
  accountId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'account_id' }, // -> EmployeeBankAccount (accountType RD) this instalment is credited into
  remarks: { type: DataTypes.STRING(500) },
}, {
  tableName: 'employee_recurring_deposit',
});

module.exports = EmployeeRecurringDeposit;
