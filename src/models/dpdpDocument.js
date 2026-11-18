'use strict';

const { DataTypes, Op } = require('sequelize');
const sequelize = require('../config/sequelize');

const DpdpDocument = sequelize.define('DpdpDocument', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  ownerType: {
    type: DataTypes.ENUM('PLATFORM', 'ORGANIZATION'),
    allowNull: false,
    defaultValue: 'ORGANIZATION',
    field: 'owner_type',
  },
  organizationId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    field: 'organization_id',
  },
  type: {
    type: DataTypes.ENUM('TERMS', 'PLATFORM_PRIVACY', 'EMPLOYEE_NOTICE'),
    allowNull: false,
  },
  version: {
    type: DataTypes.STRING(32),
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  body: {
    type: DataTypes.TEXT('medium'),
    allowNull: false,
  },
  summary: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  state: {
    type: DataTypes.ENUM('DRAFT', 'PUBLISHED', 'SUPERSEDED'),
    allowNull: false,
    defaultValue: 'DRAFT',
  },
  effectiveAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'effective_at',
  },
  publishedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'published_at',
  },
  supersededAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'superseded_at',
  },
  publishedBy: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    field: 'published_by',
  },
}, {
  tableName: 'dpdp_document',
  indexes: [
    {
      name: 'uq_dpdp_doc_owner_org_type_ver',
      unique: true,
      fields: ['owner_type', 'organization_id', 'type', 'version'],
    },
    {
      name: 'idx_dpdp_doc_lookup',
      fields: ['owner_type', 'organization_id', 'type', 'state'],
    },
  ],
  hooks: {
    beforeValidate: async (doc) => {
      const where = {
        ownerType: doc.ownerType,
        organizationId: doc.organizationId ?? null,
        type: doc.type,
        version: doc.version,
      };
      if (doc.id) {
        where.id = { [Op.ne]: doc.id };
      }
      const existing = await DpdpDocument.findOne({ where });
      if (existing) {
        throw new Error(`A document with version "${doc.version}" already exists for this owner and type.`);
      }
    },
  },
});

module.exports = DpdpDocument;
