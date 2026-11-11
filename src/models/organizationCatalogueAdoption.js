'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
module.exports = sequelize.define('OrganizationCatalogueAdoption', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  catalogueId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'catalogue_id' },
  effectiveDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'effective_date' },
  status: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'), allowNull: false, defaultValue: 'PENDING' },
  preparedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'prepared_by' },
  decidedBy: { type: DataTypes.INTEGER.UNSIGNED, field: 'decided_by' },
  decidedAt: { type: DataTypes.DATE, field: 'decided_at' },
  decisionReason: { type: DataTypes.STRING(500), field: 'decision_reason' },
}, { tableName: 'organization_catalogue_adoption', indexes: [{ fields: ['organization_id', 'status', 'effective_date'] }] });
