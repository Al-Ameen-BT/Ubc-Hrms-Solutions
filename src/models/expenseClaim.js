'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
module.exports = sequelize.define('ExpenseClaim', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  expenseDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'expense_date' },
  category: { type: DataTypes.STRING(64), allowNull: false },
  purpose: { type: DataTypes.STRING(500), allowNull: false },
  amount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  status: { type: DataTypes.ENUM('SUBMITTED', 'PREPARED', 'APPROVED', 'REJECTED', 'PAID', 'WITHDRAWN'), allowNull: false, defaultValue: 'SUBMITTED' },
  submittedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'submitted_by' },
  preparedBy: { type: DataTypes.INTEGER.UNSIGNED, field: 'prepared_by' },
  preparedAt: { type: DataTypes.DATE, field: 'prepared_at' },
  decidedBy: { type: DataTypes.INTEGER.UNSIGNED, field: 'decided_by' },
  decidedAt: { type: DataTypes.DATE, field: 'decided_at' },
  decisionReason: { type: DataTypes.STRING(500), field: 'decision_reason' },
  paidBy: { type: DataTypes.INTEGER.UNSIGNED, field: 'paid_by' },
  paidAt: { type: DataTypes.DATEONLY, field: 'paid_at' },
  paymentReference: { type: DataTypes.STRING(128), field: 'payment_reference' },
}, { tableName: 'expense_claim', indexes: [{ fields: ['organization_id', 'status'] }, { fields: ['employee_id', 'expense_date'] }] });
