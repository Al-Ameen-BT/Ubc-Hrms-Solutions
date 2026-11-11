'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
module.exports = sequelize.define('FinancialChangeProposal', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  targetType: { type: DataTypes.ENUM('ORG_SETTINGS', 'EMPLOYEE'), allowNull: false, field: 'target_type' },
  targetId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'target_id' },
  patch: { type: DataTypes.JSON, allowNull: false },
  effectiveDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'effective_date' },
  reason: { type: DataTypes.STRING(500), allowNull: false },
  status: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'), allowNull: false, defaultValue: 'PENDING' },
  preparedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'prepared_by' },
  decidedBy: { type: DataTypes.INTEGER.UNSIGNED, field: 'decided_by' },
  decidedAt: { type: DataTypes.DATE, field: 'decided_at' },
}, { tableName: 'financial_change_proposal', indexes: [{ name: 'idx_financial_change_target_date', fields: ['organization_id', 'target_type', 'target_id', 'status', 'effective_date'] }] });
