'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const PayStage = sequelize.define('PayStage', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  payScaleId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'pay_scale_id' },
  stageNo: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'stage_no' },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
}, {
  tableName: 'pay_stage',
  indexes: [{ unique: true, fields: ['pay_scale_id', 'stage_no'] }],
});

module.exports = PayStage;
