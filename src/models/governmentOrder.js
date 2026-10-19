'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const GovernmentOrder = sequelize.define('GovernmentOrder', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  goNumber: { type: DataTypes.STRING(64), allowNull: false, field: 'go_number' },
  goDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'go_date' },
  issuingAuthority: { type: DataTypes.STRING(128), field: 'issuing_authority' },
  subject: { type: DataTypes.STRING(255) },
  documentUrl: { type: DataTypes.STRING(500), field: 'document_url' },
  description: { type: DataTypes.TEXT },
  status: { type: DataTypes.ENUM('ACTIVE', 'SUPERSEDED', 'DRAFT'), allowNull: false, defaultValue: 'DRAFT' },
}, {
  tableName: 'government_orders',
  indexes: [{ unique: true, fields: ['organization_id', 'go_number'] }],
});

module.exports = GovernmentOrder;
