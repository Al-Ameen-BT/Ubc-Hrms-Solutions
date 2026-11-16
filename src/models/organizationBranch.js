'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Authoritative unit record; legacy free-text employee labels remain readable.
 */
const OrganizationBranch = sequelize.define('OrganizationBranch', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  name: { type: DataTypes.STRING(255), allowNull: false },
  code: { type: DataTypes.STRING(32), allowNull: true },
  number: { type: DataTypes.STRING(32), allowNull: true },
  unitType: { type: DataTypes.ENUM('HEAD_OFFICE', 'BRANCH'), allowNull: true, field: 'unit_type' },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
  displayOrder: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'display_order' },
  address: { type: DataTypes.TEXT, allowNull: true },
  phone: { type: DataTypes.STRING(64), allowNull: true },
  isHeadOffice: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_head_office' },
}, {
  tableName: 'organization_branch',
  indexes: [
    { name: 'organization_branch_organization_id', fields: ['organization_id'] },
    { name: 'uq_org_branch_number', unique: true, fields: ['organization_id', 'number'] },
    { name: 'uq_org_branch_code', unique: true, fields: ['organization_id', 'code'] },
  ],
});

// sync adds indexes before migrate runs; legacy tables need the indexed column first.
OrganizationBranch.addHook('beforeSync', async () => {
  const qi = sequelize.getQueryInterface();
  if (await qi.tableExists('organization_branch')) {
    const columns = await qi.describeTable('organization_branch');
    if (!columns.number) await qi.addColumn('organization_branch', 'number', OrganizationBranch.rawAttributes.number);
  }
});

module.exports = OrganizationBranch;
