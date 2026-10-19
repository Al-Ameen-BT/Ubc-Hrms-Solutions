'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * One of an employee's bank accounts. An employee may have several — their
 * regular Savings Bank (SB) account, an Overdraft (OD) account, a
 * Recurring Deposit (RD) account tied to that Overdraft, or any other
 * account. Employee.bankName/bankAccountNumber/bankIfsc (the original
 * single-account fields) are kept as-is for backward compatibility and
 * remain the fallback salary account when Employee.salaryCreditAccountId
 * is not set — see services/bankAccounts.js.
 *
 * EmployeeOverdraft.accountId and EmployeeRecurringDeposit.accountId (both
 * added later — see migrate.js) point back to a row here of the matching
 * accountType, recording exactly which OD/RD account each instrument's
 * deduction is recovered into.
 */
const EmployeeBankAccount = sequelize.define('EmployeeBankAccount', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  accountType: { type: DataTypes.ENUM('SB', 'OD', 'RD', 'OTHER'), allowNull: false, defaultValue: 'SB', field: 'account_type' },
  bankName: { type: DataTypes.STRING(255), allowNull: true, field: 'bank_name' },
  accountNumber: { type: DataTypes.STRING(32), allowNull: false, field: 'account_number' },
  ifsc: { type: DataTypes.STRING(16), allowNull: true },
  branchName: { type: DataTypes.STRING(255), allowNull: true, field: 'branch_name' },
  remarks: { type: DataTypes.STRING(500), allowNull: true },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
}, {
  tableName: 'employee_bank_account',
  indexes: [{ unique: true, fields: ['employee_id', 'account_number'] }],
});

module.exports = EmployeeBankAccount;
