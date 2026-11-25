'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const EmployeeOfficeInformation = sequelize.define('EmployeeOfficeInformation', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true, field: 'employee_id' },
  pensionNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'pension_number' },
  ptNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'pt_number' },
  esicNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'esic_number' },
  lwfNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'lwf_number' },
  edliNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'edli_number' },
  vcNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'vc_number' },
  ppNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'pp_number' },
  dlNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'dl_number' },
  rcNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'rc_number' },
  giNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'gi_number' },
  payMode: { type: DataTypes.STRING(32), allowNull: true, field: 'pay_mode' },
  salaryBankName: { type: DataTypes.STRING(255), allowNull: true, field: 'salary_bank_name' },
  cbsBranchCode: { type: DataTypes.STRING(64), allowNull: true, field: 'cbs_branch_code' },
  cbsAccountType: { type: DataTypes.STRING(64), allowNull: true, field: 'cbs_account_type' },
  salaryAccountNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'salary_account_number' },
  pfApplicationNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'pf_application_number' },
  ptApplicationNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'pt_application_number' },
  esicApplicationNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'esic_application_number' },
  lwfApplicationNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'lwf_application_number' },
  vpfApplicationNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'vpf_application_number' },
  selfHandicap: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'self_handicap' },
  familyHandicap: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'family_handicap' },
  handicapRemark: { type: DataTypes.STRING(500), allowNull: true, field: 'handicap_remark' },
  vpfDeclaredAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'vpf_declared_amount' },
  vpfDeclaredPercent: { type: DataTypes.DECIMAL(7, 4), allowNull: true, field: 'vpf_declared_percent' },
}, { tableName: 'employee_office_information' });

module.exports = EmployeeOfficeInformation;
