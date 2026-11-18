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
} = require('../models');

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
async function getDashboardAnalytics(organizationId) {
  const today = todayIST();

  // 1. Fetch active branches
  const branches = await OrganizationBranch.findAll({
    where: { organizationId, status: 'ACTIVE' },
    order: [['displayOrder', 'ASC'], ['id', 'ASC']],
  });

  // 2. Fetch active employees with post cadre info
  const employees = await Employee.findAll({
    where: { organizationId, status: 'ACTIVE' },
    include: [{ model: PostCadre, attributes: ['id', 'code', 'name'] }],
    attributes: ['id', 'empCode', 'name', 'branchId', 'postCadreId', 'employmentStatus', 'employmentType'],
  });

  const employeeMap = new Map();
  const branchMap = new Map();
  branches.forEach((b) => branchMap.set(b.id, b));

  employees.forEach((emp) => {
    employeeMap.set(emp.id, emp);
  });

  const totalEmployeesCount = employees.length;

  // 3. Today's time entries (attendance presence)
  const timeEntries = await EmployeeTimeEntry.findAll({
    where: { organizationId, localDate: today },
    include: [{ model: Employee, attributes: ['id', 'empCode', 'name', 'branchId'] }],
    order: [['checkInAt', 'DESC']],
  });

  const presentEmployeeIds = new Set(timeEntries.map((te) => te.employeeId));

  // 4. Active leaves today
  const activeLeavesToday = await LeaveApplication.findAll({
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

  const onLeaveEmployeeIds = new Set(activeLeavesToday.map((l) => l.employeeId));

  // Count pending leave requests
  const pendingLeavesCount = await LeaveApplication.count({
    where: { status: 'PENDING' },
    include: [{ model: Employee, where: { organizationId } }],
  });

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
  yearLeaves.forEach((al) => {
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
  };
}

module.exports = {
  getDashboardAnalytics,
  ATTENDANCE_COLORS,
  LEAVE_TYPE_PALETTE,
  CADRE_PALETTE,
};
