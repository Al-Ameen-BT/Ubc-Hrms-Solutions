'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const PostCadre = sequelize.define('PostCadre', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  code: { type: DataTypes.STRING(32), allowNull: false },
  name: { type: DataTypes.STRING(128), allowNull: false },
  cadre: { type: DataTypes.STRING(64) },
  cadreLevel: { type: DataTypes.INTEGER, field: 'cadre_level' },
  parentPostId: { type: DataTypes.INTEGER.UNSIGNED, field: 'parent_post_id' },
  defaultPayScaleId: { type: DataTypes.INTEGER.UNSIGNED, field: 'default_pay_scale_id' },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
}, {
  tableName: 'post_cadre',
  indexes: [{ unique: true, fields: ['organization_id', 'code'] }],
});

module.exports = PostCadre;
