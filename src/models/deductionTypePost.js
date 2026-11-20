'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Join table: which Post Cadres a DeductionType applies to.
 * A DeductionType with zero rows here applies to every post in the organisation.
 */
const DeductionTypePost = sequelize.define('DeductionTypePost', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  deductionTypeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'deduction_type_id' },
  postCadreId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'post_cadre_id' },
}, {
  tableName: 'deduction_type_post',
  indexes: [{ unique: true, fields: ['deduction_type_id', 'post_cadre_id'] }],
});

module.exports = DeductionTypePost;
