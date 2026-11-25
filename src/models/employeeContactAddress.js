'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const EmployeeContactAddress = sequelize.define('EmployeeContactAddress', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'employee_id' },
  addressType: { type: DataTypes.ENUM('RESIDENTIAL', 'PERMANENT', 'CORRESPONDENCE'), allowNull: false, field: 'address_type' },
  address1: { type: DataTypes.STRING(255), allowNull: true },
  address2: { type: DataTypes.STRING(255), allowNull: true },
  address3: { type: DataTypes.STRING(255), allowNull: true },
  landmark: { type: DataTypes.STRING(255), allowNull: true },
  area: { type: DataTypes.STRING(128), allowNull: true },
  city: { type: DataTypes.STRING(128), allowNull: true },
  taluka: { type: DataTypes.STRING(128), allowNull: true },
  state: { type: DataTypes.STRING(128), allowNull: true },
  email: { type: DataTypes.STRING(255), allowNull: true },
  website: { type: DataTypes.STRING(500), allowNull: true },
  faxNumber: { type: DataTypes.STRING(40), allowNull: true, field: 'fax_number' },
  contactNumber: { type: DataTypes.STRING(40), allowNull: true, field: 'contact_number' },
}, {
  tableName: 'employee_contact_address',
  indexes: [{ unique: true, fields: ['employee_id', 'address_type'], name: 'uq_emp_contact_address_type' }],
});

module.exports = EmployeeContactAddress;
