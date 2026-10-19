'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * A scanned document attached to one Service Book entry (e.g. the transfer
 * order, the disciplinary order copy) — at most one per
 * EmployeeServiceHistory row (uploading again replaces it; see
 * services/attachments.js). Stored as bytes in the DB, same reasoning as
 * models/employeeDocument.js.
 */
const ServiceHistoryDocument = sequelize.define('ServiceHistoryDocument', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  serviceHistoryId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true, field: 'service_history_id' },
  label: { type: DataTypes.STRING(255) },
  mimeType: { type: DataTypes.STRING(64), allowNull: false, field: 'mime_type' },
  data: { type: DataTypes.BLOB('long'), allowNull: false },
  sizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'size_bytes' },
  sha256: { type: DataTypes.STRING(64), allowNull: false },
  uploadedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'uploaded_by' },
}, {
  tableName: 'service_history_document',
});

module.exports = ServiceHistoryDocument;
