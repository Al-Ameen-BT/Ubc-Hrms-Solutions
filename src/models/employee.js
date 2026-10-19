'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Employee = sequelize.define('Employee', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'organization_id' },
  empCode: { type: DataTypes.STRING(32), allowNull: false, field: 'emp_code' },
  name: { type: DataTypes.STRING(255), allowNull: false },
  dob: { type: DataTypes.DATEONLY },
  doj: { type: DataTypes.DATEONLY, allowNull: false },
  doa: { type: DataTypes.DATEONLY },
  postCadreId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'post_cadre_id' },
  grade: { type: DataTypes.STRING(64) },
  category: { type: DataTypes.STRING(64) },
  currentPayScaleId: { type: DataTypes.INTEGER.UNSIGNED, field: 'current_pay_scale_id' },
  currentStageId: { type: DataTypes.INTEGER.UNSIGNED, field: 'current_stage_id' },
  currentBasicPay: { type: DataTypes.DECIMAL(12, 2), field: 'current_basic_pay' },
  incrementPolicyId: { type: DataTypes.INTEGER.UNSIGNED, field: 'increment_policy_id' },
  payFixationPolicyId: { type: DataTypes.INTEGER.UNSIGNED, field: 'pay_fixation_policy_id' },
  employeeSpecificIncrementDate: { type: DataTypes.DATEONLY, field: 'employee_specific_increment_date' },
  employmentStatus: {
    type: DataTypes.ENUM('ACTIVE', 'LWA', 'SUSPENDED', 'BREAK_IN_SERVICE', 'RESIGNED', 'RETIRED', 'TERMINATED'),
    allowNull: false,
    defaultValue: 'ACTIVE',
    field: 'employment_status',
  },
  // Nature of engagement — distinct from employmentStatus above.
  // PART_TIME_CONTINGENT employees are paid from the single common
  // "Part-Time Contingent Employees of Licensed Urban Banks" scale
  // (Annexure-II), regardless of the organisation's bankClass; this is
  // chosen per employee, not at organisation level. See
  // services/payScaleLibrary.js.
  employmentType: {
    type: DataTypes.ENUM('REGULAR', 'PART_TIME_CONTINGENT'),
    allowNull: false,
    defaultValue: 'REGULAR',
    field: 'employment_type',
  },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },

  // ---- Salary structure: earnings (see services/payslip.js for how these
  // combine with OrgPayrollSetting's DA%/HRA% into a payslip) ----
  riskAllowance: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'risk_allowance' },
  otherAllowance: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'other_allowance' },

  // ---- Deductions ----
  vpfPercent: { type: DataTypes.DECIMAL(6, 3), allowNull: true, field: 'vpf_percent' }, // Voluntary PF, employee's own choice
  welfareFundOptIn: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'welfare_fund_opt_in' },
  welfareFundAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'welfare_fund_amount' }, // overrides org default when set
  gsliOptIn: { type: DataTypes.BOOLEAN, allowNull: true, field: 'gsli_opt_in' }, // NULL = auto-derive from doj vs org cutoff
  gsliAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'gsli_amount' }, // overrides org default when set
  ptAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'pt_amount' }, // Professional Tax, entered by admin per employee's slab

  // ---- Income tax ----
  taxRegime: { type: DataTypes.ENUM('NEW', 'OLD'), allowNull: false, defaultValue: 'NEW', field: 'tax_regime' },
  taxOtherDeductions: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'tax_other_deductions' }, // old regime only: 80C/80D etc declared beyond PF/VPF

  // ---- Stagnation increment tracking ----
  // Date the employee was last promoted/appointed to their CURRENT post.
  // Defaults to doa (date of appointment to present post); recorded here
  // separately because the 8-year clock resets on a promotion event, not
  // necessarily the same moment doa was first entered.
  lastPromotionDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'last_promotion_date' },
  stagnationStagesGranted: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'stagnation_stages_granted' },

  // ---- Personal details ----
  fatherName: { type: DataTypes.STRING(255), allowNull: true, field: 'father_name' },
  spouseName: { type: DataTypes.STRING(255), allowNull: true, field: 'spouse_name' },
  gender: { type: DataTypes.ENUM('MALE', 'FEMALE', 'OTHER'), allowNull: true },
  bloodGroup: { type: DataTypes.STRING(8), allowNull: true, field: 'blood_group' },
  educationalQualification: { type: DataTypes.STRING(255), allowNull: true, field: 'educational_qualification' },
  photoAssetId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'photo_asset_id' }, // -> EmployeeDocument.id (docType PHOTO)

  // ---- Identity / statutory numbers ----
  panNumber: { type: DataTypes.STRING(16), allowNull: true, field: 'pan_number' },
  aadhaarNumber: { type: DataTypes.STRING(16), allowNull: true, field: 'aadhaar_number' }, // stored as entered (typically 12 digits); masked to last 4 digits everywhere it's displayed
  uanNumber: { type: DataTypes.STRING(20), allowNull: true, field: 'uan_number' },
  pfNumber: { type: DataTypes.STRING(32), allowNull: true, field: 'pf_number' },

  // ---- Contact ----
  officeEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'office_email' },
  personalEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'personal_email' },
  residenceAddress: { type: DataTypes.TEXT, allowNull: true, field: 'residence_address' },
  emergencyContactName: { type: DataTypes.STRING(255), allowNull: true, field: 'emergency_contact_name' },
  emergencyContactNumber: { type: DataTypes.STRING(20), allowNull: true, field: 'emergency_contact_number' },
  emergencyContactRelation: { type: DataTypes.STRING(64), allowNull: true, field: 'emergency_contact_relation' },

  // ---- Bank account (for salary credit) ----
  // These three fields are the original single-account design and remain
  // the fallback salary account. An employee may additionally hold several
  // accounts (SB/OD/RD/OTHER — see models/employeeBankAccount.js);
  // salaryCreditAccountId picks one of those to credit net pay into
  // instead (e.g. straight into their Overdraft account), overriding these
  // three fields when set — see services/bankAccounts.js.
  bankName: { type: DataTypes.STRING(255), allowNull: true, field: 'bank_name' },
  bankAccountNumber: { type: DataTypes.STRING(32), allowNull: true, field: 'bank_account_number' },
  bankIfsc: { type: DataTypes.STRING(16), allowNull: true, field: 'bank_ifsc' },
  salaryCreditAccountId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'salary_credit_account_id' },

  // ---- Posting / organisational details ----
  branchName: { type: DataTypes.STRING(255), allowNull: true, field: 'branch_name' },
  branchCode: { type: DataTypes.STRING(32), allowNull: true, field: 'branch_code' },
  designation: { type: DataTypes.STRING(255), allowNull: true },
  department: { type: DataTypes.STRING(255), allowNull: true },
  gradeDetails: { type: DataTypes.STRING(255), allowNull: true, field: 'grade_details' }, // free text, distinct from the existing `grade` (pay-scale grade code)

  // ---- Service milestones ----
  dateOfConfirmation: { type: DataTypes.DATEONLY, allowNull: true, field: 'date_of_confirmation' },
  dateOfRetirement: { type: DataTypes.DATEONLY, allowNull: true, field: 'date_of_retirement' }, // admin override; defaults to DOB+60 (services/loans.js retirementDate()) when unset

  // ---- DA: Fixed or Variable (see services/payslip.js) ----
  // VARIABLE (default) = org's daPercent x Basic, recomputed automatically
  // whenever the org rate changes. FIXED = a flat rupee amount set here,
  // which stays the same regardless of later org DA% revisions.
  // VARIABLE (default) = org's DA% x Basic only. FIXED = fixedDaAmount only,
  // instead of the variable figure. BOTH = the variable figure PLUS
  // fixedDaAmount on top of it — see services/payslip.js.
  daType: { type: DataTypes.ENUM('VARIABLE', 'FIXED', 'BOTH'), allowNull: false, defaultValue: 'VARIABLE', field: 'da_type' },
  fixedDaAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'fixed_da_amount' },

  // ---- HRA: Auto (based on Basic Pay % / Org setting) or Fixed Amount ----
  hraType: { type: DataTypes.ENUM('PERCENT', 'FIXED'), allowNull: false, defaultValue: 'PERCENT', field: 'hra_type' },
  fixedHraAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'fixed_hra_amount' },

  // ---- City Compensatory Allowance / Conveyance Allowance (optional; see
  // services/payslip.js). NULL opt-in = auto (paid if the org has a default
  // amount configured > 0); amount NULL = use the org default. ----
  ccaOptIn: { type: DataTypes.BOOLEAN, allowNull: true, field: 'cca_opt_in' },
  ccaAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'cca_amount' },
  conveyanceOptIn: { type: DataTypes.BOOLEAN, allowNull: true, field: 'conveyance_opt_in' },
  conveyanceAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'conveyance_amount' },
}, {
  tableName: 'employee',
  indexes: [{ unique: true, fields: ['organization_id', 'emp_code'] }],
});

module.exports = Employee;
