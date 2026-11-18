'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
module.exports = sequelize.define('DpdpRequestEvent', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  requestId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'request_id' },
  eventType: { type: DataTypes.STRING(40), allowNull: false, field: 'event_type' },
  fromStatus: { type: DataTypes.STRING(32), allowNull: true, field: 'from_status' },
  toStatus: { type: DataTypes.STRING(32), allowNull: true, field: 'to_status' },
  actorUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'actor_user_id' },
  summary: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'dpdp_request_event', updatedAt: false, indexes: [{ name: 'idx_dpdp_req_event_case', fields: ['organization_id', 'request_id', 'id'] }] });
