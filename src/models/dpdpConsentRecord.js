'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('DpdpConsentRecord', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'user_id' },
  purposeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'purpose_id' },
  noticeDocumentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'notice_document_id' },
  decision: { type: DataTypes.ENUM('GRANTED', 'WITHDRAWN'), allowNull: false },
  channel: { type: DataTypes.ENUM('WEB', 'MOBILE'), allowNull: false },
  language: { type: DataTypes.ENUM('EN', 'ML'), allowNull: false, defaultValue: 'EN' },
  ipReference: { type: DataTypes.STRING(128), allowNull: true, field: 'ip_reference' },
  deviceReference: { type: DataTypes.STRING(128), allowNull: true, field: 'device_reference' },
  priorRecordId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'prior_record_id' },
  recordedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'recorded_at' },
}, {
  tableName: 'dpdp_consent_record',
  updatedAt: false,
  indexes: [
    { name: 'idx_dpdp_consent_emp_purpose', fields: ['organization_id', 'employee_id', 'purpose_id', 'id'] },
    { name: 'idx_dpdp_consent_user_time', fields: ['organization_id', 'user_id', 'recorded_at'] },
  ],
});
