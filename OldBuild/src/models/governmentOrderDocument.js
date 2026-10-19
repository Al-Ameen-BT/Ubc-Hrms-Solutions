'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * The scanned copy of a Government Order — at most one per GovernmentOrder
 * row (uploading again replaces it; see services/attachments.js). Stored as
 * bytes in the DB, same reasoning as models/brandAsset.js and
 * models/employeeDocument.js. The GO's own `documentUrl` field remains for
 * a link to an external copy; this is for an uploaded scan instead of (or
 * alongside) that link.
 */
const GovernmentOrderDocument = sequelize.define('GovernmentOrderDocument', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  governmentOrderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true, field: 'government_order_id' },
  label: { type: DataTypes.STRING(255) },
  mimeType: { type: DataTypes.STRING(64), allowNull: false, field: 'mime_type' },
  data: { type: DataTypes.BLOB('long'), allowNull: false },
  sizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'size_bytes' },
  sha256: { type: DataTypes.STRING(64), allowNull: false },
  uploadedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'uploaded_by' },
}, {
  tableName: 'government_order_document',
});

module.exports = GovernmentOrderDocument;
