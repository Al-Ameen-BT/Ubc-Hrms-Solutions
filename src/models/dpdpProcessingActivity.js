'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('DpdpProcessingActivity', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  code: { type: DataTypes.STRING(64), allowNull: false },
  module: { type: DataTypes.STRING(64), allowNull: false },
  storageLocation: { type: DataTypes.STRING(255), allowNull: false, field: 'storage_location' },
  fieldName: { type: DataTypes.STRING(128), allowNull: false, field: 'field_name' },
  dataCategory: { type: DataTypes.STRING(64), allowNull: false, field: 'data_category' },
  principalType: { type: DataTypes.STRING(32), allowNull: false, field: 'principal_type' },
  purpose: { type: DataTypes.TEXT, allowNull: false },
  lawfulBasis: { type: DataTypes.STRING(40), allowNull: false, field: 'lawful_basis' },
  legalReference: { type: DataTypes.STRING(255), allowNull: true, field: 'legal_reference' },
  dataSource: { type: DataTypes.STRING(255), allowNull: true, field: 'data_source' },
  accessRoles: { type: DataTypes.JSON, allowNull: false, defaultValue: [], field: 'access_roles' },
  processorIds: { type: DataTypes.JSON, allowNull: false, defaultValue: [], field: 'processor_ids' },
  retentionCategory: { type: DataTypes.STRING(64), allowNull: true, field: 'retention_category' },
  deletionTrigger: { type: DataTypes.STRING(255), allowNull: true, field: 'deletion_trigger' },
  securityClassification: { type: DataTypes.STRING(24), allowNull: false, field: 'security_classification' },
  dpiaRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'dpia_required' },
  riskReviewStatus: { type: DataTypes.STRING(24), allowNull: true, field: 'risk_review_status' },
  biometricAlternativeAvailable: { type: DataTypes.BOOLEAN, allowNull: true, field: 'biometric_alternative_available' },
  rawBiometricStored: { type: DataTypes.BOOLEAN, allowNull: true, field: 'raw_biometric_stored' },
  reviewOwnerUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'review_owner_user_id' },
  nextReviewAt: { type: DataTypes.DATEONLY, allowNull: true, field: 'next_review_at' },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
}, {
  tableName: 'dpdp_processing_activity',
  indexes: [
    { name: 'uq_dpdp_activity_org_code', unique: true, fields: ['organization_id', 'code'] },
    { name: 'idx_dpdp_activity_org_status', fields: ['organization_id', 'status'] },
  ],
});
