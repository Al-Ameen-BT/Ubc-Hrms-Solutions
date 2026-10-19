'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * DA Revision Master — the Government/Co-operation Department order that
 * revises Dearness Allowance, often issued well after its own effective
 * date (see services/arrears.js for why that gap matters). One row per
 * order; `revisedDaPercent` is always previousDaPercent + increasePercent,
 * computed server-side (services/daRevisions.js), never trusted from the
 * client.
 *
 * Eligibility filters (applicableEmployeeCategory / applicableServiceCategory
 * / applicablePayRevisionId) reuse the employee fields that already exist
 * in this codebase rather than inventing new taxonomy — see
 * services/arrears.js#eligibleEmployees. 'ALL' (the default for each) means
 * no filtering on that dimension.
 */
const DaRevision = sequelize.define('DaRevision', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },

  orderNumber: { type: DataTypes.STRING(128), allowNull: false, field: 'order_number' },
  orderDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'order_date' },
  effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false, field: 'effective_from' },
  effectiveTo: { type: DataTypes.DATEONLY, allowNull: true, field: 'effective_to' }, // null = open-ended (still applicable up to the month arrears are calculated)

  previousDaPercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, field: 'previous_da_percent' },
  increasePercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, field: 'increase_percent' },
  revisedDaPercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, field: 'revised_da_percent' }, // = previousDaPercent + increasePercent, set by services/daRevisions.js

  applicableEmployeeCategory: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'ALL', field: 'applicable_employee_category' }, // free-text match against employee.category, or 'ALL'
  applicableServiceCategory: {
    type: DataTypes.ENUM('ALL', 'REGULAR', 'PART_TIME_CONTINGENT'),
    allowNull: false,
    defaultValue: 'ALL',
    field: 'applicable_service_category',
  }, // matches employee.employmentType
  applicablePayRevisionId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'applicable_pay_revision_id' }, // null = every pay revision

  remarks: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.ENUM('DRAFT', 'APPROVED', 'ACTIVE', 'CLOSED'), allowNull: false, defaultValue: 'DRAFT' },
}, {
  tableName: 'da_revision',
});

module.exports = DaRevision;
