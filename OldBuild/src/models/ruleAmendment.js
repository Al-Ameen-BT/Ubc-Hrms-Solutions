'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const RuleAmendment = sequelize.define('RuleAmendment', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  ruleReferenceId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'rule_reference_id' },
  governmentOrderId: { type: DataTypes.INTEGER.UNSIGNED, field: 'government_order_id' },
  amendmentDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'amendment_date' },
  description: { type: DataTypes.TEXT },
}, {
  tableName: 'rule_amendments',
  updatedAt: false,
});

module.exports = RuleAmendment;
