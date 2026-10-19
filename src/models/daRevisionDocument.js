'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * The scanned government order backing a DA Revision — at most one per
 * DaRevision (uploading again replaces it), same shape and reasoning as
 * models/governmentOrderDocument.js, sharing its storage service
 * (services/attachments.js).
 */
const DaRevisionDocument = sequelize.define('DaRevisionDocument', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  daRevisionId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true, field: 'da_revision_id' },
  label: { type: DataTypes.STRING(255) },
  mimeType: { type: DataTypes.STRING(64), allowNull: false, field: 'mime_type' },
  data: { type: DataTypes.BLOB('long'), allowNull: false },
  sizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'size_bytes' },
  sha256: { type: DataTypes.STRING(64), allowNull: false },
  uploadedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'uploaded_by' },
}, {
  tableName: 'da_revision_document',
});

module.exports = DaRevisionDocument;
