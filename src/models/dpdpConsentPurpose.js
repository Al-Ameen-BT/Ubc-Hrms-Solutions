'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('DpdpConsentPurpose', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  code: { type: DataTypes.STRING(64), allowNull: false },
  titleEn: { type: DataTypes.STRING(255), allowNull: false, field: 'title_en' },
  titleMl: { type: DataTypes.STRING(255), allowNull: true, field: 'title_ml' },
  descriptionEn: { type: DataTypes.TEXT, allowNull: false, field: 'description_en' },
  descriptionMl: { type: DataTypes.TEXT, allowNull: true, field: 'description_ml' },
  dataCategories: { type: DataTypes.JSON, allowNull: false, defaultValue: [], field: 'data_categories' },
  noticeDocumentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'notice_document_id' },
  withdrawalConsequenceEn: { type: DataTypes.TEXT, allowNull: true, field: 'withdrawal_consequence_en' },
  withdrawalConsequenceMl: { type: DataTypes.TEXT, allowNull: true, field: 'withdrawal_consequence_ml' },
  effectiveAt: { type: DataTypes.DATE, allowNull: true, field: 'effective_at' },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
}, {
  tableName: 'dpdp_consent_purpose',
  indexes: [
    { name: 'uq_dpdp_consent_purpose_code', unique: true, fields: ['organization_id', 'code'] },
    { name: 'idx_dpdp_consent_purpose_state', fields: ['organization_id', 'status'] },
  ],
});
