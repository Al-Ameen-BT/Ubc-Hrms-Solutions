'use strict';

/**
 * Idempotent additive migrations — for columns added to a model AFTER a
 * table already exists in a deployed database. `sequelize.sync()` (used by
 * db:init and /admin/setup/init-db) only creates missing TABLES; it never
 * alters an existing one, so a new column on an existing model needs to be
 * added explicitly. Each step here checks whether the column already
 * exists before adding it, so this is safe to run on every deploy — new
 * environments (nothing to add, table doesn't exist yet) and already-
 * migrated ones (columns already present) both no-op cleanly.
 *
 * Exported as a function so it can run both as a standalone script
 * (`node src/scripts/migrate.js`) and from within the token-gated
 * /admin/setup/init-db endpoint for deployments with no shell access.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../models');

async function addColumnIfMissing(queryInterface, table, column, spec) {
  const desc = await queryInterface.describeTable(table);
  if (desc[column]) return false;
  await queryInterface.addColumn(table, column, spec);
  return true;
}

/**
 * Column additions, in order. Run one at a time (not Promise.all): parallel
 * ALTER TABLEs against the same table can deadlock on MySQL and fail
 * outright on SQLite.
 */
const COLUMN_STEPS = [
  // Slice: MFA
  ['users', 'mfa_enabled', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }],
  ['users', 'mfa_secret', { type: DataTypes.STRING(255), allowNull: true }],
  ['users', 'mfa_enrolled_at', { type: DataTypes.DATE, allowNull: true }],
  // Slice: licensing, contact details
  ['organization', 'license_expires_at', { type: DataTypes.DATEONLY, allowNull: true }],
  ['organization', 'license_plan', { type: DataTypes.STRING(32), allowNull: true }],
  ['organization', 'license_starts_at', { type: DataTypes.DATEONLY, allowNull: true }],
  ['organization', 'max_users', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }],
  ['organization', 'max_employees', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }],
  ['organization', 'license_notes', { type: DataTypes.STRING(500), allowNull: true }],
  ['organization', 'contact_email', { type: DataTypes.STRING(255), allowNull: true }],
  ['organization', 'contact_phone', { type: DataTypes.STRING(64), allowNull: true }],
  ['organization', 'website', { type: DataTypes.STRING(255), allowNull: true }],
  // Slice: bank class + pay scale library, part-time contingent employment type
  ['organization', 'bank_class', { type: DataTypes.ENUM('SPECIAL_GRADE', 'CLASS_I', 'CLASS_II', 'CLASS_III', 'CLASS_IV', 'CLASS_V'), allowNull: true }],
  ['employee', 'employment_type', { type: DataTypes.ENUM('REGULAR', 'PART_TIME_CONTINGENT'), allowNull: false, defaultValue: 'REGULAR' }],
  // Slice: payroll salary structure & deductions (Phase 1). Note:
  // org_payroll_setting is a brand-new table, created automatically by
  // sequelize.sync() — no column step needed for it here.
  ['employee', 'risk_allowance', { type: DataTypes.DECIMAL(10, 2), allowNull: true }],
  ['employee', 'other_allowance', { type: DataTypes.DECIMAL(10, 2), allowNull: true }],
  ['employee', 'vpf_percent', { type: DataTypes.DECIMAL(6, 3), allowNull: true }],
  ['employee', 'welfare_fund_opt_in', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }],
  ['employee', 'welfare_fund_amount', { type: DataTypes.DECIMAL(10, 2), allowNull: true }],
  ['employee', 'gsli_opt_in', { type: DataTypes.BOOLEAN, allowNull: true }],
  ['employee', 'gsli_amount', { type: DataTypes.DECIMAL(10, 2), allowNull: true }],
  ['employee', 'pt_amount', { type: DataTypes.DECIMAL(10, 2), allowNull: true }],
  ['employee', 'tax_regime', { type: DataTypes.ENUM('NEW', 'OLD'), allowNull: false, defaultValue: 'NEW' }],
  ['employee', 'tax_other_deductions', { type: DataTypes.DECIMAL(10, 2), allowNull: true }],
  ['employee', 'last_promotion_date', { type: DataTypes.DATEONLY, allowNull: true }],
  ['employee', 'stagnation_stages_granted', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 }],
  // Slice: Medical Allowance, Bonus, Festival Advance / Overdraft / Recurring
  // Deposit. org_payroll_setting already exists as a table (from the slice
  // above), so its new columns need explicit steps; the three new
  // employee_* loan tables are brand new and created automatically by
  // sequelize.sync() — no column steps needed for them here.
  ['org_payroll_setting', 'medical_allowance_amount', { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 4000 }],
  ['org_payroll_setting', 'medical_allowance_month', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 12 }],
  ['org_payroll_setting', 'bonus_month', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 4 }],
  ['org_payroll_setting', 'bonus_result', { type: DataTypes.ENUM('PROFIT', 'LOSS'), allowNull: true }],
  ['org_payroll_setting', 'bonus_profit_percent', { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 20 }],
  ['org_payroll_setting', 'bonus_profit_max_amount', { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 16800 }],
  ['org_payroll_setting', 'bonus_loss_percent', { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 8.33 }],
  ['org_payroll_setting', 'bonus_loss_max_amount', { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 7000 }],
  // Slice: Overdraft interest rate (snapshotted per-loan), LIC, Housing
  // Loan, Vehicle Loan. employee_lic / employee_housing_loan /
  // employee_vehicle_loan are brand new tables, auto-created by
  // sequelize.sync() — no column steps needed for them here.
  ['org_payroll_setting', 'od_interest_rate_percent', { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 6.5 }],
  ['employee_overdraft', 'interest_rate_percent', { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 0 }],
  // Slice: employee personal/HR details, employee documents, DA
  // fixed/variable, City Compensatory & Conveyance Allowances, Vehicle Loan
  // interest rate + multiple-loans toggle, admin/HR-only loan edit/delete.
  // employee_document is a brand new table, auto-created by sequelize.sync().
  ['employee', 'father_name', { type: DataTypes.STRING(255), allowNull: true }],
  ['employee', 'spouse_name', { type: DataTypes.STRING(255), allowNull: true }],
  ['employee', 'gender', { type: DataTypes.ENUM('MALE', 'FEMALE', 'OTHER'), allowNull: true }],
  ['employee', 'blood_group', { type: DataTypes.STRING(8), allowNull: true }],
  ['employee', 'educational_qualification', { type: DataTypes.STRING(255), allowNull: true }],
  ['employee', 'photo_asset_id', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }],
  ['employee', 'pan_number', { type: DataTypes.STRING(16), allowNull: true }],
  ['employee', 'uan_number', { type: DataTypes.STRING(20), allowNull: true }],
  ['employee', 'pf_number', { type: DataTypes.STRING(32), allowNull: true }],
  ['employee', 'office_email', { type: DataTypes.STRING(255), allowNull: true }],
  ['employee', 'personal_email', { type: DataTypes.STRING(255), allowNull: true }],
  ['employee', 'residence_address', { type: DataTypes.TEXT, allowNull: true }],
  ['employee', 'emergency_contact_name', { type: DataTypes.STRING(255), allowNull: true }],
  ['employee', 'emergency_contact_number', { type: DataTypes.STRING(20), allowNull: true }],
  ['employee', 'emergency_contact_relation', { type: DataTypes.STRING(64), allowNull: true }],
  ['employee', 'bank_name', { type: DataTypes.STRING(255), allowNull: true }],
  ['employee', 'bank_account_number', { type: DataTypes.STRING(32), allowNull: true }],
  ['employee', 'bank_ifsc', { type: DataTypes.STRING(16), allowNull: true }],
  ['employee', 'branch_name', { type: DataTypes.STRING(255), allowNull: true }],
  ['employee', 'branch_code', { type: DataTypes.STRING(32), allowNull: true }],
  ['employee', 'designation', { type: DataTypes.STRING(255), allowNull: true }],
  ['employee', 'department', { type: DataTypes.STRING(255), allowNull: true }],
  ['employee', 'grade_details', { type: DataTypes.STRING(255), allowNull: true }],
  ['employee', 'date_of_confirmation', { type: DataTypes.DATEONLY, allowNull: true }],
  ['employee', 'date_of_retirement', { type: DataTypes.DATEONLY, allowNull: true }],
  ['employee', 'da_type', { type: DataTypes.ENUM('VARIABLE', 'FIXED'), allowNull: false, defaultValue: 'VARIABLE' }],
  ['employee', 'fixed_da_amount', { type: DataTypes.DECIMAL(10, 2), allowNull: true }],
  ['employee', 'cca_opt_in', { type: DataTypes.BOOLEAN, allowNull: true }],
  ['employee', 'cca_amount', { type: DataTypes.DECIMAL(10, 2), allowNull: true }],
  ['employee', 'conveyance_opt_in', { type: DataTypes.BOOLEAN, allowNull: true }],
  ['employee', 'conveyance_amount', { type: DataTypes.DECIMAL(10, 2), allowNull: true }],
  ['org_payroll_setting', 'cca_amount', { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 }],
  ['org_payroll_setting', 'conveyance_amount', { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 }],
  ['org_payroll_setting', 'vehicle_loan_allow_multiple', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }],
  ['org_payroll_setting', 'vehicle_loan_interest_rate_percent', { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 9 }],
  ['employee_vehicle_loan', 'interest_rate_percent', { type: DataTypes.DECIMAL(6, 3), allowNull: true }],
  // Slice: Grade Details on the payslip (PayScale's own reference figures)
  ['pay_scale', 'payable_days', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, defaultValue: 31 }],
  ['pay_scale', 'month_days', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }],
  // Slice: PF calculation base option, GO/Service Book document uploads,
  // attendance/LOP. government_order_document / service_history_document /
  // employee_attendance are brand new tables, auto-created by
  // sequelize.sync() — no column steps needed for them here.
  ['org_payroll_setting', 'pf_calculation_base', { type: DataTypes.ENUM('BASIC', 'BASIC_PLUS_DA'), allowNull: false, defaultValue: 'BASIC' }],
  // Slice: payroll engine (a real monthly processing run — see
  // payroll_run / payroll_run_line, brand-new tables, no column steps
  // needed), audit log retention, payslip email delivery.
  ['platform_settings', 'audit_retention_days', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 180 }],
  ['payroll_run_line', 'payslip_emailed_at', { type: DataTypes.DATE, allowNull: true }],
  ['payroll_run_line', 'payslip_email_error', { type: DataTypes.STRING(500), allowNull: true }],
  // Slice: configurable retirement age, per-organisation mandatory employee
  // fields, Organisation Profile (bank identity + board members — new
  // organization_branch / organization_board_member tables, no column
  // steps needed for them), Aadhaar number, document header/footer.
  ['org_payroll_setting', 'retirement_age', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 58 }],
  ['organization', 'mandatory_employee_fields', { type: DataTypes.JSON, allowNull: true }],
  ['organization', 'established_year', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }],
  ['organization', 'registration_number', { type: DataTypes.STRING(128), allowNull: true }],
  ['organization', 'rbi_license_number', { type: DataTypes.STRING(128), allowNull: true }],
  ['organization', 'rbi_license_date', { type: DataTypes.DATEONLY, allowNull: true }],
  ['organization', 'gstn', { type: DataTypes.STRING(32), allowNull: true }],
  ['organization', 'pan_number', { type: DataTypes.STRING(16), allowNull: true }],
  ['employee', 'aadhaar_number', { type: DataTypes.STRING(16), allowNull: true }],
  // Slice: DA Arrears Management. da_revision / da_revision_document /
  // arrears_case / arrears_month_detail / arrears_installment were all
  // brand-new tables when this module first shipped — no column steps
  // needed for their original columns. This entry is for a FOLLOW-UP
  // change (arrears are paid separately from salary, not through a payroll
  // run — see services/arrears.js): two new columns on the
  // already-existing arrears_installment table.
  ['arrears_installment', 'paid_by', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }],
  ['arrears_installment', 'service_history_id', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }],
  // Slice: custom Allowance master, Year-End Process, Leave Policy, multi
  // bank account. allowance_type / allowance_type_post / year_end_closure /
  // leave_type / employee_leave_balance / leave_application /
  // employee_bank_account are all brand-new tables — no column steps
  // needed for their own columns. These are the new columns added to
  // ALREADY-EXISTING tables.
  ['org_payroll_setting', 'year_type', { type: DataTypes.ENUM('CALENDAR', 'FINANCIAL'), allowNull: false, defaultValue: 'CALENDAR' }],
  ['employee', 'salary_credit_account_id', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }],
  ['employee_overdraft', 'account_id', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }],
  ['employee_recurring_deposit', 'account_id', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }],
];

/**
 * Column WIDENINGS — changing an existing column's allowed values (e.g. a
 * new ENUM option). Unlike COLUMN_STEPS these aren't additive (the column
 * is already there), so there's nothing to "skip if present"; they're
 * safe to re-run every time instead, since re-applying the same
 * (already-widened) definition is a no-op on a dialect (e.g. MySQL) whose
 * ALTER TABLE ... MODIFY COLUMN changes only that column in place.
 *
 * SQLite has no such in-place ALTER COLUMN: Sequelize's sqlite
 * queryInterface.changeColumn() works around this by rebuilding the WHOLE
 * table (new table with the target column def, copy rows, drop, rename) —
 * and, in this sequelize version, that rebuild does not faithfully carry
 * over a COMPOSITE unique index (e.g. employee's (organization_id,
 * emp_code)): it silently turns it into two separate single-column UNIQUE
 * constraints (breaking "one employee per empCode per organisation" into
 * "one employee per organisation" and "one employee per empCode" globally)
 * and drops AUTOINCREMENT / ON DELETE CASCADE along the way. That's a
 * data-integrity-breaking rewrite, not a safe no-op, so on SQLite these
 * steps are skipped entirely — a dev SQLite DB created (or recreated) via
 * sequelize.sync() already has the wider type straight from the model
 * definition (and SQLite's TEXT-backed "ENUM" is unchecked at the storage
 * layer anyway), so there is nothing to widen there in the first place.
 */
const ENUM_WIDEN_STEPS = [
  // DA type gained a third option ('BOTH' = variable + fixed together).
  ['employee', 'da_type', { type: DataTypes.ENUM('VARIABLE', 'FIXED', 'BOTH'), allowNull: false, defaultValue: 'VARIABLE' }],
  // Service Book event types gained DA_ARREARS_PAYMENT (posted automatically
  // when an arrears installment is paid — see services/arrears.js#payInstallment).
  ['employee_service_history', 'event_type', {
    type: DataTypes.ENUM(
      'APPOINTMENT', 'PROBATION', 'CONFIRMATION', 'INCREMENT', 'PROMOTION',
      'TRANSFER', 'HIGHER_GRADE', 'PAY_REVISION', 'SUSPENSION', 'LWA',
      'BREAK_IN_SERVICE', 'DISCIPLINARY', 'RETIREMENT', 'DA_ARREARS_PAYMENT', 'OTHER'
    ),
    allowNull: false,
  }],
];

async function migrate() {
  const qi = sequelize.getQueryInterface();
  const added = [];
  for (const [table, column, spec] of COLUMN_STEPS) {
    // eslint-disable-next-line no-await-in-loop
    if (await addColumnIfMissing(qi, table, column, spec)) added.push(`${table}.${column}`);
  }
  if (sequelize.getDialect() !== 'sqlite') {
    for (const [table, column, spec] of ENUM_WIDEN_STEPS) {
      // eslint-disable-next-line no-await-in-loop
      await qi.changeColumn(table, column, spec).catch(() => {});
    }
  }
  return added;
}

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      console.log(`Connected (${sequelize.getDialect()}). Checking for missing columns...`);
      const added = await migrate();
      console.log(added.length ? `Added: ${added.join(', ')}` : 'Nothing to add — already up to date.');
      await sequelize.close();
    } catch (err) {
      console.error('migrate failed:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { migrate };
