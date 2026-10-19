'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const PayRevision = sequelize.define('PayRevision', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  name: { type: DataTypes.STRING(128), allowNull: false },
  effectiveDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'effective_date' },
  ruleReferenceId: { type: DataTypes.INTEGER.UNSIGNED, field: 'rule_reference_id' },
  description: { type: DataTypes.TEXT },
  status: { type: DataTypes.ENUM('DRAFT', 'ACTIVE', 'SUPERSEDED'), allowNull: false, defaultValue: 'DRAFT' },
}, {
  tableName: 'pay_revision',
});

module.exports = PayRevision;
