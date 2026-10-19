'use strict';

const sequelize = require('../config/sequelize');

const Organization = require('./organization');
const GovernmentOrder = require('./governmentOrder');
const RuleReference = require('./ruleReference');
const RuleAmendment = require('./ruleAmendment');
const PostCadre = require('./postCadre');
const PayRevision = require('./payRevision');
const PayScale = require('./payScale');
const PayStage = require('./payStage');
const IncrementPolicy = require('./incrementPolicy');
const PayFixationPolicy = require('./payFixationPolicy');
const Employee = require('./employee');
const EmployeeServiceEvent = require('./employeeServiceEvent');
const EmployeeIncrementStatus = require('./employeeIncrementStatus');
const EmployeePayHistory = require('./employeePayHistory');
const EmployeeServiceHistory = require('./employeeServiceHistory');
const User = require('./user');
const PlatformSetting = require('./platformSetting');
const BrandAsset = require('./brandAsset');
const SmtpConfig = require('./smtpConfig');
const PasswordResetToken = require('./passwordResetToken');
const AuditLog = require('./auditLog');
const OrgPayrollSetting = require('./orgPayrollSetting');
const EmployeeFestivalAdvance = require('./employeeFestivalAdvance');
const EmployeeOverdraft = require('./employeeOverdraft');
const EmployeeRecurringDeposit = require('./employeeRecurringDeposit');
const EmployeeLic = require('./employeeLic');
const EmployeeHousingLoan = require('./employeeHousingLoan');
const EmployeeVehicleLoan = require('./employeeVehicleLoan');
const EmployeeDocument = require('./employeeDocument');
const GovernmentOrderDocument = require('./governmentOrderDocument');
const ServiceHistoryDocument = require('./serviceHistoryDocument');
const EmployeeAttendance = require('./employeeAttendance');
const PayrollRun = require('./payrollRun');
const OrganizationBranch = require('./organizationBranch');
const OrganizationBoardMember = require('./organizationBoardMember');
const PayrollRunLine = require('./payrollRunLine');
const OrganizationDocument = require('./organizationDocument');
const DaRevision = require('./daRevision');
const DaRevisionDocument = require('./daRevisionDocument');
const ArrearsCase = require('./arrearsCase');
const ArrearsMonthDetail = require('./arrearsMonthDetail');
const ArrearsInstallment = require('./arrearsInstallment');
const AllowanceType = require('./allowanceType');
const AllowanceTypePost = require('./allowanceTypePost');
const YearEndClosure = require('./yearEndClosure');
const LeaveType = require('./leaveType');
const EmployeeLeaveBalance = require('./employeeLeaveBalance');
const LeaveApplication = require('./leaveApplication');
const EmployeeBankAccount = require('./employeeBankAccount');

// ----------------------------------------------------------------------------
// Associations — this is the literal implementation of the required chain:
//   Employee -> Organization -> Applicable Service Rule -> Policy -> Engine -> Transaction
// ----------------------------------------------------------------------------

// Organization is the tenant root
Organization.hasMany(GovernmentOrder, { foreignKey: 'organizationId' });
Organization.hasMany(RuleReference, { foreignKey: 'organizationId' });
Organization.hasMany(PostCadre, { foreignKey: 'organizationId' });
Organization.hasMany(PayRevision, { foreignKey: 'organizationId' });
Organization.hasMany(PayScale, { foreignKey: 'organizationId' });
Organization.hasMany(IncrementPolicy, { foreignKey: 'organizationId' });
Organization.hasMany(PayFixationPolicy, { foreignKey: 'organizationId' });
Organization.hasMany(Employee, { foreignKey: 'organizationId' });

GovernmentOrder.belongsTo(Organization, { foreignKey: 'organizationId' });
RuleReference.belongsTo(Organization, { foreignKey: 'organizationId' });
PostCadre.belongsTo(Organization, { foreignKey: 'organizationId' });
PayRevision.belongsTo(Organization, { foreignKey: 'organizationId' });
PayScale.belongsTo(Organization, { foreignKey: 'organizationId' });
IncrementPolicy.belongsTo(Organization, { foreignKey: 'organizationId' });
PayFixationPolicy.belongsTo(Organization, { foreignKey: 'organizationId' });
Employee.belongsTo(Organization, { foreignKey: 'organizationId' });

// GO register: a GO can be cited by several rules, and accumulate amendments
GovernmentOrder.hasMany(RuleReference, { foreignKey: 'governmentOrderId' });
RuleReference.belongsTo(GovernmentOrder, { foreignKey: 'governmentOrderId' });
RuleReference.hasMany(RuleAmendment, { foreignKey: 'ruleReferenceId' });
RuleAmendment.belongsTo(RuleReference, { foreignKey: 'ruleReferenceId' });
GovernmentOrder.hasMany(RuleAmendment, { foreignKey: 'governmentOrderId' });
RuleAmendment.belongsTo(GovernmentOrder, { foreignKey: 'governmentOrderId' });

// Policies point to the rule/GO that authorizes them (never a bare value)
RuleReference.hasMany(IncrementPolicy, { foreignKey: 'ruleReferenceId' });
RuleReference.hasMany(PayFixationPolicy, { foreignKey: 'ruleReferenceId' });
RuleReference.hasMany(PayRevision, { foreignKey: 'ruleReferenceId' });
IncrementPolicy.belongsTo(RuleReference, { foreignKey: 'ruleReferenceId' });
PayFixationPolicy.belongsTo(RuleReference, { foreignKey: 'ruleReferenceId' });
PayRevision.belongsTo(RuleReference, { foreignKey: 'ruleReferenceId' });

// Post / cadre ladder
PostCadre.belongsTo(PostCadre, { as: 'ParentPost', foreignKey: 'parentPostId' });
PostCadre.belongsTo(PayScale, { as: 'DefaultPayScale', foreignKey: 'defaultPayScaleId' });
RuleReference.belongsTo(PostCadre, { as: 'ApplicablePostCadre', foreignKey: 'applicablePostCadreId' });

// Pay revision -> pay scale -> pay stage
PayRevision.hasMany(PayScale, { foreignKey: 'payRevisionId' });
PayScale.belongsTo(PayRevision, { foreignKey: 'payRevisionId' });
PayScale.hasMany(PayStage, { foreignKey: 'payScaleId' });
PayStage.belongsTo(PayScale, { foreignKey: 'payScaleId' });

// Employee points to the APPLICABLE policies (never a hard-coded value)
Employee.belongsTo(PostCadre, { foreignKey: 'postCadreId' });
Employee.belongsTo(PayScale, { as: 'CurrentPayScale', foreignKey: 'currentPayScaleId' });
Employee.belongsTo(PayStage, { as: 'CurrentPayStage', foreignKey: 'currentStageId' });
Employee.belongsTo(IncrementPolicy, { foreignKey: 'incrementPolicyId' });
Employee.belongsTo(PayFixationPolicy, { foreignKey: 'payFixationPolicyId' });

IncrementPolicy.hasMany(Employee, { foreignKey: 'incrementPolicyId' });
PayFixationPolicy.hasMany(Employee, { foreignKey: 'payFixationPolicyId' });

// Service events feed the increment-date engine
Employee.hasMany(EmployeeServiceEvent, { foreignKey: 'employeeId' });
EmployeeServiceEvent.belongsTo(Employee, { foreignKey: 'employeeId' });

// Increment status — one row per calculation, latest = current
Employee.hasMany(EmployeeIncrementStatus, { foreignKey: 'employeeId' });
EmployeeIncrementStatus.belongsTo(Employee, { foreignKey: 'employeeId' });
EmployeeIncrementStatus.belongsTo(IncrementPolicy, { foreignKey: 'incrementPolicyId' });
EmployeeIncrementStatus.belongsTo(RuleReference, { foreignKey: 'ruleReferenceId' });

// Pay history — the transaction ledger (Service Book)
Employee.hasMany(EmployeePayHistory, { foreignKey: 'employeeId' });
EmployeePayHistory.belongsTo(Employee, { foreignKey: 'employeeId' });
EmployeePayHistory.belongsTo(PayScale, { as: 'PreviousPayScale', foreignKey: 'previousPayScaleId' });
EmployeePayHistory.belongsTo(PayStage, { as: 'PreviousPayStage', foreignKey: 'previousStageId' });
EmployeePayHistory.belongsTo(PayScale, { as: 'NewPayScale', foreignKey: 'newPayScaleId' });
EmployeePayHistory.belongsTo(PayStage, { as: 'NewPayStage', foreignKey: 'newStageId' });
EmployeePayHistory.belongsTo(PostCadre, { foreignKey: 'postCadreId' });
EmployeePayHistory.belongsTo(PayRevision, { foreignKey: 'payRevisionId' });
EmployeePayHistory.belongsTo(IncrementPolicy, { foreignKey: 'incrementPolicyId' });
EmployeePayHistory.belongsTo(PayFixationPolicy, { foreignKey: 'payFixationPolicyId' });
EmployeePayHistory.belongsTo(RuleReference, { foreignKey: 'ruleReferenceId' });

// Service history — the Service Book timeline
Employee.hasMany(EmployeeServiceHistory, { foreignKey: 'employeeId' });
EmployeeServiceHistory.belongsTo(Employee, { foreignKey: 'employeeId' });
EmployeeServiceHistory.belongsTo(EmployeePayHistory, { as: 'PayHistoryEntry', foreignKey: 'payHistoryId' });
EmployeeServiceHistory.belongsTo(RuleReference, { foreignKey: 'ruleReferenceId' });
EmployeeServiceHistory.belongsTo(GovernmentOrder, { foreignKey: 'governmentOrderId' });

// Users — multi-tenant identities. SUPER_ADMIN has no organization (belongsTo
// is intentionally not required); every other role belongs to exactly one.
Organization.hasMany(User, { foreignKey: 'organizationId' });
User.belongsTo(Organization, { foreignKey: 'organizationId' });
User.belongsTo(Employee, { foreignKey: 'employeeId' });

// Branding, mail and security records. organizationId NULL on BrandAsset /
// SmtpConfig / AuditLog means platform-level. constraints:false because
// those NULL rows aren't a real parent relationship, and audit rows must
// outlive anything they mention.
Organization.hasMany(BrandAsset, { foreignKey: 'organizationId', constraints: false });
Organization.hasMany(SmtpConfig, { foreignKey: 'organizationId', constraints: false });
User.hasMany(PasswordResetToken, { foreignKey: 'userId' });
PasswordResetToken.belongsTo(User, { foreignKey: 'userId' });

// Payroll settings — one row per organisation (see services/payrollSettings.js).
Organization.hasOne(OrgPayrollSetting, { foreignKey: 'organizationId' });
OrgPayrollSetting.belongsTo(Organization, { foreignKey: 'organizationId' });

// Loan-style payroll records — Festival Advance, Overdraft, Recurring
// Deposit (see services/loans.js). Their monthly effect on a payslip is
// computed live from availedDate/startDate, not posted month by month.
Employee.hasMany(EmployeeFestivalAdvance, { foreignKey: 'employeeId' });
EmployeeFestivalAdvance.belongsTo(Employee, { foreignKey: 'employeeId' });
Employee.hasMany(EmployeeOverdraft, { foreignKey: 'employeeId' });
EmployeeOverdraft.belongsTo(Employee, { foreignKey: 'employeeId' });
Employee.hasMany(EmployeeRecurringDeposit, { foreignKey: 'employeeId' });
EmployeeRecurringDeposit.belongsTo(Employee, { foreignKey: 'employeeId' });
EmployeeOverdraft.hasMany(EmployeeRecurringDeposit, { foreignKey: 'overdraftId' });
EmployeeRecurringDeposit.belongsTo(EmployeeOverdraft, { foreignKey: 'overdraftId' });

// LIC, Housing Loan, Vehicle Loan — an employee may hold several of each at
// once; each row is its own policy/loan, deducted and displayed separately.
Employee.hasMany(EmployeeLic, { foreignKey: 'employeeId' });
EmployeeLic.belongsTo(Employee, { foreignKey: 'employeeId' });
Employee.hasMany(EmployeeHousingLoan, { foreignKey: 'employeeId' });
EmployeeHousingLoan.belongsTo(Employee, { foreignKey: 'employeeId' });
Employee.hasMany(EmployeeVehicleLoan, { foreignKey: 'employeeId' });
EmployeeVehicleLoan.belongsTo(Employee, { foreignKey: 'employeeId' });
Employee.hasMany(EmployeeDocument, { foreignKey: 'employeeId' });
EmployeeDocument.belongsTo(Employee, { foreignKey: 'employeeId' });

// Uploaded scans — at most one per GO / Service Book event (see
// services/attachments.js).
GovernmentOrder.hasOne(GovernmentOrderDocument, { foreignKey: 'governmentOrderId' });
GovernmentOrderDocument.belongsTo(GovernmentOrder, { foreignKey: 'governmentOrderId' });
EmployeeServiceHistory.hasOne(ServiceHistoryDocument, { foreignKey: 'serviceHistoryId' });
ServiceHistoryDocument.belongsTo(EmployeeServiceHistory, { foreignKey: 'serviceHistoryId' });

// Monthly attendance / LOP-day records feeding the payslip's pro-ration (see services/payslip.js).
Employee.hasMany(EmployeeAttendance, { foreignKey: 'employeeId' });
EmployeeAttendance.belongsTo(Employee, { foreignKey: 'employeeId' });

// Payroll engine: a processing run per organisation/month, and one frozen
// payslip line per employee within it (see services/payrollEngine.js).
Organization.hasMany(PayrollRun, { foreignKey: 'organizationId' });
PayrollRun.belongsTo(Organization, { foreignKey: 'organizationId' });
PayrollRun.hasMany(PayrollRunLine, { foreignKey: 'payrollRunId' });
PayrollRunLine.belongsTo(PayrollRun, { foreignKey: 'payrollRunId' });
PayrollRunLine.belongsTo(Employee, { foreignKey: 'employeeId' });
Employee.hasMany(PayrollRunLine, { foreignKey: 'employeeId' });

// Organisation Profile: branches and board members (Org Admin screen).
Organization.hasMany(OrganizationBranch, { foreignKey: 'organizationId' });
OrganizationBranch.belongsTo(Organization, { foreignKey: 'organizationId' });
Organization.hasMany(OrganizationBoardMember, { foreignKey: 'organizationId' });
OrganizationBoardMember.belongsTo(Organization, { foreignKey: 'organizationId' });
// Statutory document uploads (RBI licence, incorporation certificate, PAN,
// GSTN, TAN, other) — task 79.
Organization.hasMany(OrganizationDocument, { foreignKey: 'organizationId' });
OrganizationDocument.belongsTo(Organization, { foreignKey: 'organizationId' });

// DA Arrears Management (see services/arrears.js for the full design):
// DaRevision is the Government Order record; ArrearsCase is one employee's
// calculated arrears under it, backed by a month-by-month ArrearsMonthDetail
// ledger, paid out via ArrearsInstallment rows the payroll engine consumes.
Organization.hasMany(DaRevision, { foreignKey: 'organizationId' });
DaRevision.belongsTo(Organization, { foreignKey: 'organizationId' });
DaRevision.belongsTo(PayRevision, { as: 'ApplicablePayRevision', foreignKey: 'applicablePayRevisionId' });
DaRevision.hasOne(DaRevisionDocument, { foreignKey: 'daRevisionId' });
DaRevisionDocument.belongsTo(DaRevision, { foreignKey: 'daRevisionId' });

Organization.hasMany(ArrearsCase, { foreignKey: 'organizationId' });
ArrearsCase.belongsTo(Organization, { foreignKey: 'organizationId' });
DaRevision.hasMany(ArrearsCase, { foreignKey: 'daRevisionId' });
ArrearsCase.belongsTo(DaRevision, { foreignKey: 'daRevisionId' });
Employee.hasMany(ArrearsCase, { foreignKey: 'employeeId' });
ArrearsCase.belongsTo(Employee, { foreignKey: 'employeeId' });

ArrearsCase.hasMany(ArrearsMonthDetail, { foreignKey: 'arrearsCaseId' });
ArrearsMonthDetail.belongsTo(ArrearsCase, { foreignKey: 'arrearsCaseId' });

ArrearsCase.hasMany(ArrearsInstallment, { foreignKey: 'arrearsCaseId' });
ArrearsInstallment.belongsTo(ArrearsCase, { foreignKey: 'arrearsCaseId' });
ArrearsInstallment.belongsTo(PayrollRun, { as: 'PaidInPayrollRun', foreignKey: 'paidInPayrollRunId' }); // legacy — see arrearsInstallment.js
ArrearsInstallment.belongsTo(User, { as: 'PaidByUser', foreignKey: 'paidBy' });
ArrearsInstallment.belongsTo(EmployeeServiceHistory, { foreignKey: 'serviceHistoryId' });

// Allowance master (feature: admin-configurable allowances)
AllowanceType.hasMany(AllowanceTypePost, { foreignKey: 'allowanceTypeId' });
AllowanceTypePost.belongsTo(AllowanceType, { foreignKey: 'allowanceTypeId' });
AllowanceTypePost.belongsTo(PostCadre, { foreignKey: 'postCadreId' });

// Year-End Process (feature: financial-year vs calendar-year closing)
Organization.hasMany(YearEndClosure, { foreignKey: 'organizationId' });
YearEndClosure.belongsTo(Organization, { foreignKey: 'organizationId' });
YearEndClosure.belongsTo(User, { as: 'ClosedByUser', foreignKey: 'closedBy' });

// Leave Policy / Leave Management (feature: leave types, balances, applications)
Organization.hasMany(LeaveType, { foreignKey: 'organizationId' });
LeaveType.belongsTo(Organization, { foreignKey: 'organizationId' });

Employee.hasMany(EmployeeLeaveBalance, { foreignKey: 'employeeId' });
EmployeeLeaveBalance.belongsTo(Employee, { foreignKey: 'employeeId' });
LeaveType.hasMany(EmployeeLeaveBalance, { foreignKey: 'leaveTypeId' });
EmployeeLeaveBalance.belongsTo(LeaveType, { foreignKey: 'leaveTypeId' });

Employee.hasMany(LeaveApplication, { foreignKey: 'employeeId' });
LeaveApplication.belongsTo(Employee, { foreignKey: 'employeeId' });
LeaveType.hasMany(LeaveApplication, { foreignKey: 'leaveTypeId' });
LeaveApplication.belongsTo(LeaveType, { foreignKey: 'leaveTypeId' });
LeaveApplication.belongsTo(User, { as: 'AppliedByUser', foreignKey: 'appliedBy' });
LeaveApplication.belongsTo(User, { as: 'DecidedByUser', foreignKey: 'decidedBy' });

// Multiple bank accounts per employee (feature: OD/RD account numbers, routing)
Employee.hasMany(EmployeeBankAccount, { foreignKey: 'employeeId' });
EmployeeBankAccount.belongsTo(Employee, { foreignKey: 'employeeId' });
Employee.belongsTo(EmployeeBankAccount, { as: 'SalaryCreditAccount', foreignKey: 'salaryCreditAccountId' });
EmployeeOverdraft.belongsTo(EmployeeBankAccount, { as: 'Account', foreignKey: 'accountId' });
EmployeeRecurringDeposit.belongsTo(EmployeeBankAccount, { as: 'Account', foreignKey: 'accountId' });

module.exports = {
  sequelize,
  Organization,
  GovernmentOrder,
  RuleReference,
  RuleAmendment,
  PostCadre,
  PayRevision,
  PayScale,
  PayStage,
  IncrementPolicy,
  PayFixationPolicy,
  Employee,
  EmployeeServiceEvent,
  EmployeeIncrementStatus,
  EmployeePayHistory,
  EmployeeServiceHistory,
  User,
  PlatformSetting,
  BrandAsset,
  SmtpConfig,
  PasswordResetToken,
  AuditLog,
  OrgPayrollSetting,
  EmployeeFestivalAdvance,
  EmployeeOverdraft,
  EmployeeRecurringDeposit,
  EmployeeLic,
  EmployeeHousingLoan,
  EmployeeVehicleLoan,
  EmployeeDocument,
  GovernmentOrderDocument,
  ServiceHistoryDocument,
  EmployeeAttendance,
  PayrollRun,
  OrganizationBranch,
  OrganizationBoardMember,
  PayrollRunLine,
  OrganizationDocument,
  DaRevision,
  DaRevisionDocument,
  ArrearsCase,
  ArrearsMonthDetail,
  ArrearsInstallment,
  AllowanceType,
  AllowanceTypePost,
  YearEndClosure,
  LeaveType,
  EmployeeLeaveBalance,
  LeaveApplication,
  EmployeeBankAccount,
};
