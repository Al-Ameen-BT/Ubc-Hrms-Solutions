'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * One row per document uploaded for an employee (PAN card, Aadhar, an
 * educational certificate, a photo, or anything else under OTHER — an
 * employee may have several documents, including several OTHER ones).
 * Stored as bytes in the DB (see services/documents.js and
 * models/brandAsset.js for why: disk files don't survive managed deploy
 * pipelines, the DB does), never on disk.
 */
const EmployeeDocument = sequelize.define('EmployeeDocument', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  docType: {
    type: DataTypes.ENUM('PAN', 'AADHAR', 'EDUCATION_CERTIFICATE', 'PHOTO', 'OTHER'),
    allowNull: false,
    field: 'doc_type',
  },
  label: { type: DataTypes.STRING(255) }, // free-text name, mainly useful for OTHER
  mimeType: { type: DataTypes.STRING(64), allowNull: false, field: 'mime_type' },
  data: { type: DataTypes.BLOB('long'), allowNull: false },
  sizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'size_bytes' },
  sha256: { type: DataTypes.STRING(64), allowNull: false },
  uploadedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'uploaded_by' },
}, {
  tableName: 'employee_document',
});

module.exports = EmployeeDocument;
