'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DpdpRetentionRule = sequelize.define('DpdpRetentionRule', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    organizationId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    periodMonths: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 36,
    },
    legalHold: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: 'dpdp_retention_rules',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['organization_id', 'category'],
      },
    ],
  });

  return DpdpRetentionRule;
};
