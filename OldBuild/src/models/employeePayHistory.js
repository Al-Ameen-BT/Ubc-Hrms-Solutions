'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const EmployeePayHistory = sequelize.define('EmployeePayHistory', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  eventType: {
    type: DataTypes.ENUM('INITIAL_FIXATION', 'INCREMENT', 'PROMOTION', 'PAY_REVISION', 'CORRECTION'),
    allowNull: false,
    field: 'event_type',
  },
  eventDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'event_date' },

  previousPayScaleId: { type: DataTypes.INTEGER.UNSIGNED, field: 'previous_pay_scale_id' },
  previousStageId: { type: DataTypes.INTEGER.UNSIGNED, field: 'previous_stage_id' },
  previousBasicPay: { type: DataTypes.DECIMAL(12, 2), field: 'previous_basic_pay' },

  newPayScaleId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'new_pay_scale_id' },
  newStageId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'new_stage_id' },
  newBasicPay: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'new_basic_pay' },

  postCadreId: { type: DataTypes.INTEGER.UNSIGNED, field: 'post_cadre_id' },
  payRevisionId: { type: DataTypes.INTEGER.UNSIGNED, field: 'pay_revision_id' },
  incrementPolicyId: { type: DataTypes.INTEGER.UNSIGNED, field: 'increment_policy_id' },
  payFixationPolicyId: { type: DataTypes.INTEGER.UNSIGNED, field: 'pay_fixation_policy_id' },
  ruleReferenceId: { type: DataTypes.INTEGER.UNSIGNED, field: 'rule_reference_id' },

  orderRef: { type: DataTypes.STRING(128), field: 'order_ref' },
  remarks: { type: DataTypes.TEXT },
  calculationTrace: { type: DataTypes.JSON, field: 'calculation_trace' },
  createdBy: { type: DataTypes.STRING(128), field: 'created_by' },
}, {
  tableName: 'employee_pay_history',
});

module.exports = EmployeePayHistory;
