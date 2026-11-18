'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('DpdpRetentionProposal', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  category: { type: DataTypes.STRING(64), allowNull: false },
  cutoffAt: { type: DataTypes.DATE, allowNull: false, field: 'cutoff_at' },
  candidateCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'candidate_count' },
  legalHold: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'legal_hold' },
  status: { type: DataTypes.ENUM('PROPOSED', 'APPROVED', 'REJECTED', 'COMPLETED', 'PARTIAL', 'FAILED'), allowNull: false, defaultValue: 'PROPOSED' },
  proposedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'proposed_by' },
  approvedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'approved_by' },
  decisionReason: { type: DataTypes.TEXT, allowNull: true, field: 'decision_reason' },
  approvedAt: { type: DataTypes.DATE, allowNull: true, field: 'approved_at' },
  executedAt: { type: DataTypes.DATE, allowNull: true, field: 'executed_at' },
  certificateDigest: { type: DataTypes.STRING(64), allowNull: true, field: 'certificate_digest' },
}, { tableName: 'dpdp_retention_proposal', indexes: [{ name: 'idx_dpdp_ret_prop_org_status', fields: ['organization_id', 'status', 'category'] }] });
