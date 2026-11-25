'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

module.exports = sequelize.define('BootstrapAdminHandover', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  bootstrapUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'bootstrap_user_id' },
  successorUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'successor_user_id' },
  status: { type: DataTypes.ENUM('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED'), allowNull: false, defaultValue: 'PENDING' },
  expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
  acceptedAt: { type: DataTypes.DATE, allowNull: true, field: 'accepted_at' },
}, {
  tableName: 'bootstrap_admin_handover',
  indexes: [
    { name: 'idx_bootstrap_handover_org_status', fields: ['organization_id', 'status'] },
    { name: 'idx_bootstrap_handover_successor', fields: ['successor_user_id', 'status'] },
  ],
});
