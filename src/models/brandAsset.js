'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Uploaded logos, stored in the database rather than on disk on purpose:
 * Managed deploy pipelines may rebuild the app directory on every deploy,
 * so files written next to the code would silently disappear. The DB
 * survives deploys and moves with it to the production server.
 *
 * organizationId NULL = platform (Banihal) asset: kind LOGO or FAVICON.
 * organizationId set   = that bank's LOGO.
 * At most one row per (organizationId, kind) — enforced in
 * services/brandAssets.js (a unique index can't do it in MySQL because
 * NULLs don't collide).
 *
 * Note: The DB always survives deploys regardless of the deployment target.
 */
const BrandAsset = sequelize.define('BrandAsset', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'organization_id' },
  kind: { type: DataTypes.ENUM('LOGO', 'FAVICON'), allowNull: false },
  mimeType: { type: DataTypes.STRING(64), allowNull: false, field: 'mime_type' },
  data: { type: DataTypes.BLOB('medium'), allowNull: false },
  sizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'size_bytes' },
  sha256: { type: DataTypes.STRING(64), allowNull: false },
  uploadedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'uploaded_by' },
}, {
  tableName: 'brand_asset',
  indexes: [{ fields: ['organization_id', 'kind'] }],
});

module.exports = BrandAsset;
