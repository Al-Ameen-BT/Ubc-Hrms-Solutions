'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Join table: which Post Cadres an AllowanceType applies to. An
 * AllowanceType with zero rows here applies to every post in the
 * organisation (see services/allowances.js applicableAllowancesFor()).
 */
const AllowanceTypePost = sequelize.define('AllowanceTypePost', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  allowanceTypeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'allowance_type_id' },
  postCadreId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'post_cadre_id' },
}, {
  tableName: 'allowance_type_post',
  indexes: [{ unique: true, fields: ['allowance_type_id', 'post_cadre_id'] }],
});

module.exports = AllowanceTypePost;
