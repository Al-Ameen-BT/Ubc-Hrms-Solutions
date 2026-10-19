'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Chairman / Vice Chairman / board members / MD / GM / AGM — shown on the
 * Organisation Profile page. Photo is stored inline (small headshots only,
 * same size cap and sniffed-type validation as a logo — see
 * services/brandAssets.js, reused here) rather than a separate asset table,
 * since a photo belongs to exactly one board member row and is never
 * shared or versioned the way a logo is.
 */
const OrganizationBoardMember = sequelize.define('OrganizationBoardMember', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  name: { type: DataTypes.STRING(255), allowNull: false },
  role: {
    type: DataTypes.ENUM('CHAIRMAN', 'VICE_CHAIRMAN', 'MEMBER', 'MANAGING_DIRECTOR', 'GENERAL_MANAGER', 'ASSISTANT_GENERAL_MANAGER', 'OTHER'),
    allowNull: false,
    defaultValue: 'MEMBER',
  },
  roleOther: { type: DataTypes.STRING(128), allowNull: true, field: 'role_other' }, // free-text designation when role = OTHER
  displayOrder: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'display_order' },
  photoMimeType: { type: DataTypes.STRING(64), allowNull: true, field: 'photo_mime_type' },
  photoData: { type: DataTypes.BLOB('medium'), allowNull: true, field: 'photo_data' },
  photoSizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'photo_size_bytes' },
}, {
  tableName: 'organization_board_member',
  indexes: [{ fields: ['organization_id'] }],
});

module.exports = OrganizationBoardMember;
