'use strict';

const { Op } = require('sequelize');
const { todayIST } = require('./orgAccess');
const {
  Employee,
  OrganizationBranch,
  EmployeeTimeEntry,
  LeaveApplication,
  LeaveType,
  EmployeeServiceHistory,
  PostCadre,
  EmployeeTransfer,
  PayrollRun,
} = require('../models');

function workingDates(endDate, count) {
  const dates = [];
  const cursor = new Date(`${endDate}T12:00:00+05:30`);
  while (dates.length < count) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) dates.unshift(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() - 1);
  }
  return dates;
}

function daysBetween(fromDate, toDate) {
  return Math.ceil((new Date(`${toDate}T00:00:00Z`) - new Date(`${fromDate}T00:00:00Z`)) / 86400000);
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

// Vibrant, contrasting color palettes for charts
const ATTENDANCE_COLORS = {
  present: '#10B981',   // Emerald Green
  onLeave: '#F59E0B',   // Amber Gold
  absent: '#EF4444',    // Crimson Red
  weeklyOff: '#6366F1', // Indigo Blue
};

const LEAVE_TYPE_PALETTE = [
  '#3B82F6', // Royal Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink / Rose
  '#10B981', // Emerald
  '#F97316', // Orange
  '#06B6D4', // Cyan
  '#EAB308', // Yellow
  '#64748B', // Slate
];

const CADRE_PALETTE = [
  '#6366F1', // Indigo
  '#06B6D4', // Cyan
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#3B82F6', // Blue
  '#14B8A6', // Teal
];

/**
 * Returns comprehensive operational analytics for an organisation:
 * - Branch-level breakdown (employees, presents, leaves, attendance rate)
 * - Attendance presence breakdown (pie chart data, recent check-ins)
 * - Leave metrics (pie chart of types, pending approvals, active leaves)
 * - Promotion and cadre distribution (pie chart of designations, recent career events)
 */
async function getDashboardAnalytics(organizationId, filters = {}) {
  const today = filters.date || todayIST();

  // 1. Fetch active branches
  const branches = await OrganizationBranch.findAll({
    where: { organizationId, status: 'ACTIVE' },
    order: [['displayOrder', 'ASC'], ['id', 'ASC']],
  });

  // 2. Fetch active employees with post cadre info
  const allEmployees = await Employee.findAll({
    where: { organizationId, status: 'ACTIVE' },
    include: [{ model: PostCadre, attributes: ['id', 'code', 'name'] }],
    attributes: [
      'id', 'empCode', 'name', 'branchId', 'departmentId', 'department', 'postCadreId',
      'employmentStatus', 'employmentType', 'doj', 'dateOfConfirmation',
      'educationalQualification', 'panNumber', 'aadhaarNumber', 'bankName',
      'bankAccountNumber', 'bankIfsc', 'currentPayScaleId', 'currentStageId', 'currentBasicPay',
    ],
  });

  const search = String(filters.search || '').trim().toLowerCase();
  const employees = allEmployees.filter((employee) => (
    (!filters.branchId || Number(employee.branchId) === Number(filters.branchId))
    && (!filters.departmentId || Number(employee.departmentId) === Number(filters.departmentId))
    && (!filters.employmentType || employee.employmentType === filters.employmentType)
    && (!search || employee.name.toLowerCase().includes(search) || employee.empCode.toLowerCase().includes(search))
  ));

  const employeeMap = new Map();
  const branchMap = new Map();
  branches.forEach((b) => branchMap.set(b.id, b));

  employees.forEach((emp) => {
    employeeMap.set(emp.id, emp);
  });

  const totalEmployeesCount = employees.length;

  // 3. Today's time entries (attendance presence)
  const allTimeEntries = await EmployeeTimeEntry.findAll({
    where: { organizationId, localDate: today },
    include: [{ model: Employee, attributes: ['id', 'empCode', 'name', 'branchId'] }],
    order: [['checkInAt', 'DESC']],
  });
  const scopedEmployeeIds = new Set(employees.map((employee) => employee.id));
  const timeEntries = allTimeEntries.filter((entry) => scopedEmployeeIds.has(entry.employeeId));

  const presentEmployeeIds = new Set(timeEntries.map((te) => te.employeeId));

  // 4. Active leaves today
  const allActiveLeavesToday = await LeaveApplication.findAll({
    where: {
      status: 'APPROVED',
      fromDate: { [Op.lte]: today },
      toDate: { [Op.gte]: today },
    },
    include: [
      {
        model: Employee,
        where: { organizationId },
        attributes: ['id', 'empCode', 'name', 'branchId'],
      },
      {
        model: LeaveType,
        attributes: ['id', 'code', 'name'],
      },
    ],
  });
  const activeLeavesToday = allActiveLeavesToday.filter((leave) => scopedEmployeeIds.has(leave.employeeId));

  const onLeaveEmployeeIds = new Set(activeLeavesToday.map((l) => l.employeeId));

  // Count pending leave requests and retain the employee rows for the action queue.
  const pendingLeaves = await LeaveApplication.findAll({
    where: { status: 'PENDING' },
    include: [
      { model: Employee, where: { organizationId }, attributes: ['id', 'empCode', 'name', 'branchId', 'departmentId', 'department'] },
      { model: LeaveType, attributes: ['id', 'code', 'name'] },
    ],
    order: [['fromDate', 'ASC'], ['id', 'ASC']],
  });
  const scopedPendingLeaves = pendingLeaves.filter((leave) => scopedEmployeeIds.has(leave.employeeId));
  const pendingLeavesCount = scopedPendingLeaves.length;

  // Count leaves grouped by type for this organization (all applications or current year)
  const currentYearStart = `${today.slice(0, 4)}-01-01`;
  const yearLeaves = await LeaveApplication.findAll({
    where: {
      fromDate: { [Op.gte]: currentYearStart },
      status: { [Op.in]: ['APPROVED', 'PENDING'] },
    },
    include: [
      { model: Employee, where: { organizationId }, attributes: ['id'] },
      { model: LeaveType, attributes: ['id', 'code', 'name'] },
    ],
  });

  const leaveTypeCountMap = new Map();
  yearLeaves.filter((leave) => scopedEmployeeIds.has(leave.employeeId)).forEach((al) => {
    const typeName = al.LeaveType?.name || 'General Leave';
    leaveTypeCountMap.set(typeName, (leaveTypeCountMap.get(typeName) || 0) + 1);
  });

  // 5. Promotion & Service Events
  const recentServiceEvents = await EmployeeServiceHistory.findAll({
    where: {
      eventType: { [Op.in]: ['PROMOTION', 'INCREMENT', 'CONFIRMATION', 'HIGHER_GRADE'] },
    },
    include: [
      {
        model: Employee,
        where: { organizationId },
        attributes: ['id', 'empCode', 'name', 'branchId', 'postCadreId'],
        include: [{ model: PostCadre, attributes: ['id', 'code', 'name'] }],
      },
    ],
    order: [['eventDate', 'DESC'], ['id', 'DESC']],
    limit: 8,
  });

  // 6. Cadre distribution
  const cadreCountMap = new Map();
  employees.forEach((emp) => {
    const postName = emp.PostCadre?.name || 'General Staff';
    cadreCountMap.set(postName, (cadreCountMap.get(postName) || 0) + 1);
  });

  // 7. Compute Branch-by-Branch breakdown
  const branchStats = branches.map((branch) => {
    const branchEmployees = employees.filter((e) => e.branchId === branch.id);
    const branchTotal = branchEmployees.length;
    const branchPresent = branchEmployees.filter((e) => presentEmployeeIds.has(e.id)).length;
    const branchOnLeave = branchEmployees.filter((e) => onLeaveEmployeeIds.has(e.id)).length;
    const branchAbsent = Math.max(0, branchTotal - branchPresent - branchOnLeave);
    const rate = branchTotal > 0 ? Math.round((branchPresent / branchTotal) * 100) : 0;

    return {
      id: branch.id,
      name: branch.name,
      code: branch.code || `BR-${branch.id}`,
      unitType: branch.unitType || 'BRANCH',
      isHeadOffice: Boolean(branch.isHeadOffice),
      totalEmployees: branchTotal,
      presentToday: branchPresent,
      onLeaveToday: branchOnLeave,
      absentToday: branchAbsent,
      presenceRate: rate,
    };
  });

  // Unassigned employees if any
  const unassignedEmployees = employees.filter((e) => !e.branchId);
  if (unassignedEmployees.length > 0) {
    const unTotal = unassignedEmployees.length;
    const unPresent = unassignedEmployees.filter((e) => presentEmployeeIds.has(e.id)).length;
    const unLeave = unassignedEmployees.filter((e) => onLeaveEmployeeIds.has(e.id)).length;
    branchStats.push({
      id: 0,
      name: 'Unassigned / Head Office Staff',
      code: 'UNASSIGNED',
      unitType: 'BRANCH',
      isHeadOffice: false,
      totalEmployees: unTotal,
      presentToday: unPresent,
      onLeaveToday: unLeave,
      absentToday: Math.max(0, unTotal - unPresent - unLeave),
      presenceRate: unTotal > 0 ? Math.round((unPresent / unTotal) * 100) : 0,
    });
  }

  // 8. Overall Attendance Summary
  const overallPresent = employees.filter((e) => presentEmployeeIds.has(e.id)).length;
  const overallOnLeave = employees.filter((e) => onLeaveEmployeeIds.has(e.id)).length;
  const overallAbsent = Math.max(0, totalEmployeesCount - overallPresent - overallOnLeave);
  const overallPresenceRate = totalEmployeesCount > 0
    ? Math.round((overallPresent / totalEmployeesCount) * 100)
    : 0;

  // Attendance Pie Chart data
  const attendancePieChart = [
    { label: 'Present Today', value: overallPresent, color: ATTENDANCE_COLORS.present },
    { label: 'On Approved Leave', value: overallOnLeave, color: ATTENDANCE_COLORS.onLeave },
    { label: 'Absent / Unmarked', value: overallAbsent, color: ATTENDANCE_COLORS.absent },
  ];

  // Recent check-in entries
  const recentCheckIns = timeEntries.slice(0, 6).map((te) => {
    const emp = te.Employee;
    const br = emp?.branchId ? branchMap.get(emp.branchId) : null;
    return {
      id: te.id,
      empCode: emp?.empCode || '—',
      name: emp?.name || 'Staff',
      branchName: br?.name || 'Main Office',
      checkInTime: te.checkInAt ? new Date(te.checkInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—',
      checkOutTime: te.checkOutAt ? new Date(te.checkOutAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null,
    };
  });

  // 9. Leave Types Pie Chart data
  let leaveTypePieChart = Array.from(leaveTypeCountMap.entries()).map(([label, value], idx) => ({
    label,
    value,
    color: LEAVE_TYPE_PALETTE[idx % LEAVE_TYPE_PALETTE.length],
  }));

  // If no leave applications have been submitted yet, provide sensible default categories so the chart displays
  if (leaveTypePieChart.length === 0) {
    leaveTypePieChart = [
      { label: 'Casual Leave (CL)', value: 0, color: '#3B82F6' },
      { label: 'Privilege / Earned (PL)', value: 0, color: '#8B5CF6' },
      { label: 'Medical / Sick (SL)', value: 0, color: '#EC4899' },
      { label: 'Maternity / Special', value: 0, color: '#10B981' },
      { label: 'Loss of Pay (LOP)', value: 0, color: '#F97316' },
    ];
  }

  // Active leaves list today
  const activeLeavesList = activeLeavesToday.map((al) => {
    const emp = al.Employee;
    const br = emp?.branchId ? branchMap.get(emp.branchId) : null;
    return {
      id: al.id,
      empCode: emp?.empCode || '—',
      name: emp?.name || 'Staff',
      branchName: br?.name || 'Main Office',
      leaveType: al.LeaveType?.name || 'Leave',
      days: Number(al.days) || 1,
      fromDate: al.fromDate,
      toDate: al.toDate,
    };
  });

  // 10. Cadre Distribution Pie Chart data
  let cadrePieChart = Array.from(cadreCountMap.entries()).map(([label, value], idx) => ({
    label,
    value,
    color: CADRE_PALETTE[idx % CADRE_PALETTE.length],
  }));

  if (cadrePieChart.length === 0) {
    cadrePieChart = [
      { label: 'Officers', value: 0, color: '#6366F1' },
      { label: 'Clerical Staff', value: 0, color: '#06B6D4' },
      { label: 'Subordinate Staff', value: 0, color: '#10B981' },
    ];
  }

  // 11. Promotions & Career Milestones list
  const promotionEvents = recentServiceEvents.map((se) => {
    const emp = se.Employee;
    const br = emp?.branchId ? branchMap.get(emp.branchId) : null;
    return {
      id: se.id,
      eventType: se.eventType,
      eventDate: se.eventDate,
      empCode: emp?.empCode || '—',
      name: emp?.name || 'Staff',
      branchName: br?.name || 'Main Office',
      cadre: emp?.PostCadre?.name || 'Cadre',
      remarks: se.remarks || `${se.eventType} approved`,
      orderRef: se.orderRef || null,
    };
  });

  const branchName = (employee) => employee.branchId ? branchMap.get(employee.branchId)?.name || employee.branchName || 'Branch not mapped' : 'Head Office / Unassigned';
  const departmentName = (employee) => employee.department || 'Department not assigned';
  const actionFor = (employee, values) => ({
    employeeId: employee.id,
    employeeName: employee.name,
    empCode: employee.empCode,
    branchId: employee.branchId || null,
    branchName: branchName(employee),
    departmentId: employee.departmentId || null,
    departmentName: departmentName(employee),
    owner: 'HR Admin',
    status: 'OPEN',
    ...values,
  });

  const unmarkedEmployees = employees.filter((employee) => !presentEmployeeIds.has(employee.id) && !onLeaveEmployeeIds.has(employee.id));
  const attendanceExceptions = unmarkedEmployees.map((employee) => actionFor(employee, {
    id: `attendance-unmarked-${employee.id}`,
    priority: 'MEDIUM',
    issueType: 'ATTENDANCE',
    details: 'Attendance is not marked. No shift schedule is configured, so absence is not inferred.',
    reason: 'Attendance not marked',
    scheduledShift: 'Not configured',
    lateThreshold: 'Not configured',
    firstCheckIn: null,
    lastCheckOut: null,
    manager: 'Reporting manager not assigned',
    actionLabel: 'Review',
    destination: '/time',
  }));

  const leaveApprovals = scopedPendingLeaves.map((leave) => actionFor(leave.Employee, {
    id: `leave-${leave.id}`,
    priority: leave.fromDate <= today ? 'HIGH' : 'MEDIUM',
    issueType: 'LEAVE',
    details: `${leave.LeaveType?.name || 'Leave'} from ${leave.fromDate} to ${leave.toDate}`,
    owner: 'Reporting manager',
    status: 'PENDING_APPROVAL',
    dueDate: leave.fromDate,
    actionLabel: 'Review request',
    destination: '/leave',
  }));

  const payrollBlockers = employees.flatMap((employee) => {
    const missing = [];
    if (!employee.bankName || !employee.bankAccountNumber || !employee.bankIfsc) missing.push('salary bank account');
    if (!employee.currentPayScaleId || !employee.currentStageId || employee.currentBasicPay == null) missing.push('pay-scale assignment');
    if (!missing.length) return [];
    return [actionFor(employee, {
      id: `payroll-${employee.id}`,
      priority: 'HIGH',
      issueType: 'PAYROLL',
      details: `Missing ${missing.join(' and ')}`,
      owner: 'Payroll Officer',
      actionLabel: 'Fix record',
      destination: `/people/${employee.id}`,
    })];
  });

  const complianceAlerts = employees.flatMap((employee) => {
    const missing = [];
    if (!employee.educationalQualification) missing.push('education qualification verification');
    if (!employee.panNumber || !employee.aadhaarNumber) missing.push('identity/KYC details');
    const probationDue = employee.dateOfConfirmation ? null : addDays(employee.doj, 365);
    if (probationDue && daysBetween(today, probationDue) <= 30) missing.push(probationDue < today ? 'probation confirmation overdue' : 'probation confirmation due');
    if (!missing.length) return [];
    return [actionFor(employee, {
      id: `compliance-${employee.id}`,
      priority: probationDue && probationDue < today ? 'HIGH' : 'MEDIUM',
      issueType: 'COMPLIANCE',
      details: missing.join(', '),
      dueDate: probationDue && daysBetween(today, probationDue) <= 30 ? probationDue : null,
      actionLabel: 'Review record',
      destination: `/people/${employee.id}`,
    })];
  });

  const onboardingRows = employees.filter((employee) => !employee.branchId || !employee.departmentId).map((employee) => actionFor(employee, {
    id: `onboarding-${employee.id}`,
    priority: 'MEDIUM',
    issueType: 'ONBOARDING',
    details: !employee.branchId ? 'Branch assignment is required' : 'Department assignment is required',
    actionLabel: 'Complete record',
    destination: `/people/${employee.id}`,
  }));

  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const actions = [...attendanceExceptions, ...leaveApprovals, ...complianceAlerts, ...payrollBlockers, ...onboardingRows]
    .sort((left, right) => (priorityOrder[left.priority] ?? 9) - (priorityOrder[right.priority] ?? 9) || left.employeeName.localeCompare(right.employeeName));

  const trendDates = workingDates(today, 7);
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEndValue = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0));
  const monthEnd = monthEndValue.toISOString().slice(0, 10);
  const [trendEntries, payrollRun, transfersThisMonth] = await Promise.all([
    EmployeeTimeEntry.findAll({
      where: { organizationId, localDate: { [Op.in]: trendDates }, employeeId: { [Op.in]: [...scopedEmployeeIds] } },
      attributes: ['employeeId', 'localDate'],
    }),
    PayrollRun.findOne({ where: { organizationId, year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }, order: [['id', 'DESC']] }),
    scopedEmployeeIds.size ? EmployeeTransfer.count({
      where: { organizationId, employeeId: { [Op.in]: [...scopedEmployeeIds] }, status: 'ACTIVATED', effectiveDate: { [Op.between]: [monthStart, monthEnd] } },
    }) : 0,
  ]);
  const attendanceTrend = trendDates.map((date) => ({
    date,
    present: new Set(trendEntries.filter((entry) => entry.localDate === date).map((entry) => entry.employeeId)).size,
    total: employees.length,
  }));
  const departmentCounts = new Map();
  employees.forEach((employee) => departmentCounts.set(departmentName(employee), (departmentCounts.get(departmentName(employee)) || 0) + 1));
  const leaveDistribution = Array.from(leaveTypeCountMap.entries()).map(([label, value]) => ({ label, value }));
  const recordsNeedingReview = new Set(payrollBlockers.map((row) => row.employeeId)).size;
  const payrollReadiness = employees.length ? Math.round(((employees.length - recordsNeedingReview) / employees.length) * 100) : 100;
  const urgentLeaves = leaveApprovals.filter((row) => row.priority === 'HIGH').length;
  const probationDue = complianceAlerts.filter((row) => /probation/i.test(row.details)).length;

  const departmentOptions = new Map();
  allEmployees.forEach((employee) => {
    if (employee.departmentId) departmentOptions.set(employee.departmentId, employee.department || `Department ${employee.departmentId}`);
  });

  const summary = {
    attendance: {
      total: employees.length,
      present: overallPresent,
      percentage: overallPresenceRate,
      onLeave: overallOnLeave,
      unmarked: unmarkedEmployees.length,
      absent: 0,
      late: 0,
      missingCheckOut: 0,
      shiftMismatch: 0,
      shiftConfigured: false,
    },
    attendanceExceptions: { total: attendanceExceptions.length, critical: 0, needsReview: attendanceExceptions.length },
    leave: { pending: leaveApprovals.length, urgent: urgentLeaves },
    payroll: {
      readinessPercent: payrollReadiness,
      totalEmployees: employees.length,
      recordsNeedingReview,
      deadline: monthEnd,
      cycleStatus: payrollRun?.status || 'NOT_STARTED',
    },
    compliance: { alerts: complianceAlerts.length, overdue: complianceAlerts.filter((row) => row.priority === 'HIGH').length },
  };

  const alerts = [
    { id: 'leave', label: 'Leave approvals awaiting manager decision', count: leaveApprovals.length, urgency: urgentLeaves ? 'HIGH' : 'NORMAL', dueDate: urgentLeaves ? today : null, destination: '/leave' },
    { id: 'attendance', label: 'Attendance regularisation requests', count: attendanceExceptions.length, urgency: attendanceExceptions.length ? 'MEDIUM' : 'NORMAL', dueDate: attendanceExceptions.length ? today : null, destination: '/time' },
    { id: 'onboarding', label: 'Employee onboarding tasks', count: onboardingRows.length, urgency: onboardingRows.length ? 'MEDIUM' : 'NORMAL', dueDate: null, destination: '/people' },
    { id: 'probation', label: 'Probation confirmations due', count: probationDue, urgency: probationDue ? 'HIGH' : 'NORMAL', dueDate: null, destination: '/people' },
    { id: 'documents', label: 'Compliance and document alerts', count: complianceAlerts.length, urgency: summary.compliance.overdue ? 'HIGH' : 'MEDIUM', dueDate: null, destination: '/dpdp-compliance' },
    { id: 'payroll', label: 'Payroll data blockers', count: payrollBlockers.length, urgency: payrollBlockers.length ? 'HIGH' : 'NORMAL', dueDate: monthEnd, destination: '/payroll' },
  ];

  const filterOptions = {
    branches: branches.map((branch) => ({ id: branch.id, code: branch.code, name: branch.name })),
    departments: Array.from(departmentOptions, ([id, name]) => ({ id, name })),
    employmentTypes: [...new Set(allEmployees.map((employee) => employee.employmentType))],
    shifts: [],
  };

  const operationalAnalytics = {
    attendanceTrend,
    lateArrivalTrend: trendDates.map((date) => ({ date, value: 0 })),
    shiftAnalyticsAvailable: false,
    headcountByBranch: branchStats.filter((branch) => branch.totalEmployees > 0).map((branch) => ({ label: branch.name, value: branch.totalEmployees })),
    headcountByDepartment: Array.from(departmentCounts, ([label, value]) => ({ label, value })),
    leaveDistribution,
    monthlyMovements: {
      joiners: employees.filter((employee) => String(employee.doj).startsWith(today.slice(0, 7))).length,
      exits: 0,
      exitsAvailable: false,
      transfers: transfersThisMonth,
      probationCompletions: employees.filter((employee) => String(employee.dateOfConfirmation || '').startsWith(today.slice(0, 7))).length,
    },
  };

  const workspaces = {
    attendanceExceptions,
    pendingApprovals: leaveApprovals,
    payrollBlockers,
    onboardingOffboarding: onboardingRows,
    complianceAlerts,
    branchReadiness: branchStats.map((branch) => ({
      id: branch.id,
      name: branch.name,
      code: branch.code,
      isHeadOffice: branch.isHeadOffice,
      employees: branch.totalEmployees,
      present: branch.presentToday,
      onLeave: branch.onLeaveToday,
      unmarked: branch.absentToday,
    })),
  };

  return {
    asOfDate: today,
    totalEmployees: totalEmployeesCount,
    totalBranches: branches.length,
    branches: branchStats,
    attendance: {
      totalEmployees: totalEmployeesCount,
      presentToday: overallPresent,
      onLeaveToday: overallOnLeave,
      absentToday: overallAbsent,
      presenceRate: overallPresenceRate,
      pieChartData: attendancePieChart,
      recentCheckIns,
    },
    leaves: {
      pendingApprovalsCount: pendingLeavesCount,
      activeLeavesTodayCount: overallOnLeave,
      activeLeavesList,
      pieChartData: leaveTypePieChart,
    },
    promotions: {
      recentEvents: promotionEvents,
      cadrePieChart,
    },
    summary,
    actions,
    alerts,
    analytics: operationalAnalytics,
    workspaces,
    filterOptions,
  };
}

module.exports = {
  getDashboardAnalytics,
  ATTENDANCE_COLORS,
  LEAVE_TYPE_PALETTE,
  CADRE_PALETTE,
};
