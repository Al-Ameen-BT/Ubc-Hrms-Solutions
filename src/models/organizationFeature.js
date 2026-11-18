'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const OrganizationFeature = sequelize.define('OrganizationFeature', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  organizationId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'organization_id',
  },
  featureCode: {
    type: DataTypes.STRING(64),
    allowNull: false,
    field: 'feature_code',
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  enabledAt: {
    type: DataTypes.DATE,
    field: 'enabled_at',
  },
  disabledAt: {
    type: DataTypes.DATE,
    field: 'disabled_at',
  },
  updatedByUserId: {
    type: DataTypes.INTEGER.UNSIGNED,
    field: 'updated_by_user_id',
  },
  notes: {
    type: DataTypes.STRING(500),
  },
}, {
  tableName: 'organization_feature',
  indexes: [
    {
      unique: true,
      fields: ['organization_id', 'feature_code'],
      name: 'idx_org_feature_code_unique',
    },
  ],
});

module.exports = OrganizationFeature;
