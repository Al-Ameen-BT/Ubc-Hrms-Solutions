'use strict';

/**
 * REPORTING ENGINE SERVICE
 * ============================================================================
 * Generates audit-ready operational, financial, and statutory reports for:
 *   1. Loan Portfolio & Recoveries (Housing, Vehicle, Festival Advance, Overdraft, RD)
 *   2. Insurance & Staff Benefit Policies (LIC, GSLI, Welfare Fund)
 *   3. Master Salary & Deductions Register (with DA Arrears breakdown)
 *
 * Provides structured JSON responses, formatted multi-band Excel (.xlsx) workbooks,
 * and UTF-8 CSV exports.
 */

const Excel = require('exceljs');
const { Op } = require('sequelize');
const {
  Employee,
  OrganizationBranch,
  OrganizationDepartment,
  OrganizationPosition,
  EmployeeHousingLoan,
  EmployeeVehicleLoan,
  EmployeeFestivalAdvance,
  EmployeeOverdraft,
  EmployeeRecurringDeposit,
  EmployeeLic,
  PayrollRun,
  PayrollRunLine,
  ArrearsCase,
  ArrearsInstallment,
  Organization,
} = require('../models');

const { scheduleStatus, housingLoanStatus, vehicleLoanStatus, licStatus, asOfForMonth } = require('./loans');
const { getSettings } = require('./payrollSettings');
const { toCsv } = require('./csv');

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function fmtNum(n) {
  return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. LOAN PORTFOLIO & RECOVERIES REPORT
// ─────────────────────────────────────────────────────────────────────────────

async function getLoansReport({ organizationId, branchId, loanType, status = 'ALL', asOfDate }) {
  const asOf = asOfDate ? new Date(asOfDate) : new Date();
  const orgSettings = await getSettings(organizationId);

  // Load active branch list for lookup
  const branches = await OrganizationBranch.findAll({ where: { organizationId } });
  const branchMap = new Map(branches.map(b => [b.id, b]));
  const departments = await OrganizationDepartment.findAll({ where: { organizationId } });
  const deptMap = new Map(departments.map(d => [d.id, d]));

  // Base employee filter
  const empWhere = { organizationId };
  if (branchId) empWhere.branchId = branchId;
  const employees = await Employee.findAll({
    where: empWhere,
    attributes: ['id', 'empCode', 'name', 'branchId', 'departmentId'],
  });
  const empMap = new Map(employees.map(e => [e.id, e]));
  const empIds = employees.map(e => e.id);

  if (!empIds.length) {
    return {
      summary: {
        totalPrincipal: 0,
        totalRepayable: 0,
        totalBalanceRemaining: 0,
        monthlyRecoveryDemand: 0,
        activeAccountsCount: 0,
        closedAccountsCount: 0,
        countByType: { HOUSING: 0, VEHICLE: 0, FESTIVAL_ADVANCE: 0, OVERDRAFT: 0, RECURRING_DEPOSIT: 0 },
      },
      rows: [],
    };
  }

  const rows = [];

  // A. Housing Loans
  if (!loanType || loanType === 'ALL' || loanType === 'HOUSING') {
    const loans = await EmployeeHousingLoan.findAll({ where: { employeeId: empIds } });
    for (const l of loans) {
      const emp = empMap.get(l.employeeId);
      const st = housingLoanStatus(l, asOf);
      const periodMonths = Math.max(1, Number(l.periodMonths) || 1);
      const totalRepayable = l.totalRepaymentAmount != null ? Number(l.totalRepaymentAmount) : (st.emiAmount * periodMonths);
      
      const start = new Date(String(l.emiStartDate) + 'T00:00:00Z');
      const startMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
      const asOfMonth = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
      const elapsed = Math.max(0, (asOfMonth.getUTCFullYear() - startMonth.getUTCFullYear()) * 12 + (asOfMonth.getUTCMonth() - startMonth.getUTCMonth()));
      const monthsElapsed = Math.min(periodMonths, elapsed);
      const repaidSoFar = Math.min(totalRepayable, monthsElapsed * st.emiAmount);
      const balanceRemaining = l.closureDate && new Date(l.closureDate) <= asOf ? 0 : Math.max(0, totalRepayable - repaidSoFar);
      const isClosed = balanceRemaining <= 0 || (l.closureDate && new Date(l.closureDate) <= asOf);

      if (status === 'ACTIVE' && isClosed) continue;
      if (status === 'CLOSED' && !isClosed) continue;

      rows.push({
        id: `HOUSING_${l.id}`,
        loanType: 'Housing Loan',
        loanTypeCode: 'HOUSING',
        employeeId: emp?.id,
        empCode: emp?.empCode || '—',
        employeeName: emp?.name || '—',
        branchId: emp?.branchId,
        branchName: branchMap.get(emp?.branchId)?.name || '—',
        departmentName: deptMap.get(emp?.departmentId)?.name || '—',
        accountOrRef: `HL-${l.id}`,
        sanctionedAmount: Number(l.totalLoanAmount),
        totalRepayable,
        monthlyInstallment: st.emiAmount,
        repaidSoFar,
        balanceRemaining,
        startDate: l.emiStartDate,
        endDate: l.emiEndDate,
        closureDate: l.closureDate || null,
        status: isClosed ? 'CLOSED' : 'ACTIVE',
        remarks: l.remarks || '',
      });
    }
  }

  // B. Vehicle Loans
  if (!loanType || loanType === 'ALL' || loanType === 'VEHICLE') {
    const loans = await EmployeeVehicleLoan.findAll({ where: { employeeId: empIds } });
    for (const l of loans) {
      const emp = empMap.get(l.employeeId);
      const st = vehicleLoanStatus(l, asOf, orgSettings);
      const periodMonths = Math.max(1, Number(l.periodMonths) || 1);
      const totalRepayable = l.totalRepaymentAmount != null ? Number(l.totalRepaymentAmount) : (st.emiAmount * periodMonths);

      const start = new Date(String(l.startDate) + 'T00:00:00Z');
      const startMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
      const asOfMonth = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
      const elapsed = Math.max(0, (asOfMonth.getUTCFullYear() - startMonth.getUTCFullYear()) * 12 + (asOfMonth.getUTCMonth() - startMonth.getUTCMonth()));
      const monthsElapsed = Math.min(periodMonths, elapsed);
      const repaidSoFar = Math.min(totalRepayable, monthsElapsed * st.emiAmount);
      const balanceRemaining = l.closureDate && new Date(l.closureDate) <= asOf ? 0 : Math.max(0, totalRepayable - repaidSoFar);
      const isClosed = balanceRemaining <= 0 || (l.closureDate && new Date(l.closureDate) <= asOf);

      if (status === 'ACTIVE' && isClosed) continue;
      if (status === 'CLOSED' && !isClosed) continue;

      rows.push({
        id: `VEHICLE_${l.id}`,
        loanType: 'Vehicle Loan',
        loanTypeCode: 'VEHICLE',
        employeeId: emp?.id,
        empCode: emp?.empCode || '—',
        employeeName: emp?.name || '—',
        branchId: emp?.branchId,
        branchName: branchMap.get(emp?.branchId)?.name || '—',
        departmentName: deptMap.get(emp?.departmentId)?.name || '—',
        accountOrRef: l.vehicleType ? `${l.vehicleType} (VL-${l.id})` : `VL-${l.id}`,
        sanctionedAmount: Number(l.totalAmount),
        totalRepayable,
        monthlyInstallment: st.emiAmount,
        repaidSoFar,
        balanceRemaining,
        startDate: l.startDate,
        endDate: l.endDate,
        closureDate: l.closureDate || null,
        status: isClosed ? 'CLOSED' : 'ACTIVE',
        remarks: l.remarks || '',
      });
    }
  }

  // C. Festival Advance
  if (!loanType || loanType === 'ALL' || loanType === 'FESTIVAL_ADVANCE') {
    const advances = await EmployeeFestivalAdvance.findAll({ where: { employeeId: empIds } });
    for (const fa of advances) {
      const emp = empMap.get(fa.employeeId);
      const st = scheduleStatus(fa, asOf);
      const isClosed = st.fullyRepaid;

      if (status === 'ACTIVE' && isClosed) continue;
      if (status === 'CLOSED' && !isClosed) continue;

      rows.push({
        id: `FA_${fa.id}`,
        loanType: 'Festival Advance',
        loanTypeCode: 'FESTIVAL_ADVANCE',
        employeeId: emp?.id,
        empCode: emp?.empCode || '—',
        employeeName: emp?.name || '—',
        branchId: emp?.branchId,
        branchName: branchMap.get(emp?.branchId)?.name || '—',
        departmentName: deptMap.get(emp?.departmentId)?.name || '—',
        accountOrRef: `FA-${fa.id}`,
        sanctionedAmount: Number(fa.amount),
        totalRepayable: st.totalRepayable,
        monthlyInstallment: st.monthlyInstallment,
        repaidSoFar: st.repaidSoFar,
        balanceRemaining: st.balanceRemaining,
        startDate: fa.availedDate,
        endDate: null,
        closureDate: null,
        status: isClosed ? 'CLOSED' : 'ACTIVE',
        remarks: fa.remarks || '',
      });
    }
  }

  // D. Overdraft
  if (!loanType || loanType === 'ALL' || loanType === 'OVERDRAFT') {
    const ods = await EmployeeOverdraft.findAll({ where: { employeeId: empIds } });
    for (const od of ods) {
      const emp = empMap.get(od.employeeId);
      const st = scheduleStatus(od, asOf);
      const isClosed = st.fullyRepaid;

      if (status === 'ACTIVE' && isClosed) continue;
      if (status === 'CLOSED' && !isClosed) continue;

      rows.push({
        id: `OD_${od.id}`,
        loanType: 'Employee Overdraft',
        loanTypeCode: 'OVERDRAFT',
        employeeId: emp?.id,
        empCode: emp?.empCode || '—',
        employeeName: emp?.name || '—',
        branchId: emp?.branchId,
        branchName: branchMap.get(emp?.branchId)?.name || '—',
        departmentName: deptMap.get(emp?.departmentId)?.name || '—',
        accountOrRef: `OD-${od.id}`,
        sanctionedAmount: Number(od.amount),
        totalRepayable: st.totalRepayable,
        monthlyInstallment: st.monthlyInstallment,
        repaidSoFar: st.repaidSoFar,
        balanceRemaining: st.balanceRemaining,
        startDate: od.availedDate,
        endDate: null,
        closureDate: null,
        status: isClosed ? 'CLOSED' : 'ACTIVE',
        remarks: od.remarks || '',
      });
    }
  }

  // E. Recurring Deposit
  if (!loanType || loanType === 'ALL' || loanType === 'RECURRING_DEPOSIT') {
    const rds = await EmployeeRecurringDeposit.findAll({ where: { employeeId: empIds } });
    for (const rd of rds) {
      const emp = empMap.get(rd.employeeId);
      const isClosed = rd.status === 'CLOSED';

      if (status === 'ACTIVE' && isClosed) continue;
      if (status === 'CLOSED' && !isClosed) continue;

      rows.push({
        id: `RD_${rd.id}`,
        loanType: 'Recurring Deposit',
        loanTypeCode: 'RECURRING_DEPOSIT',
        employeeId: emp?.id,
        empCode: emp?.empCode || '—',
        employeeName: emp?.name || '—',
        branchId: emp?.branchId,
        branchName: branchMap.get(emp?.branchId)?.name || '—',
        departmentName: deptMap.get(emp?.departmentId)?.name || '—',
        accountOrRef: rd.overdraftId ? `RD-${rd.id} (OD #${rd.overdraftId})` : `RD-${rd.id}`,
        sanctionedAmount: 0,
        totalRepayable: 0,
        monthlyInstallment: Number(rd.monthlyAmount || 0),
        repaidSoFar: 0,
        balanceRemaining: 0,
        startDate: rd.startDate,
        endDate: null,
        closureDate: null,
        status: isClosed ? 'CLOSED' : 'ACTIVE',
        remarks: rd.remarks || '',
      });
    }
  }

  // Calculate summary metrics
  const summary = {
    totalPrincipal: rows.reduce((s, r) => s + (r.sanctionedAmount || 0), 0),
    totalRepayable: rows.reduce((s, r) => s + (r.totalRepayable || 0), 0),
    totalBalanceRemaining: rows.reduce((s, r) => s + (r.balanceRemaining || 0), 0),
    monthlyRecoveryDemand: rows.filter(r => r.status === 'ACTIVE').reduce((s, r) => s + (r.monthlyInstallment || 0), 0),
    activeAccountsCount: rows.filter(r => r.status === 'ACTIVE').length,
    closedAccountsCount: rows.filter(r => r.status === 'CLOSED').length,
    countByType: {
      HOUSING: rows.filter(r => r.loanTypeCode === 'HOUSING').length,
      VEHICLE: rows.filter(r => r.loanTypeCode === 'VEHICLE').length,
      FESTIVAL_ADVANCE: rows.filter(r => r.loanTypeCode === 'FESTIVAL_ADVANCE').length,
      OVERDRAFT: rows.filter(r => r.loanTypeCode === 'OVERDRAFT').length,
      RECURRING_DEPOSIT: rows.filter(r => r.loanTypeCode === 'RECURRING_DEPOSIT').length,
    },
  };

  return { summary, rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. INSURANCE & POLICIES REPORT
// ─────────────────────────────────────────────────────────────────────────────

async function getInsuranceReport({ organizationId, branchId, policyType = 'ALL', status = 'ALL' }) {
  const asOf = new Date();
  const branches = await OrganizationBranch.findAll({ where: { organizationId } });
  const branchMap = new Map(branches.map(b => [b.id, b]));
  const departments = await OrganizationDepartment.findAll({ where: { organizationId } });
  const deptMap = new Map(departments.map(d => [d.id, d]));

  const empWhere = { organizationId };
  if (branchId) empWhere.branchId = branchId;
  const employees = await Employee.findAll({
    where: empWhere,
    attributes: [
      'id', 'empCode', 'name', 'branchId', 'departmentId', 'doj',
      'welfareFundOptIn', 'welfareFundAmount', 'gsliOptIn', 'gsliAmount'
    ],
  });
  const empMap = new Map(employees.map(e => [e.id, e]));
  const empIds = employees.map(e => e.id);

  if (!empIds.length) {
    return {
      summary: {
        totalActivePolicies: 0,
        totalSumAssured: 0,
        totalMonthlyDeduction: 0,
        enrolledEmployeesCount: 0,
        countByType: { LIC: 0, GSLI: 0, WELFARE_FUND: 0 },
      },
      rows: [],
    };
  }

  const rows = [];
  const enrolledEmployees = new Set();

  // A. LIC Policies
  if (!policyType || policyType === 'ALL' || policyType === 'LIC') {
    const lics = await EmployeeLic.findAll({ where: { employeeId: empIds } });
    for (const lic of lics) {
      const emp = empMap.get(lic.employeeId);
      const st = licStatus(lic, asOf);
      const isClosed = !st.active;

      if (status === 'ACTIVE' && isClosed) continue;
      if (status === 'CLOSED' && !isClosed) continue;

      enrolledEmployees.add(lic.employeeId);
      rows.push({
        id: `LIC_${lic.id}`,
        policyType: 'LIC Policy',
        policyTypeCode: 'LIC',
        employeeId: emp?.id,
        empCode: emp?.empCode || '—',
        employeeName: emp?.name || '—',
        branchId: emp?.branchId,
        branchName: branchMap.get(emp?.branchId)?.name || '—',
        departmentName: deptMap.get(emp?.departmentId)?.name || '—',
        policyNumber: lic.policyNumber || `LIC-${lic.id}`,
        sumAssuredAmount: Number(lic.sumAssuredAmount || 0),
        monthlyDeduction: Number(lic.deductionAmount || 0),
        openingDate: lic.openingDate,
        startedDate: lic.startedDate,
        maturityDate: lic.maturityDate || null,
        closureDate: lic.closureDate || null,
        status: isClosed ? 'CLOSED' : 'ACTIVE',
        remarks: lic.remarks || '',
      });
    }
  }

  // B. GSLI (Group Savings Linked Insurance)
  if (!policyType || policyType === 'ALL' || policyType === 'GSLI') {
    for (const emp of employees) {
      const active = emp.gsliOptIn === true;
      if (status === 'ACTIVE' && !active) continue;
      if (status === 'CLOSED' && active) continue;
      if (!emp.gsliOptIn && !emp.gsliAmount) continue;

      if (active) enrolledEmployees.add(emp.id);
      rows.push({
        id: `GSLI_${emp.id}`,
        policyType: 'Group Savings Linked Insurance (GSLI)',
        policyTypeCode: 'GSLI',
        employeeId: emp.id,
        empCode: emp.empCode,
        employeeName: emp.name,
        branchId: emp.branchId,
        branchName: branchMap.get(emp.branchId)?.name || '—',
        departmentName: deptMap.get(emp.departmentId)?.name || '—',
        policyNumber: `GSLI-${emp.empCode}`,
        sumAssuredAmount: 100000, // Standard GSLI risk coverage
        monthlyDeduction: Number(emp.gsliAmount || 150),
        openingDate: emp.doj,
        startedDate: emp.doj,
        maturityDate: null,
        closureDate: null,
        status: active ? 'ACTIVE' : 'CLOSED',
        remarks: 'Bank Group Savings Linked Insurance Scheme',
      });
    }
  }

  // C. Welfare Fund
  if (!policyType || policyType === 'ALL' || policyType === 'WELFARE_FUND') {
    for (const emp of employees) {
      const active = emp.welfareFundOptIn === true;
      if (status === 'ACTIVE' && !active) continue;
      if (status === 'CLOSED' && active) continue;
      if (!emp.welfareFundOptIn && !emp.welfareFundAmount) continue;

      if (active) enrolledEmployees.add(emp.id);
      rows.push({
        id: `WELFARE_${emp.id}`,
        policyType: 'Employees Welfare Fund',
        policyTypeCode: 'WELFARE_FUND',
        employeeId: emp.id,
        empCode: emp.empCode,
        employeeName: emp.name,
        branchId: emp.branchId,
        branchName: branchMap.get(emp.branchId)?.name || '—',
        departmentName: deptMap.get(emp.departmentId)?.name || '—',
        policyNumber: `WF-${emp.empCode}`,
        sumAssuredAmount: 0,
        monthlyDeduction: Number(emp.welfareFundAmount || 100),
        openingDate: emp.doj,
        startedDate: emp.doj,
        maturityDate: null,
        closureDate: null,
        status: active ? 'ACTIVE' : 'CLOSED',
        remarks: 'Urban Co-operative Bank Welfare Scheme',
      });
    }
  }

  const summary = {
    totalActivePolicies: rows.filter(r => r.status === 'ACTIVE').length,
    totalSumAssured: rows.reduce((s, r) => s + (r.sumAssuredAmount || 0), 0),
    totalMonthlyDeduction: rows.filter(r => r.status === 'ACTIVE').reduce((s, r) => s + (r.monthlyDeduction || 0), 0),
    enrolledEmployeesCount: enrolledEmployees.size,
    countByType: {
      LIC: rows.filter(r => r.policyTypeCode === 'LIC').length,
      GSLI: rows.filter(r => r.policyTypeCode === 'GSLI').length,
      WELFARE_FUND: rows.filter(r => r.policyTypeCode === 'WELFARE_FUND').length,
    },
  };

  return { summary, rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. MASTER SALARY & DEDUCTIONS REGISTER (WITH ARREARS BREAKDOWN)
// ─────────────────────────────────────────────────────────────────────────────

async function getSalaryDataReport({ organizationId, branchId, year, month, status }) {
  const branches = await OrganizationBranch.findAll({ where: { organizationId } });
  const branchMap = new Map(branches.map(b => [b.id, b]));
  const departments = await OrganizationDepartment.findAll({ where: { organizationId } });
  const deptMap = new Map(departments.map(d => [d.id, d]));

  // Find target run or runs
  const runWhere = { organizationId };
  if (year) runWhere.year = Number(year);
  if (month) runWhere.month = Number(month);
  if (status && status !== 'ALL') runWhere.status = status;

  // Default to newest processed/approved/paid run if not specified
  let runs = await PayrollRun.findAll({
    where: runWhere,
    order: [['year', 'DESC'], ['month', 'DESC']],
  });

  if (!runs.length && (!year || !month)) {
    runs = await PayrollRun.findAll({
      where: { organizationId },
      order: [['year', 'DESC'], ['month', 'DESC']],
      limit: 1,
    });
  }

  if (!runs.length) {
    return {
      period: { year: year || new Date().getFullYear(), month: month || (new Date().getMonth() + 1) },
      summary: {
        totalGrossEarnings: 0,
        totalBasic: 0,
        totalDa: 0,
        totalHra: 0,
        totalAllowances: 0,
        totalArrears: 0,
        totalDeductions: 0,
        totalPfEmployee: 0,
        totalPt: 0,
        totalTds: 0,
        totalLoansRecovery: 0,
        totalPoliciesDeduction: 0,
        totalNetPay: 0,
        employeeCount: 0,
      },
      rows: [],
    };
  }

  const targetRun = runs[0];
  const targetYear = targetRun.year;
  const targetMonth = targetRun.month;

  // Load employee master details for branch filtering & assignment
  const empWhere = { organizationId };
  if (branchId) empWhere.branchId = branchId;
  const employees = await Employee.findAll({
    where: empWhere,
    attributes: ['id', 'empCode', 'name', 'branchId', 'departmentId', 'bankAccountNumber', 'bankIfsc', 'bankName'],
  });
  const empMap = new Map(employees.map(e => [e.id, e]));
  const empIds = new Set(employees.map(e => e.id));

  // Load Run Lines
  const runLines = await PayrollRunLine.findAll({
    where: { payrollRunId: targetRun.id },
  });

  // Query any Arrears Installments marked PAID in this year/month
  const arrearsInstallments = await ArrearsInstallment.findAll({
    where: {
      year: targetYear,
      month: targetMonth,
      status: 'PAID',
    },
    include: [{ model: ArrearsCase, attributes: ['organizationId', 'employeeId', 'empCode', 'employeeName'] }],
  });
  const arrearsByEmp = new Map();
  for (const inst of arrearsInstallments) {
    if (inst.ArrearsCase && inst.ArrearsCase.organizationId === organizationId) {
      const eId = inst.ArrearsCase.employeeId;
      arrearsByEmp.set(eId, (arrearsByEmp.get(eId) || 0) + Number(inst.amount || 0));
    }
  }

  const rows = [];
  for (const line of runLines) {
    if (branchId && !empIds.has(line.employeeId)) continue;
    const emp = empMap.get(line.employeeId);

    let payslip = {};
    try {
      payslip = JSON.parse(line.payslipJson || '{}');
    } catch {
      payslip = {};
    }

    const earnings = payslip.earnings || {};
    const deductions = payslip.deductions || {};
    const arrearsAmount = arrearsByEmp.get(line.employeeId) || 0;

    // Adjusted gross: payslip grossEarnings + any separate DA arrears paid in this month
    const originalGross = Number(line.grossEarnings || earnings.grossEarnings || 0);
    const adjustedGross = originalGross + arrearsAmount;
    const totalDeds = Number(line.totalDeductions || deductions.totalDeductions || 0);
    const adjustedNet = adjustedGross - totalDeds;

    const row = {
      lineId: line.id,
      employeeId: line.employeeId,
      empCode: line.empCode,
      employeeName: line.employeeName,
      postName: line.postName || '—',
      branchId: emp?.branchId || null,
      branchName: branchMap.get(emp?.branchId)?.name || 'Head Office',
      departmentName: deptMap.get(emp?.departmentId)?.name || 'General Administration',
      bankName: line.bankName || emp?.bankName || '—',
      bankAccountNumber: line.bankAccountNumber || emp?.bankAccountNo || '—',
      bankIfsc: line.bankIfsc || emp?.bankIfsc || '—',
      hasBankDetails: line.hasBankDetails,
      payableDays: payslip.attendance?.payableDays || 30,
      lopDays: Number(line.lopDays || payslip.attendance?.lopDays || 0),
      paidDays: (payslip.attendance?.payableDays || 30) - Number(line.lopDays || 0),

      // Earnings Breakdown
      actualBasic: Number(earnings.actualBasic || 0),
      basic: Number(earnings.basic || 0),
      da: Number(earnings.da || 0),
      hra: Number(earnings.hra || 0),
      riskAllowance: Number(earnings.riskAllowance || 0),
      otherAllowance: Number(earnings.otherAllowance || 0),
      cca: Number(earnings.cca || 0),
      conveyance: Number(earnings.conveyance || 0),
      medicalAllowance: Number(earnings.medicalAllowance || 0),
      bonus: Number(earnings.bonus || 0),
      customAllowancesTotal: Number(earnings.customAllowancesTotal || 0),
      arrearsAmount,
      grossEarnings: adjustedGross,

      // Deductions Breakdown
      pfEmployee: Number(deductions.pfEmployee || 0),
      pfEmployer: Number(deductions.pfEmployer || 0),
      vpf: Number(deductions.vpf || 0),
      welfareFund: Number(deductions.welfareFund || 0),
      welfareFundEmployer: Number(deductions.welfareFundEmployer || 0),
      gsli: Number(deductions.gsli || 0),
      professionalTax: Number(deductions.professionalTax || 0),
      incomeTax: Number(deductions.incomeTax || 0),
      festivalAdvance: Number(deductions.festivalAdvance || 0),
      overdraft: Number(deductions.overdraft || 0),
      recurringDeposit: Number(deductions.recurringDeposit || 0),
      lic: Number(deductions.lic || 0),
      housingLoan: Number(deductions.housingLoan || 0),
      vehicleLoan: Number(deductions.vehicleLoan || 0),
      customDeductionsTotal: Number(deductions.customDeductionsTotal || 0),
      totalDeductions: totalDeds,

      // Net Pay
      netPay: adjustedNet,
      runStatus: targetRun.status,
    };

    rows.push(row);
  }

  // Grand summary totals
  const summary = {
    totalGrossEarnings: rows.reduce((s, r) => s + r.grossEarnings, 0),
    totalBasic: rows.reduce((s, r) => s + r.basic, 0),
    totalDa: rows.reduce((s, r) => s + r.da, 0),
    totalHra: rows.reduce((s, r) => s + r.hra, 0),
    totalAllowances: rows.reduce((s, r) => s + r.riskAllowance + r.otherAllowance + r.cca + r.conveyance + r.medicalAllowance + r.customAllowancesTotal, 0),
    totalArrears: rows.reduce((s, r) => s + r.arrearsAmount, 0),
    totalDeductions: rows.reduce((s, r) => s + r.totalDeductions, 0),
    totalPfEmployee: rows.reduce((s, r) => s + r.pfEmployee, 0),
    totalPt: rows.reduce((s, r) => s + r.professionalTax, 0),
    totalTds: rows.reduce((s, r) => s + r.incomeTax, 0),
    totalLoansRecovery: rows.reduce((s, r) => s + r.festivalAdvance + r.overdraft + r.housingLoan + r.vehicleLoan + r.recurringDeposit, 0),
    totalPoliciesDeduction: rows.reduce((s, r) => s + r.lic + r.gsli + r.welfareFund, 0),
    totalNetPay: rows.reduce((s, r) => s + r.netPay, 0),
    employeeCount: rows.length,
  };

  return {
    period: {
      year: targetYear,
      month: targetMonth,
      monthName: MONTH_NAMES[targetMonth] || String(targetMonth),
      runId: targetRun.id,
      runStatus: targetRun.status,
    },
    summary,
    rows,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXCEL (.XLSX) WORKBOOK EXPORTERS
// ─────────────────────────────────────────────────────────────────────────────

async function buildLoansExcelWorkbook(reportData, org) {
  const workbook = new Excel.Workbook();
  workbook.creator = 'UCB HRMS';
  const sheet = workbook.addWorksheet('Loan Portfolio & Recoveries', {
    views: [{ state: 'frozen', ySplit: 5 }],
  });

  // Title Banner
  sheet.mergeCells('A1:N1');
  sheet.getCell('A1').value = (org?.name || 'Urban Co-operative Bank Ltd.').toUpperCase();
  sheet.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 28;

  // Subtitle
  sheet.mergeCells('A2:N2');
  sheet.getCell('A2').value = `LOAN PORTFOLIO & RECOVERIES AUDIT REGISTER — Generated on ${new Date().toLocaleDateString('en-IN')}`;
  sheet.getCell('A2').font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } };
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 20;

  // KPI Summary Bar
  sheet.mergeCells('A3:N3');
  const sum = reportData.summary;
  sheet.getCell('A3').value = `Total Accounts: ${reportData.rows.length}  |  Active Accounts: ${sum.activeAccountsCount}  |  Total Disbursed: ₹${fmtNum(sum.totalPrincipal)}  |  Total Outstanding: ₹${fmtNum(sum.totalBalanceRemaining)}  |  Monthly Demand: ₹${fmtNum(sum.monthlyRecoveryDemand)}`;
  sheet.getCell('A3').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF1F2937' } };
  sheet.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
  sheet.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(3).height = 22;

  // Blank line
  sheet.getRow(4).height = 8;

  // Column Headers
  const headers = [
    'Sl.', 'Emp Code', 'Employee Name', 'Branch', 'Department',
    'Loan Type', 'Ref / Account', 'Sanctioned (₹)', 'Total Repayable (₹)',
    'Monthly EMI (₹)', 'Repaid So Far (₹)', 'Balance Outstanding (₹)', 'Start Date', 'Status'
  ];
  const headerRow = sheet.getRow(5);
  headerRow.height = 26;
  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  sheet.columns = [
    { width: 6 }, { width: 14 }, { width: 24 }, { width: 22 }, { width: 24 },
    { width: 18 }, { width: 18 }, { width: 16 }, { width: 18 },
    { width: 16 }, { width: 18 }, { width: 22 }, { width: 14 }, { width: 12 },
  ];

  // Data Rows
  reportData.rows.forEach((r, idx) => {
    const row = sheet.getRow(6 + idx);
    row.height = 20;
    row.values = [
      idx + 1, r.empCode, r.employeeName, r.branchName, r.departmentName,
      r.loanType, r.accountOrRef, r.sanctionedAmount, r.totalRepayable,
      r.monthlyInstallment, r.repaidSoFar, r.balanceRemaining, r.startDate || '—', r.status
    ];
    row.font = { name: 'Arial', size: 9 };
    for (let c = 1; c <= 14; c++) {
      const cell = row.getCell(c);
      cell.border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
      if ([1, 2, 13, 14].includes(c)) cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if ([8, 9, 10, 11, 12].includes(c)) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0.00';
      }
    }
  });

  // Grand Total Row
  const totalRowNum = 6 + reportData.rows.length;
  const totalRow = sheet.getRow(totalRowNum);
  totalRow.height = 24;
  totalRow.getCell(1).value = 'TOTAL';
  totalRow.getCell(3).value = `[${reportData.rows.length} Accounts]`;
  totalRow.getCell(8).value = sum.totalPrincipal;
  totalRow.getCell(9).value = sum.totalRepayable;
  totalRow.getCell(10).value = sum.monthlyRecoveryDemand;
  totalRow.getCell(12).value = sum.totalBalanceRemaining;
  totalRow.font = { name: 'Arial', size: 9, bold: true };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  for (let c = 1; c <= 14; c++) {
    const cell = totalRow.getCell(c);
    cell.border = { top: { style: 'medium' }, bottom: { style: 'double' } };
    if ([8, 9, 10, 12].includes(c)) cell.numFmt = '#,##0.00';
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function buildInsuranceExcelWorkbook(reportData, org) {
  const workbook = new Excel.Workbook();
  workbook.creator = 'UCB HRMS';
  const sheet = workbook.addWorksheet('Insurance & Policies', {
    views: [{ state: 'frozen', ySplit: 5 }],
  });

  sheet.mergeCells('A1:L1');
  sheet.getCell('A1').value = (org?.name || 'Urban Co-operative Bank Ltd.').toUpperCase();
  sheet.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E6251' } };
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 28;

  sheet.mergeCells('A2:L2');
  sheet.getCell('A2').value = `STAFF INSURANCE, GSLI & WELFARE AUDIT REGISTER — As of ${new Date().toLocaleDateString('en-IN')}`;
  sheet.getCell('A2').font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF117864' } };
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 20;

  const sum = reportData.summary;
  sheet.mergeCells('A3:L3');
  sheet.getCell('A3').value = `Total Active Policies: ${sum.totalActivePolicies}  |  Enrolled Staff: ${sum.enrolledEmployeesCount}  |  Total Sum Assured: ₹${fmtNum(sum.totalSumAssured)}  |  Monthly Premium Demand: ₹${fmtNum(sum.totalMonthlyDeduction)}`;
  sheet.getCell('A3').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF1F2937' } };
  sheet.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EFDF' } };
  sheet.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(3).height = 22;
  sheet.getRow(4).height = 8;

  const headers = [
    'Sl.', 'Emp Code', 'Employee Name', 'Branch', 'Department',
    'Policy / Scheme Type', 'Policy No / Identifier', 'Sum Assured (₹)',
    'Monthly Premium / Deduction (₹)', 'Start Date', 'Maturity / Closure', 'Status'
  ];
  const headerRow = sheet.getRow(5);
  headerRow.height = 26;
  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E6251' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  sheet.columns = [
    { width: 6 }, { width: 14 }, { width: 24 }, { width: 22 }, { width: 24 },
    { width: 26 }, { width: 20 }, { width: 18 }, { width: 22 },
    { width: 14 }, { width: 16 }, { width: 12 },
  ];

  reportData.rows.forEach((r, idx) => {
    const row = sheet.getRow(6 + idx);
    row.height = 20;
    row.values = [
      idx + 1, r.empCode, r.employeeName, r.branchName, r.departmentName,
      r.policyType, r.policyNumber, r.sumAssuredAmount, r.monthlyDeduction,
      r.startedDate || r.openingDate || '—', r.maturityDate || r.closureDate || '—', r.status
    ];
    row.font = { name: 'Arial', size: 9 };
    for (let c = 1; c <= 12; c++) {
      const cell = row.getCell(c);
      cell.border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
      if ([1, 2, 10, 11, 12].includes(c)) cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if ([8, 9].includes(c)) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0.00';
      }
    }
  });

  const totalRowNum = 6 + reportData.rows.length;
  const totalRow = sheet.getRow(totalRowNum);
  totalRow.height = 24;
  totalRow.getCell(1).value = 'TOTAL';
  totalRow.getCell(3).value = `[${reportData.rows.length} Policies]`;
  totalRow.getCell(8).value = sum.totalSumAssured;
  totalRow.getCell(9).value = sum.totalMonthlyDeduction;
  totalRow.font = { name: 'Arial', size: 9, bold: true };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  for (let c = 1; c <= 12; c++) {
    const cell = totalRow.getCell(c);
    cell.border = { top: { style: 'medium' }, bottom: { style: 'double' } };
    if ([8, 9].includes(c)) cell.numFmt = '#,##0.00';
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function buildSalaryDataExcelWorkbook(reportData, org) {
  const workbook = new Excel.Workbook();
  workbook.creator = 'UCB HRMS';
  const sheet = workbook.addWorksheet('Master Salary & Deductions', {
    views: [{ state: 'frozen', ySplit: 6 }],
  });

  const p = reportData.period;
  sheet.mergeCells('A1:AA1');
  sheet.getCell('A1').value = (org?.name || 'Urban Co-operative Bank Ltd.').toUpperCase();
  sheet.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E4620' } };
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 28;

  sheet.mergeCells('A2:AA2');
  sheet.getCell('A2').value = `CONSOLIDATED SALARY, ARREARS & DEDUCTIONS REGISTER — Period: ${p.monthName} ${p.year} (Status: ${p.runStatus})`;
  sheet.getCell('A2').font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D6A4F' } };
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 20;

  const sum = reportData.summary;
  sheet.mergeCells('A3:AA3');
  sheet.getCell('A3').value = `Staff: ${sum.employeeCount}  |  Gross Earnings: ₹${fmtNum(sum.totalGrossEarnings)}  |  Total Arrears Disbursed: ₹${fmtNum(sum.totalArrears)}  |  Total Deductions: ₹${fmtNum(sum.totalDeductions)}  |  Net Salary Disbursed: ₹${fmtNum(sum.totalNetPay)}`;
  sheet.getCell('A3').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF1F2937' } };
  sheet.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
  sheet.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(3).height = 22;
  sheet.getRow(4).height = 8;

  // Banded Group Headers (Row 5)
  sheet.mergeCells('A5:E5');
  sheet.getCell('A5').value = '1. EMPLOYEE & ESTABLISHMENT';
  sheet.getCell('A5').font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  sheet.getCell('A5').alignment = { horizontal: 'center' };

  sheet.mergeCells('F5:K5');
  sheet.getCell('F5').value = '2. GROSS EARNINGS & ALLOWANCES';
  sheet.getCell('F5').font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('F5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E6251' } };
  sheet.getCell('F5').alignment = { horizontal: 'center' };

  sheet.mergeCells('L5:L5');
  sheet.getCell('L5').value = '3. ARREARS';
  sheet.getCell('L5').font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('L5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB9770E' } };
  sheet.getCell('L5').alignment = { horizontal: 'center' };

  sheet.mergeCells('M5:M5');
  sheet.getCell('M5').value = 'GROSS PAY';
  sheet.getCell('M5').font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('M5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E4620' } };
  sheet.getCell('M5').alignment = { horizontal: 'center' };

  sheet.mergeCells('N5:Z5');
  sheet.getCell('N5').value = '4. ITEMIZED DEDUCTIONS & RECOVERIES';
  sheet.getCell('N5').font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('N5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF78281F' } };
  sheet.getCell('N5').alignment = { horizontal: 'center' };

  sheet.mergeCells('AA5:AA5');
  sheet.getCell('AA5').value = 'NET PAY';
  sheet.getCell('AA5').font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('AA5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  sheet.getCell('AA5').alignment = { horizontal: 'center' };
  sheet.getRow(5).height = 20;

  // Sub-headers (Row 6)
  const headers = [
    'Sl.', 'Emp Code', 'Employee Name', 'Branch', 'Designation',
    'Basic (₹)', 'DA (₹)', 'HRA (₹)', 'Risk (₹)', 'Other Allw (₹)', 'CCA/Conv (₹)',
    'DA Arrears (₹)', 'Gross (₹)',
    'EPF (₹)', 'VPF (₹)', 'PT (₹)', 'TDS (₹)', 'Welfare (₹)', 'GSLI (₹)', 'LIC (₹)',
    'Fest Adv (₹)', 'Overdraft (₹)', 'House Loan (₹)', 'Veh Loan (₹)', 'RD (₹)', 'Total Deds (₹)',
    'Net Salary (₹)'
  ];

  const headerRow = sheet.getRow(6);
  headerRow.height = 28;
  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF1F2937' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  sheet.columns = [
    { width: 5 }, { width: 13 }, { width: 22 }, { width: 18 }, { width: 18 },
    { width: 13 }, { width: 13 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 12 },
    { width: 14 }, { width: 15 },
    { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 11 }, { width: 10 }, { width: 11 },
    { width: 12 }, { width: 12 }, { width: 13 }, { width: 13 }, { width: 10 }, { width: 15 },
    { width: 16 }
  ];

  reportData.rows.forEach((r, idx) => {
    const row = sheet.getRow(7 + idx);
    row.height = 20;
    row.values = [
      idx + 1, r.empCode, r.employeeName, r.branchName, r.postName,
      r.basic, r.da, r.hra, r.riskAllowance, r.otherAllowance, (r.cca + r.conveyance),
      r.arrearsAmount, r.grossEarnings,
      r.pfEmployee, r.vpf, r.professionalTax, r.incomeTax, r.welfareFund, r.gsli, r.lic,
      r.festivalAdvance, r.overdraft, r.housingLoan, r.vehicleLoan, r.recurringDeposit, r.totalDeductions,
      r.netPay
    ];
    row.font = { name: 'Arial', size: 8.5 };
    for (let c = 1; c <= 27; c++) {
      const cell = row.getCell(c);
      cell.border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
      if ([1, 2].includes(c)) cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (c >= 6) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0.00';
      }
    }
  });

  const totalRowNum = 7 + reportData.rows.length;
  const totalRow = sheet.getRow(totalRowNum);
  totalRow.height = 24;
  totalRow.getCell(1).value = 'TOTAL';
  totalRow.getCell(3).value = `[${reportData.rows.length} Staff]`;
  totalRow.getCell(6).value = sum.totalBasic;
  totalRow.getCell(7).value = sum.totalDa;
  totalRow.getCell(8).value = sum.totalHra;
  totalRow.getCell(12).value = sum.totalArrears;
  totalRow.getCell(13).value = sum.totalGrossEarnings;
  totalRow.getCell(14).value = sum.totalPfEmployee;
  totalRow.getCell(16).value = sum.totalPt;
  totalRow.getCell(17).value = sum.totalTds;
  totalRow.getCell(26).value = sum.totalDeductions;
  totalRow.getCell(27).value = sum.totalNetPay;
  totalRow.font = { name: 'Arial', size: 8.5, bold: true };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
  for (let c = 1; c <= 27; c++) {
    const cell = totalRow.getCell(c);
    cell.border = { top: { style: 'medium' }, bottom: { style: 'double' } };
    if (c >= 6) cell.numFmt = '#,##0.00';
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV FORMATTERS
// ─────────────────────────────────────────────────────────────────────────────

function buildLoansCsv(reportData, org) {
  const columns = [
    { key: '__sl', label: 'Sl No.' },
    { key: 'empCode', label: 'Employee ID' },
    { key: 'employeeName', label: 'Employee Name' },
    { key: 'branchName', label: 'Branch' },
    { key: 'departmentName', label: 'Department' },
    { key: 'loanType', label: 'Loan Type' },
    { key: 'accountOrRef', label: 'Ref / Account' },
    { key: 'sanctionedAmount', label: 'Sanctioned Amount (INR)' },
    { key: 'totalRepayable', label: 'Total Repayable (INR)' },
    { key: 'monthlyInstallment', label: 'Monthly EMI (INR)' },
    { key: 'repaidSoFar', label: 'Repaid So Far (INR)' },
    { key: 'balanceRemaining', label: 'Balance Outstanding (INR)' },
    { key: 'startDate', label: 'Start Date' },
    { key: 'endDate', label: 'End Date' },
    { key: 'status', label: 'Status' },
  ];
  const rows = reportData.rows.map((r, i) => ({ ...r, __sl: i + 1 }));
  const totals = {
    __sl: 'TOTAL',
    empCode: `[${rows.length} Accounts]`,
    sanctionedAmount: reportData.summary.totalPrincipal,
    totalRepayable: reportData.summary.totalRepayable,
    monthlyInstallment: reportData.summary.monthlyRecoveryDemand,
    balanceRemaining: reportData.summary.totalBalanceRemaining,
  };
  return toCsv(rows, columns, {
    title: org?.name || 'Urban Co-operative Bank Ltd.',
    subtitle: 'LOAN PORTFOLIO & RECOVERIES AUDIT REGISTER',
    totals,
    includeBom: true,
  });
}

function buildInsuranceCsv(reportData, org) {
  const columns = [
    { key: '__sl', label: 'Sl No.' },
    { key: 'empCode', label: 'Employee ID' },
    { key: 'employeeName', label: 'Employee Name' },
    { key: 'branchName', label: 'Branch' },
    { key: 'departmentName', label: 'Department' },
    { key: 'policyType', label: 'Policy Type' },
    { key: 'policyNumber', label: 'Policy Number' },
    { key: 'sumAssuredAmount', label: 'Sum Assured (INR)' },
    { key: 'monthlyDeduction', label: 'Monthly Premium / Deduction (INR)' },
    { key: 'startedDate', label: 'Start Date' },
    { key: 'maturityDate', label: 'Maturity Date' },
    { key: 'status', label: 'Status' },
  ];
  const rows = reportData.rows.map((r, i) => ({ ...r, __sl: i + 1 }));
  const totals = {
    __sl: 'TOTAL',
    empCode: `[${rows.length} Policies]`,
    sumAssuredAmount: reportData.summary.totalSumAssured,
    monthlyDeduction: reportData.summary.totalMonthlyDeduction,
  };
  return toCsv(rows, columns, {
    title: org?.name || 'Urban Co-operative Bank Ltd.',
    subtitle: 'STAFF INSURANCE & WELFARE POLICIES REGISTER',
    totals,
    includeBom: true,
  });
}

function buildSalaryDataCsv(reportData, org) {
  const columns = [
    { key: '__sl', label: 'Sl No.' },
    { key: 'empCode', label: 'Employee Code' },
    { key: 'employeeName', label: 'Employee Name' },
    { key: 'branchName', label: 'Branch' },
    { key: 'postName', label: 'Designation' },
    { key: 'bankAccountNumber', label: 'Bank Account' },
    { key: 'bankIfsc', label: 'IFSC' },
    { key: 'basic', label: 'Basic Pay (INR)' },
    { key: 'da', label: 'DA (INR)' },
    { key: 'hra', label: 'HRA (INR)' },
    { key: 'riskAllowance', label: 'Risk Allowance (INR)' },
    { key: 'otherAllowance', label: 'Other Allowance (INR)' },
    { key: 'arrearsAmount', label: 'DA Arrears Disbursed (INR)' },
    { key: 'grossEarnings', label: 'Gross Salary (INR)' },
    { key: 'pfEmployee', label: 'EPF Deduction (INR)' },
    { key: 'vpf', label: 'VPF Deduction (INR)' },
    { key: 'professionalTax', label: 'Professional Tax (INR)' },
    { key: 'incomeTax', label: 'TDS Income Tax (INR)' },
    { key: 'welfareFund', label: 'Welfare Fund (INR)' },
    { key: 'gsli', label: 'GSLI (INR)' },
    { key: 'lic', label: 'LIC Premium (INR)' },
    { key: 'festivalAdvance', label: 'Festival Adv Recovery (INR)' },
    { key: 'overdraft', label: 'Overdraft Recovery (INR)' },
    { key: 'housingLoan', label: 'Housing Loan Recovery (INR)' },
    { key: 'vehicleLoan', label: 'Vehicle Loan Recovery (INR)' },
    { key: 'recurringDeposit', label: 'Recurring Deposit (INR)' },
    { key: 'totalDeductions', label: 'Total Deductions (INR)' },
    { key: 'netPay', label: 'Net Salary (INR)' },
  ];
  const rows = reportData.rows.map((r, i) => ({ ...r, __sl: i + 1 }));
  const sum = reportData.summary;
  const totals = {
    __sl: 'TOTAL',
    empCode: `[${rows.length} Staff]`,
    basic: sum.totalBasic,
    da: sum.totalDa,
    hra: sum.totalHra,
    arrearsAmount: sum.totalArrears,
    grossEarnings: sum.totalGrossEarnings,
    pfEmployee: sum.totalPfEmployee,
    professionalTax: sum.totalPt,
    incomeTax: sum.totalTds,
    totalDeductions: sum.totalDeductions,
    netPay: sum.totalNetPay,
  };
  return toCsv(rows, columns, {
    title: org?.name || 'Urban Co-operative Bank Ltd.',
    subtitle: `MASTER SALARY & DEDUCTIONS REGISTER — Period: ${reportData.period.monthName} ${reportData.period.year}`,
    totals,
    includeBom: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SUMMARY DASHBOARD METRICS
// ─────────────────────────────────────────────────────────────────────────────

async function getReportsSummary({ organizationId, branchId }) {
  const [loans, insurance, salary] = await Promise.all([
    getLoansReport({ organizationId, branchId }),
    getInsuranceReport({ organizationId, branchId }),
    getSalaryDataReport({ organizationId, branchId }),
  ]);

  return {
    loans: loans.summary,
    insurance: insurance.summary,
    salary: salary.summary,
    period: salary.period,
  };
}

module.exports = {
  getLoansReport,
  getInsuranceReport,
  getSalaryDataReport,
  getReportsSummary,
  buildLoansExcelWorkbook,
  buildInsuranceExcelWorkbook,
  buildSalaryDataExcelWorkbook,
  buildLoansCsv,
  buildInsuranceCsv,
  buildSalaryDataCsv,
};
