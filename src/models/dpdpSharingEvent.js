'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('DpdpSharingEvent', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'employee_id' },
  principalType: { type: DataTypes.STRING(32), allowNull: false, field: 'principal_type' },
  principalReference: { type: DataTypes.STRING(128), allowNull: true, field: 'principal_reference' },
  processingActivityId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'processing_activity_id' },
  processorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'processor_id' },
  recipientName: { type: DataTypes.STRING(255), allowNull: true, field: 'recipient_name' },
  dataCategories: { type: DataTypes.JSON, allowNull: false, defaultValue: [], field: 'data_categories' },
  purpose: { type: DataTypes.TEXT, allowNull: false },
  lawfulAuthority: { type: DataTypes.STRING(255), allowNull: false, field: 'lawful_authority' },
  sharedAt: { type: DataTypes.DATE, allowNull: false, field: 'shared_at' },
  recordedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'recorded_by' },
}, {
  tableName: 'dpdp_sharing_event',
  updatedAt: false,
  indexes: [
    { name: 'idx_dpdp_share_org_time', fields: ['organization_id', 'shared_at'] },
    { name: 'idx_dpdp_share_org_emp', fields: ['organization_id', 'employee_id'] },
  ],
});
