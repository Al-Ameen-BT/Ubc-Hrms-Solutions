'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const DpdpIncident = sequelize.define('DpdpIncident', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'organization_id',
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('OPEN', 'CONTAINED', 'NOTIFIED', 'CLOSED'),
    allowNull: false,
    defaultValue: 'OPEN',
  },
  severity: {
    type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
    allowNull: false,
    defaultValue: 'MEDIUM',
  },
  affectedCategories: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'affected_categories',
  },
  affectedCount: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    defaultValue: 0,
    field: 'affected_count',
  },
  discoveredAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'discovered_at',
  },
  awareAt: { type: DataTypes.DATE, allowNull: true, field: 'aware_at' },
  boardDetailedDueAt: { type: DataTypes.DATE, allowNull: true, field: 'board_detailed_due_at' },
  rootCause: { type: DataTypes.TEXT, allowNull: true, field: 'root_cause' },
  correctiveActions: { type: DataTypes.TEXT, allowNull: true, field: 'corrective_actions' },
  affectedPrincipalNotificationStatus: { type: DataTypes.STRING(32), allowNull: true, field: 'affected_principal_notification_status' },
  boardNotificationStatus: { type: DataTypes.STRING(32), allowNull: true, field: 'board_notification_status' },
  containedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'contained_at',
  },
  notifiedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'notified_at',
  },
  closedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'closed_at',
  },
  summary: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  containmentActions: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'containment_actions',
  },
  reportedBy: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    field: 'reported_by',
  },
  closedBy: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    field: 'closed_by',
  },
}, {
  tableName: 'dpdp_incident',
  indexes: [
    {
      name: 'idx_dpdp_inc_org_status',
      fields: ['organization_id', 'status', 'discovered_at'],
    },
  ],
});

module.exports = DpdpIncident;
