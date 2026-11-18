'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
module.exports = sequelize.define('DpdpNomination', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'user_id' },
  nomineeName: { type: DataTypes.STRING(255), allowNull: false, field: 'nominee_name' },
  relationship: { type: DataTypes.STRING(80), allowNull: false },
  contact: { type: DataTypes.STRING(255), allowNull: false },
  verificationStatus: { type: DataTypes.ENUM('PENDING', 'VERIFIED', 'REJECTED'), allowNull: false, defaultValue: 'PENDING', field: 'verification_status' },
  verifiedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'verified_by' },
  verifiedAt: { type: DataTypes.DATE, allowNull: true, field: 'verified_at' },
  effectiveAt: { type: DataTypes.DATE, allowNull: true, field: 'effective_at' },
  withdrawnAt: { type: DataTypes.DATE, allowNull: true, field: 'withdrawn_at' },
}, { tableName: 'dpdp_nomination', indexes: [{ name: 'idx_dpdp_nom_org_emp', fields: ['organization_id', 'employee_id', 'withdrawn_at'] }] });
