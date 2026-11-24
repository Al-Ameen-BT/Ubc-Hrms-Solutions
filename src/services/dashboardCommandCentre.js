'use strict';

const percent = (value, total) => (total > 0 ? Math.round((Number(value || 0) / total) * 100) : 0);

function classifyBranchHealth(metrics = {}) {
  const reasons = [];
  const payroll = Number(metrics.payrollReadiness ?? 100);
  const attendance = Number(metrics.attendancePercent ?? 100);
  const shiftAnalyticsAvailable = Boolean(metrics.shiftAnalyticsAvailable);
  const attendanceIssues = Number(metrics.attendanceIssues || 0);
  const complianceIssues = Number(metrics.complianceIssues || 0);

  if (payroll < 80) reasons.push('PAYROLL_BELOW_80');
  if (Number(metrics.overdueMandatoryCompliance || 0) > 0) reasons.push('OVERDUE_MANDATORY_COMPLIANCE');
  if (shiftAnalyticsAvailable && attendance < 75) reasons.push('ATTENDANCE_BELOW_75');
  if (reasons.length) return { status: 'CRITICAL', reasons };

  if (payroll < 90) reasons.push('PAYROLL_BELOW_90');
  if (shiftAnalyticsAvailable && attendance < 85) reasons.push('ATTENDANCE_BELOW_85');
  if (attendanceIssues + complianceIssues >= 3) reasons.push('THREE_OR_MORE_ISSUES');
  if (reasons.length) return { status: 'NEEDS_ATTENTION', reasons };

  if (Number(metrics.vacancies || 0) > 0) reasons.push('VACANCIES');
  if (Number(metrics.unmarked || 0) > 0) reasons.push('UNMARKED_ATTENDANCE');
  if (Number(metrics.payrollBlockers || 0) > 0) reasons.push('PAYROLL_BLOCKERS');
  if (complianceIssues > 0) reasons.push('COMPLIANCE_ALERTS');
  if (metrics.managerAssigned === false) reasons.push('BRANCH_MANAGER_MISSING');
  return reasons.length ? { status: 'WATCH', reasons } : { status: 'HEALTHY', reasons: [] };
}

function distributionRows(rows, total, queryKey) {
  return rows
    .filter((row) => Number(row.count ?? row.value ?? 0) > 0)
    .map((row) => {
      const count = Number(row.count ?? row.value ?? 0);
      return {
        id: row.id ?? row.key ?? null,
        label: row.label,
        count,
        percentage: percent(count, total),
        query: row.id == null ? {} : { [queryKey]: row.id },
      };
    });
}

function groupEmployees(employees, key, label, fallback) {
  const groups = new Map();
  employees.forEach((employee) => {
    const id = key(employee);
    const mapKey = id ?? fallback;
    const current = groups.get(mapKey) || { id: id ?? null, label: label(employee) || fallback, count: 0 };
    current.count += 1;
    groups.set(mapKey, current);
  });
  return [...groups.values()];
}

function normalizedPriority(action) {
  if (action.issueType === 'PAYROLL') return 'CRITICAL';
  if (action.issueType === 'COMPLIANCE' && action.priority === 'HIGH') return 'CRITICAL';
  if (action.priority === 'HIGH') return 'HIGH';
  if (action.priority === 'MEDIUM') return 'MEDIUM';
  return 'ROUTINE';
}

function normalizedCategory(action) {
  if (action.issueType === 'LEAVE') return 'APPROVALS';
  return action.issueType || 'HR';
}

function buildCommandCentre(context) {
  const {
    asOf,
    employees = [],
    branches = [],
    summary,
    actions = [],
    analytics,
    workspaces,
    filterOptions,
    filters = {},
    positions = [],
    assignments = [],
    responsibilities = [],
  } = context;
  const total = employees.length;
  const occupiedByPosition = new Map();
  assignments.forEach((row) => {
    if (row.positionId) occupiedByPosition.set(row.positionId, (occupiedByPosition.get(row.positionId) || 0) + 1);
  });
  const vacancyByBranch = new Map();
  let vacancies = 0;
  positions.forEach((position) => {
    const available = Math.max(0, Number(position.capacity || 1) - (occupiedByPosition.get(position.id) || 0));
    vacancies += available;
    vacancyByBranch.set(position.branchId, (vacancyByBranch.get(position.branchId) || 0) + available);
  });

  const managerByBranch = new Map();
  responsibilities.filter((row) => row.responsibility === 'BRANCH_MANAGER' && row.branchId).forEach((row) => {
    const employee = employees.find((candidate) => Number(candidate.id) === Number(row.employeeId));
    managerByBranch.set(row.branchId, { assigned: true, employeeId: row.employeeId, name: employee?.name || 'Assigned manager' });
  });

  const departmentRows = analytics.headcountByDepartment.map((row) => ({ ...row, count: row.value }));
  const employmentRows = groupEmployees(employees, (row) => row.employmentType || null, (row) => row.employmentType, 'Not classified');
  const cadreRows = groupEmployees(employees, (row) => row.postCadreId || null, (row) => row.PostCadre?.name, 'General staff');
  const gradeRows = groupEmployees(employees, (row) => row.currentPayScaleId || null, (row) => row.currentPayScaleId ? `Pay scale ${row.currentPayScaleId}` : 'Not assigned', 'Not assigned');

  const branchHealth = branches.filter((branch) => branch.id).map((branch) => {
    const branchActions = actions.filter((row) => Number(row.branchId) === Number(branch.id));
    const payrollBlockers = branchActions.filter((row) => row.issueType === 'PAYROLL').length;
    const compliance = branchActions.filter((row) => row.issueType === 'COMPLIANCE');
    const attendanceIssues = branchActions.filter((row) => row.issueType === 'ATTENDANCE').length;
    const payrollReadiness = branch.totalEmployees
      ? Math.round(((branch.totalEmployees - new Set(branchActions.filter((row) => row.issueType === 'PAYROLL').map((row) => row.employeeId)).size) / branch.totalEmployees) * 100)
      : 100;
    const manager = managerByBranch.get(branch.id) || { assigned: false, employeeId: null, name: null };
    const healthMetrics = {
      payrollReadiness,
      attendancePercent: branch.presenceRate,
      shiftAnalyticsAvailable: Boolean(analytics.shiftAnalyticsAvailable),
      attendanceIssues,
      complianceIssues: compliance.length,
      overdueMandatoryCompliance: compliance.filter((row) => row.priority === 'HIGH' && row.dueDate && row.dueDate < asOf).length,
      vacancies: vacancyByBranch.get(branch.id) || 0,
      unmarked: branch.absentToday,
      payrollBlockers,
      managerAssigned: manager.assigned,
    };
    return {
      branchId: branch.id,
      code: branch.code,
      name: branch.name,
      employees: branch.totalEmployees,
      presentPercent: branch.presenceRate,
      onLeave: branch.onLeaveToday,
      vacancies: healthMetrics.vacancies,
      attendanceIssues,
      complianceIssues: compliance.length,
      payrollReadiness,
      manager,
      health: classifyBranchHealth(healthMetrics),
    };
  });

  const safeActions = actions.map((action) => ({
    id: action.id,
    category: normalizedCategory(action),
    priority: normalizedPriority(action),
    employeeId: action.employeeId,
    employeeName: action.employeeName,
    empCode: action.empCode,
    branchId: action.branchId,
    branchName: action.branchName,
    departmentId: action.departmentId,
    departmentName: action.departmentName,
    problem: action.details,
    dueDate: action.dueDate || null,
    owner: action.owner,
    status: action.status,
    actionLabel: action.actionLabel,
    destination: action.destination,
    quickAction: action.issueType === 'LEAVE' ? 'LEAVE_DECISION' : null,
  }));

  const missingManagers = branchHealth.filter((row) => !row.manager.assigned).map((row) => ({
    id: `branch-manager-${row.branchId}`,
    type: 'BRANCH_MANAGER_MISSING',
    branchId: row.branchId,
    label: `${row.name} has no current branch manager`,
    destination: '/organisation-structure',
  }));

  return {
    schemaVersion: 1,
    overview: {
      totalWorkforce: { value: total, destination: '/people' },
      presentToday: { value: summary.attendance.present, percentage: summary.attendance.percentage, destination: '/employee-services/time' },
      onLeave: { value: summary.attendance.onLeave, destination: '/leave' },
      openPositions: { value: vacancies, destination: '/organisation-structure?view=vacancies' },
      payrollReadiness: { value: summary.payroll.readinessPercent, suffix: '%', destination: '/payroll' },
      hrActions: { value: safeActions.length, critical: safeActions.filter((row) => row.priority === 'CRITICAL').length, destination: '#action-centre' },
    },
    distribution: {
      branch: distributionRows(analytics.headcountByBranch.map((row) => ({ ...row, count: row.value })), total, 'branchId'),
      department: distributionRows(departmentRows, total, 'departmentId'),
      employmentType: distributionRows(employmentRows, total, 'employmentType'),
      cadre: distributionRows(cadreRows, total, 'cadreId'),
      grade: distributionRows(gradeRows, total, 'payScaleId'),
    },
    attendance: {
      statuses: analytics.attendanceStatus.map((row) => ({ key: row.key, label: row.label, count: row.value, percentage: percent(row.value, total) })),
      exceptions: analytics.attendanceExceptions,
      branchExceptions: branchHealth.filter((row) => row.attendanceIssues > 0).sort((a, b) => b.attendanceIssues - a.attendanceIssues).slice(0, 5).map((row) => ({ branchId: row.branchId, name: row.name, count: row.attendanceIssues })),
      trend: analytics.attendanceTrend,
      shiftAnalyticsAvailable: Boolean(analytics.shiftAnalyticsAvailable),
    },
    branchHealth,
    actions: safeActions,
    explorer: {
      totals: {
        employees: total,
        branches: branchHealth.length,
        vacancies,
        managersAssigned: branchHealth.filter((row) => row.manager.assigned).length,
      },
      branches: branchHealth.map((row) => ({ branchId: row.branchId, code: row.code, name: row.name, employees: row.employees, vacancies: row.vacancies, health: row.health.status })),
    },
    movement: analytics.monthlyMovements,
    payrollReadiness: { ...summary.payroll, stages: analytics.payrollReadiness.stages },
    setupIssues: missingManagers,
    filterOptions,
    appliedFilters: {
      branchId: filters.branchId ? Number(filters.branchId) : null,
      departmentId: filters.departmentId ? Number(filters.departmentId) : null,
      employmentType: filters.employmentType || null,
      search: filters.search || '',
      date: filters.date || asOf,
    },
    asOf,
  };
}

module.exports = { buildCommandCentre, classifyBranchHealth };
