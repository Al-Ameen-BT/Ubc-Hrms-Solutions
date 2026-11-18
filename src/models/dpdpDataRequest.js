'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const DpdpDataRequest = sequelize.define('DpdpDataRequest', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'organization_id',
  },
  employeeId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'employee_id',
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    field: 'user_id',
  },
  requestType: {
    type: DataTypes.ENUM('ACCESS', 'CORRECTION', 'ERASURE', 'GRIEVANCE', 'NOMINATION'),
    allowNull: false,
    field: 'request_type',
  },
  status: {
    type: DataTypes.ENUM('SUBMITTED', 'IN_REVIEW', 'COMPLETED', 'REJECTED'),
    allowNull: false,
    defaultValue: 'SUBMITTED',
  },
  details: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  dpoResponse: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'dpo_response',
  },
  decisionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'decision_reason',
  },
  retentionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'retention_reason',
  },
  decidedBy: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    field: 'decided_by',
  },
  decidedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'decided_at',
  },
}, {
  tableName: 'dpdp_data_request',
  indexes: [
    {
      name: 'idx_dpdp_req_org_status',
      fields: ['organization_id', 'status', 'request_type'],
    },
    {
      name: 'idx_dpdp_req_emp',
      fields: ['organization_id', 'employee_id'],
    },
  ],
});

module.exports = DpdpDataRequest;
