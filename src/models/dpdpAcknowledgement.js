'use strict';

const { DataTypes, Op } = require('sequelize');
const sequelize = require('../config/sequelize');

const DpdpAcknowledgement = sequelize.define('DpdpAcknowledgement', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  documentId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'document_id',
  },
  organizationId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    field: 'organization_id',
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    field: 'user_id',
  },
  employeeId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    field: 'employee_id',
  },
  channel: {
    type: DataTypes.ENUM('WEB', 'MOBILE'),
    allowNull: false,
    defaultValue: 'WEB',
  },
  deviceLinkId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    field: 'device_link_id',
  },
  acknowledgedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'acknowledged_at',
  },
}, {
  tableName: 'dpdp_acknowledgement',
  indexes: [
    {
      name: 'uq_dpdp_ack_doc_user_chan_dev',
      unique: true,
      fields: ['document_id', 'user_id', 'channel', 'device_link_id'],
    },
    {
      name: 'idx_dpdp_ack_lookup',
      fields: ['organization_id', 'user_id', 'document_id'],
    },
  ],
  hooks: {
    beforeValidate: async (ack) => {
      const where = {
        documentId: ack.documentId,
        userId: ack.userId ?? null,
        channel: ack.channel,
        deviceLinkId: ack.deviceLinkId ?? null,
      };
      if (ack.id) {
        where.id = { [Op.ne]: ack.id };
      }
      const existing = await DpdpAcknowledgement.findOne({ where });
      if (existing) {
        throw new Error('This document has already been acknowledged for this user, channel, and device session.');
      }
    },
  },
});

module.exports = DpdpAcknowledgement;
