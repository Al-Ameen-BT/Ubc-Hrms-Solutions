'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('DpdpDeletionResult', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  proposalId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'proposal_id' },
  targetType: { type: DataTypes.STRING(64), allowNull: false, field: 'target_type' },
  targetId: { type: DataTypes.STRING(64), allowNull: false, field: 'target_id' },
  status: { type: DataTypes.ENUM('DELETED', 'NOT_FOUND', 'DEFERRED', 'HELD', 'FAILED', 'VENDOR_CONFIRMATION_PENDING'), allowNull: false },
  detail: { type: DataTypes.STRING(500), allowNull: true },
}, { tableName: 'dpdp_deletion_result', updatedAt: false, indexes: [{ name: 'uq_dpdp_del_result_target', unique: true, fields: ['proposal_id', 'target_type', 'target_id'] }] });
