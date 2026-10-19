'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Statutory documents an Org Admin has uploaded on the Organisation
 * Profile page (task 79) — RBI licence, incorporation/registration
 * certificate, PAN, GSTN, TAN, or anything else (OTHER, with its own
 * free-text label). Several rows may share a docType (e.g. a bank may
 * re-upload a renewed RBI licence without losing the old one), so this is
 * NOT unique per (organizationId, docType) — the API lists all of them,
 * newest first. Stored as bytes in the DB, same reasoning as
 * models/brandAsset.js / models/governmentOrderDocument.js.
 */
const OrganizationDocument = sequelize.define('OrganizationDocument', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  docType: {
    type: DataTypes.ENUM('RBI_LICENSE', 'INCORPORATION_CERTIFICATE', 'PAN', 'GSTN', 'TAN', 'OTHER'),
    allowNull: false,
    field: 'doc_type',
  },
  label: { type: DataTypes.STRING(128), allowNull: true }, // free-text designation, mainly for OTHER
  fileName: { type: DataTypes.STRING(255), allowNull: true, field: 'file_name' },
  mimeType: { type: DataTypes.STRING(64), allowNull: false, field: 'mime_type' },
  data: { type: DataTypes.BLOB('long'), allowNull: false },
  sizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'size_bytes' },
  sha256: { type: DataTypes.STRING(64), allowNull: false },
  uploadedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'uploaded_by' },
}, {
  tableName: 'organization_document',
  indexes: [{ fields: ['organization_id'] }],
});

module.exports = OrganizationDocument;
