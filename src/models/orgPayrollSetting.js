'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

/**
 * One row per organisation — the configurable rates/limits behind the
 * salary components on the Employee form (DA%, HRA%, PF%, GSLI, OD limits,
 * Professional Tax schedule, stagnation-increment rule). Never hard-coded:
 * every bank can set its own values, and a KSR rate revision is a settings
 * change, not a code change. Created lazily with defaults on first read —
 * see services/payrollSettings.js.
 */
const OrgPayrollSetting = sequelize.define('OrgPayrollSetting', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true, field: 'organization_id' },

  // Earnings
  daPercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 1.2, field: 'da_percent' },
  hraType: { type: DataTypes.ENUM('PERCENT', 'FIXED'), allowNull: false, defaultValue: 'PERCENT', field: 'hra_type' },
  hraPercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 10, field: 'hra_percent' },
  hraFixedAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'hra_fixed_amount' },
  hraMaxAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'hra_max_amount' },

  // Provident Fund — contribution base is configurable: some banks compute
  // PF (and VPF) on Basic alone, others on Basic+DA (the more common
  // statutory convention). Defaults to BASIC, matching how this product has
  // always computed it, so existing organisations see no change unless they
  // switch it.
  pfEmployeePercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 12, field: 'pf_employee_percent' },
  pfEmployerPercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 12, field: 'pf_employer_percent' },
  pfCalculationBase: { type: DataTypes.ENUM('BASIC', 'BASIC_PLUS_DA'), allowNull: false, defaultValue: 'BASIC', field: 'pf_calculation_base' },

  // Group Savings Linked Insurance — only employees who joined before the
  // cutoff date are eligible; the amount is a flat fee the bank can change.
  gsliAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 20, field: 'gsli_amount' },
  gsliCutoffDate: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: '2014-09-01', field: 'gsli_cutoff_date' },

  // Professional Tax — schedule only; the amount itself is entered per
  // employee (no statutory slab table is built in — see Employee.ptAmount).
  ptSchedule: { type: DataTypes.ENUM('MONTHLY', 'HALF_YEARLY'), allowNull: false, defaultValue: 'HALF_YEARLY', field: 'pt_schedule' },
  ptMonth1: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 8, field: 'pt_month1' }, // August
  ptMonth2: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 2, field: 'pt_month2' }, // February

  // Employee Overdraft: limit = min(odMultiplier x (Basic+DA), odMaxAmount).
  // odInterestRatePercent is the rate applied to a NEW Overdraft — changing
  // it here only affects Overdrafts availed after the change; each existing
  // Overdraft keeps whatever rate was current on the day it was availed
  // (snapshotted onto the record itself — see models/employeeOverdraft.js).
  odMultiplier: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 15, field: 'od_multiplier' },
  odMaxAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 400000, field: 'od_max_amount' },
  odMaxRepayMonths: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 84, field: 'od_max_repay_months' },
  odInterestRatePercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 6.5, field: 'od_interest_rate_percent' },

  // Festival Advance: up to 1 month (Basic+DA), repaid within this many months
  festivalAdvanceRepayMonths: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 10, field: 'festival_advance_repay_months' },

  // Stagnation increment: an employee with no promotion for this many years
  // gets this many extra stages on their current pay scale (see
  // services/payslip.js / the Service Book "higher grade" event).
  stagnationYears: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 8, field: 'stagnation_years' },
  stagnationExtraStages: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 2, field: 'stagnation_extra_stages' },

  // Medical Allowance: a flat once-a-year amount, paid entirely in one month.
  medicalAllowanceAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 4000, field: 'medical_allowance_amount' },
  medicalAllowanceMonth: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 12, field: 'medical_allowance_month' }, // December

  // Bonus: once a year (default April), formula depends on the bank's
  // declared financial result for the year — set here by the Org Admin
  // before that month's payroll. NULL = not yet declared (no bonus paid).
  bonusMonth: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 4, field: 'bonus_month' }, // April
  bonusResult: { type: DataTypes.ENUM('PROFIT', 'LOSS'), allowNull: true, field: 'bonus_result' },
  bonusProfitPercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 20, field: 'bonus_profit_percent' }, // bonus = min(cap, Basic + this% of Basic)
  bonusProfitMaxAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 16800, field: 'bonus_profit_max_amount' },
  bonusLossPercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 8.33, field: 'bonus_loss_percent' },
  bonusLossMaxAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 7000, field: 'bonus_loss_max_amount' },

  // City Compensatory Allowance / Conveyance Allowance — both optional, off
  // by default (amount 0). An employee is paid the org default unless they
  // have their own ccaOptIn/ccaAmount override (see Employee model).
  ccaAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0, field: 'cca_amount' },
  conveyanceAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0, field: 'conveyance_amount' },

  // Vehicle Loan: off by default, matching how the product has worked so
  // far (one at a time). An org admin can turn this on once the bank wants
  // to allow employees more than one simultaneous Vehicle Loan.
  vehicleLoanAllowMultiple: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'vehicle_loan_allow_multiple' },
  vehicleLoanInterestRatePercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 9, field: 'vehicle_loan_interest_rate_percent' },

  // Standard retirement age (years from DOB) — used to auto-calculate every
  // employee's Date of Retirement (services/loans.js retirementDate()) when
  // Employee.dateOfRetirement isn't explicitly set/overridden for that
  // person. Kerala UCBs vary on this, so it's per-organisation, not a
  // platform-wide constant.
  retirementAge: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 58, field: 'retirement_age' },

  // Year-End Process: which 12-month window this organisation treats as
  // its "year" for year-end closing/reporting — CALENDAR (1 Jan-31 Dec) or
  // FINANCIAL (1 Apr-31 Mar, the common Indian financial year). See
  // services/yearEnd.js yearBounds()/yearLabelFor().
  yearType: { type: DataTypes.ENUM('CALENDAR', 'FINANCIAL'), allowNull: false, defaultValue: 'CALENDAR', field: 'year_type' },
}, {
  tableName: 'org_payroll_setting',
});

module.exports = OrgPayrollSetting;
