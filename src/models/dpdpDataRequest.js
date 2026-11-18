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
    allowNull: true,
    field: 'employee_id',
  },
  caseId: { type: DataTypes.STRING(64), allowNull: true, unique: true, field: 'case_id' },
  principalType: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'EMPLOYEE', field: 'principal_type' },
  principalReference: { type: DataTypes.STRING(128), allowNull: true, field: 'principal_reference' },
  principalName: { type: DataTypes.STRING(255), allowNull: true, field: 'principal_name' },
  principalContact: { type: DataTypes.STRING(255), allowNull: true, field: 'principal_contact' },
  ownerUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'owner_user_id' },
  identityVerifiedAt: { type: DataTypes.DATE, allowNull: true, field: 'identity_verified_at' },
  identityVerifiedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'identity_verified_by' },
  identityVerificationMethod: { type: DataTypes.STRING(128), allowNull: true, field: 'identity_verification_method' },
  dueAt: { type: DataTypes.DATE, allowNull: true, field: 'due_at' },
  closedAt: { type: DataTypes.DATE, allowNull: true, field: 'closed_at' },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    field: 'user_id',
  },
  requestType: {
    type: DataTypes.ENUM('ACCESS', 'DOWNLOAD', 'SHARING', 'CORRECTION', 'ERASURE', 'CONSENT_WITHDRAWAL', 'GRIEVANCE', 'NOMINATION'),
    allowNull: false,
    field: 'request_type',
  },
  status: {
    type: DataTypes.ENUM('SUBMITTED', 'IDENTITY_VERIFICATION', 'IN_REVIEW', 'ACTION_REQUIRED', 'COMPLETED', 'REJECTED'),
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
