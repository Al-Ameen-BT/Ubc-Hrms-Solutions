'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * Bank-defined Overdraft Slabs (tiers).
 * Strictly defines employee overdraft eligibility, multipliers, maximum limits,
 * and maximum tenure based on Basic + DA salary brackets.
 */
const OverdraftSlab = sequelize.define('OverdraftSlab', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  slabName: { type: DataTypes.STRING(128), allowNull: false, field: 'slab_name' },
  fromSalary: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0, field: 'from_salary' },
  toSalary: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'to_salary' }, // NULL means unbounded above
  multiplier: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 15, field: 'multiplier' },
  maxLimit: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'max_limit' },
  minLimit: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'min_limit' },
  maxTenureMonths: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 84, field: 'max_tenure_months' },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
  remarks: { type: DataTypes.STRING(500), allowNull: true },
}, {
  tableName: 'overdraft_slab',
});

module.exports = OverdraftSlab;
