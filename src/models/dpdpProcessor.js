'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('DpdpProcessor', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  code: { type: DataTypes.STRING(64), allowNull: false },
  name: { type: DataTypes.STRING(255), allowNull: false },
  serviceCategory: { type: DataTypes.STRING(64), allowNull: true, field: 'service_category' },
  purpose: { type: DataTypes.TEXT, allowNull: true },
  dataCategories: { type: DataTypes.JSON, allowNull: false, defaultValue: [], field: 'data_categories' },
  processingLocations: { type: DataTypes.JSON, allowNull: false, defaultValue: [], field: 'processing_locations' },
  crossBorder: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'cross_border' },
  dpaStatus: { type: DataTypes.ENUM('MISSING', 'DRAFT', 'CURRENT', 'EXPIRED'), allowNull: false, defaultValue: 'MISSING', field: 'dpa_status' },
  dpaEffectiveAt: { type: DataTypes.DATEONLY, allowNull: true, field: 'dpa_effective_at' },
  dpaExpiresAt: { type: DataTypes.DATEONLY, allowNull: true, field: 'dpa_expires_at' },
  breachContact: { type: DataTypes.STRING(255), allowNull: true, field: 'breach_contact' },
  contractControls: { type: DataTypes.JSON, allowNull: false, defaultValue: {}, field: 'contract_controls' },
  nextReviewAt: { type: DataTypes.DATEONLY, allowNull: true, field: 'next_review_at' },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
}, {
  tableName: 'dpdp_processor',
  indexes: [
    { name: 'uq_dpdp_processor_org_code', unique: true, fields: ['organization_id', 'code'] },
    { name: 'idx_dpdp_processor_org_status', fields: ['organization_id', 'status'] },
  ],
});
