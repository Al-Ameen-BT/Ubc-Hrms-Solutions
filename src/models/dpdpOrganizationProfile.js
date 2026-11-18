'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const DpdpOrganizationProfile = sequelize.define('DpdpOrganizationProfile', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    unique: true,
    field: 'organization_id',
  },
  dpoName: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'dpo_name',
  },
  dpoEmail: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'dpo_email',
  },
  dpoPhone: {
    type: DataTypes.STRING(64),
    allowNull: true,
    field: 'dpo_phone',
  },
  dpoAddress: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'dpo_address',
  },
  complianceStatus: {
    type: DataTypes.ENUM('NOT_CONFIGURED', 'IN_PROGRESS', 'READY'),
    allowNull: false,
    defaultValue: 'NOT_CONFIGURED',
    field: 'compliance_status',
  },
  grievanceProcedure: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'grievance_procedure',
  },
  dataRetentionPolicy: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'data_retention_policy',
  },
}, {
  tableName: 'dpdp_organization_profile',
  indexes: [
    {
      name: 'uq_dpdp_org_profile',
      unique: true,
      fields: ['organization_id'],
    },
  ],
});

module.exports = DpdpOrganizationProfile;
