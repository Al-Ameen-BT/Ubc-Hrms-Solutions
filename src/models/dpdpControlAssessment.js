'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('DpdpControlAssessment', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  controlCode: { type: DataTypes.STRING(64), allowNull: false, field: 'control_code' },
  title: { type: DataTypes.STRING(255), allowNull: false },
  status: { type: DataTypes.ENUM('IMPLEMENTED', 'PARTIAL', 'NOT_IMPLEMENTED', 'NOT_APPLICABLE'), allowNull: false },
  evidenceReference: { type: DataTypes.TEXT, allowNull: true, field: 'evidence_reference' },
  ownerUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'owner_user_id' },
  verifiedAt: { type: DataTypes.DATEONLY, allowNull: true, field: 'verified_at' },
  nextReviewAt: { type: DataTypes.DATEONLY, allowNull: true, field: 'next_review_at' },
}, {
  tableName: 'dpdp_control_assessment',
  indexes: [
    { name: 'uq_dpdp_control_org_code', unique: true, fields: ['organization_id', 'control_code'] },
    { name: 'idx_dpdp_control_org_status', fields: ['organization_id', 'status'] },
  ],
});
