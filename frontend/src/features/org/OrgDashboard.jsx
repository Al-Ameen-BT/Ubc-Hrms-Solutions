import React, { useDeferredValue, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { orgApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { DashboardError, DashboardSkeleton } from '../dashboard/DashboardPrimitives';
import { WorkforceInsights } from '../dashboard/WorkforceInsights';
import { dashboardParams, nextTabIndex, prioritiseActions } from '../dashboard/dashboardModel';
import '../dashboard/Dashboard.css';

const TABS = [
  { id: 'attendance', label: 'Attendance Exceptions', dataKey: 'attendanceExceptions' },
  { id: 'approvals', label: 'Pending Approvals', dataKey: 'pendingApprovals' },
  { id: 'payroll', label: 'Payroll Blockers', dataKey: 'payrollBlockers' },
  { id: 'onboarding', label: 'Onboarding & Offboarding', dataKey: 'onboardingOffboarding' },
  { id: 'compliance', label: 'Compliance Alerts', dataKey: 'complianceAlerts' },
  { id: 'branches', label: 'Branch Readiness', dataKey: 'branchReadiness' },
];

const statusLabel = { OPEN: 'Needs review', PENDING_APPROVAL: 'Pending approval', COMPLETED: 'Completed' };

function indiaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function displayDate(value) {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(`${value}T12:00:00+05:30`));
}

function currentTime(value) {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).format(value);
}

function destinationFor(row) {
  if (row.destination?.startsWith('/people/')) return row.destination.replace('/people/', '/employees/');
  return row.destination || '/people';
}

export function OrgDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filters, setFilters] = useState({ date: indiaDate(), branchId: '', departmentId: '', employmentType: '', shiftId: '', search: '' });
  const deferredSearch = useDeferredValue(filters.search);
  const [activeTab, setActiveTab] = useState('attendance');
  const [now, setNow] = useState(new Date());
  const params = dashboardParams({ ...filters, search: deferredSearch, shiftId: '' });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const dashboardQuery = useQuery({ queryKey: ['org-dashboard-analytics', params], queryFn: () => orgApi.dashboardAnalytics(params), refetchInterval: 30000 });
  const data = dashboardQuery.data;
  const summary = data?.summary || {};
  const attendance = summary.attendance || {};
  const payroll = summary.payroll || {};
  const workspaces = data?.workspaces || {};
  const filterOptions = data?.filterOptions || {};
  const actions = prioritiseActions(data?.actions || []).slice(0, 10);
  const tabCounts = Object.fromEntries(TABS.map((tab) => [tab.id, workspaces[tab.dataKey]?.length || 0]));
  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const openTab = (tab) => {
    setActiveTab(tab);
    requestAnimationFrame(() => document.getElementById('dashboard-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const handleTabKeyDown = (event, index) => {
    const nextIndex = nextTabIndex(index, event.key, TABS.length);
    if (nextIndex === index) return;
    event.preventDefault();
    setActiveTab(TABS[nextIndex].id);
    requestAnimationFrame(() => event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[nextIndex]?.focus());
  };

  if (dashboardQuery.isLoading && !data) return <DashboardSkeleton />;

  const kpis = [
    { id: 'present', label: 'Present Today', value: `${attendance.present || 0} / ${attendance.total || 0}`, meta: `${attendance.percentage || 0}% attendance`, detail: `${attendance.late || 0} late · ${attendance.unmarked || 0} unmarked · ${attendance.onLeave || 0} on leave`, tone: attendance.percentage >= 85 ? 'success' : attendance.percentage >= 65 ? 'warning' : 'danger', action: () => navigate('/employee-services/time') },
    { id: 'exceptions', label: 'Attendance Exceptions', value: summary.attendanceExceptions?.total || 0, meta: summary.attendanceExceptions?.critical ? `${summary.attendanceExceptions.critical} critical` : 'Needs review', detail: `${attendance.unmarked || 0} not checked-in · ${attendance.late || 0} late · ${attendance.missingCheckOut || 0} missing check-out · ${attendance.shiftMismatch || 0} shift mismatch`, tone: summary.attendanceExceptions?.total ? 'danger' : 'success', action: () => openTab('attendance') },
    { id: 'leave', label: 'Leave Pending Approval', value: summary.leave?.pending || 0, meta: `${summary.leave?.urgent || 0} urgent`, detail: 'Manager decision queue', tone: summary.leave?.urgent ? 'danger' : summary.leave?.pending ? 'warning' : 'success', action: () => openTab('approvals') },
    { id: 'payroll', label: 'Payroll Readiness', value: `${payroll.readinessPercent ?? 100}%`, meta: `${payroll.recordsNeedingReview || 0} employee records need review`, detail: `${String(payroll.cycleStatus || 'NOT_STARTED').replace(/_/g, ' ')} · deadline ${displayDate(payroll.deadline)}`, tone: payroll.readinessPercent >= 90 ? 'success' : payroll.readinessPercent >= 70 ? 'warning' : 'danger', action: () => openTab('payroll') },
    { id: 'compliance', label: 'Compliance / Document Alerts', value: summary.compliance?.alerts || 0, meta: `${summary.compliance?.overdue || 0} overdue`, detail: 'Identity, qualification and probation checks', tone: summary.compliance?.overdue ? 'danger' : summary.compliance?.alerts ? 'warning' : 'success', action: () => openTab('compliance') },
  ];

  return <div className="page dashboard-page hr-dashboard">
    <header className="hr-dashboard-header">
      <div><h1>HR Operations</h1><p>Resolve today’s people, attendance, leave, payroll and compliance work.</p></div>
      <div className="hr-dashboard-now" aria-label={`Today ${displayDate(indiaDate())}, current time ${currentTime(now)}`}><strong>Today: {displayDate(indiaDate())}</strong><span>Current time: {currentTime(now)}</span></div>
      <div className="hr-dashboard-utilities">
        <Button variant="secondary" size="sm" aria-label="View approvals and alerts" onClick={() => document.getElementById('dashboard-alerts')?.scrollIntoView({ behavior: 'smooth' })}><span className="hr-bell" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4.5 8a5.5 5.5 0 0 1 11 0v3.3l1.5 2.2H3l1.5-2.2V8ZM8 16h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>Alerts</Button>
        <Button variant="secondary" size="sm" onClick={() => navigate('/account')}>{user?.name || 'My profile'}</Button>
      </div>
    </header>

    <section className="hr-dashboard-filters" aria-label="Dashboard filters">
      <FilterSelect label="Organisation" value="ALL" disabled><option value="ALL">All Staff</option></FilterSelect>
      <label><span>Date</span><input className="input" type="date" value={filters.date} onChange={(event) => updateFilter('date', event.target.value)} /></label>
      <FilterSelect label="Branch" value={filters.branchId} onChange={(event) => updateFilter('branchId', event.target.value)}><option value="">All branches</option>{(filterOptions.branches || []).map((row) => <option key={row.id} value={row.id}>{row.code} — {row.name}</option>)}</FilterSelect>
      <FilterSelect label="Department" value={filters.departmentId} onChange={(event) => updateFilter('departmentId', event.target.value)}><option value="">All departments</option>{(filterOptions.departments || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</FilterSelect>
      <FilterSelect label="Employment type" value={filters.employmentType} onChange={(event) => updateFilter('employmentType', event.target.value)}><option value="">All types</option>{(filterOptions.employmentTypes || []).map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}</FilterSelect>
      <FilterSelect label="Shift" value="" disabled title="Shift scheduling is not configured"><option value="">Not configured</option></FilterSelect>
      <label className="hr-dashboard-search"><span>Search employee</span><input className="input" type="search" value={filters.search} placeholder="Name or employee ID" onChange={(event) => updateFilter('search', event.target.value)} /></label>
    </section>

    {dashboardQuery.isError ? <DashboardError message="The HR operations dashboard could not be loaded. Check your connection and try again." onRetry={() => dashboardQuery.refetch()} /> : null}

    <section className="hr-kpi-grid" aria-label="Today’s HR metrics">{kpis.map((item) => <button key={item.id} type="button" className={`hr-kpi hr-tone-${item.tone}`} onClick={item.action}><span className="hr-kpi-label">{item.label}</span><span className="hr-kpi-value">{item.value}</span><span className="hr-kpi-meta">{item.meta}</span><span className="hr-kpi-detail">{item.detail}</span><span className="hr-kpi-drill">View details <span aria-hidden="true">→</span></span></button>)}</section>

    <div className="hr-command-grid">
      <section className="dashboard-panel hr-actions-panel" aria-labelledby="today-actions-title">
        <div className="dashboard-panel-header"><div><h2 id="today-actions-title">Today’s HR Actions</h2><p>Prioritised employee records requiring attention in the selected scope.</p></div><Badge variant={actions.some((row) => row.priority === 'HIGH') ? 'danger' : 'default'}>{actions.length} open</Badge></div>
        <ActionsTable rows={actions} onOpen={(row) => navigate(destinationFor(row))} emptyMessage="No HR actions need attention for the selected filters." />
      </section>
      <aside id="dashboard-alerts" className="dashboard-panel hr-alerts-panel" aria-labelledby="approvals-alerts-title">
        <div className="dashboard-panel-header"><div><h2 id="approvals-alerts-title">Approvals & Alerts</h2><p>Queues requiring an HR or manager decision.</p></div></div>
        <div className="hr-alert-list">{(data?.alerts || []).map((alert) => <article key={alert.id} className="hr-alert-card"><div><strong>{alert.label}</strong><span>{alert.urgency === 'NORMAL' ? 'Routine' : `${alert.urgency.toLowerCase()} urgency`}{alert.dueDate ? ` · Due ${displayDate(alert.dueDate)}` : ''}</span></div><b>{alert.count}</b><Button variant="ghost" size="sm" onClick={() => navigate(alert.destination)}>View all</Button></article>)}</div>
      </aside>
    </div>

    <WorkforceInsights analytics={data?.analytics || {}} summary={summary} payroll={payroll} date={filters.date} asOfTime={currentTime(now)} branches={filterOptions.branches || []} branchId={filters.branchId} onBranchChange={value => updateFilter('branchId', value)} onNavigate={navigate} onOpenAttendance={() => openTab('attendance')} onOpenPayroll={() => openTab('payroll')} />

    <section id="dashboard-workspace" className="dashboard-panel dashboard-workspace" aria-label="HR operational work queues">
      <div className="dashboard-tabs" role="tablist" aria-label="HR work queues">{TABS.map((tab, index) => <button id={`dashboard-tab-${tab.id}`} key={tab.id} type="button" role="tab" className="dashboard-tab" aria-selected={activeTab === tab.id} aria-controls={`dashboard-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => handleTabKeyDown(event, index)}>{tab.label}<span className="dashboard-tab-count">{tabCounts[tab.id]}</span></button>)}</div>
      <div id={`dashboard-panel-${activeTab}`} className="dashboard-tab-panel" role="tabpanel" aria-labelledby={`dashboard-tab-${activeTab}`}>
        {activeTab === 'attendance' ? <AttendanceExceptions rows={workspaces.attendanceExceptions || []} onOpen={(row) => navigate(destinationFor(row))} /> : null}
        {activeTab === 'approvals' ? <QueuePanel title="Pending approvals" detail="Leave requests awaiting the assigned manager or approving authority." rows={workspaces.pendingApprovals || []} onOpen={(row) => navigate(destinationFor(row))} empty="No leave requests are awaiting approval." /> : null}
        {activeTab === 'payroll' ? <QueuePanel title="Payroll blockers" detail="Employee master-data issues that can prevent a complete payroll run." rows={workspaces.payrollBlockers || []} onOpen={(row) => navigate(destinationFor(row))} empty="No employee payroll records need review." /> : null}
        {activeTab === 'onboarding' ? <QueuePanel title="Onboarding & offboarding" detail="Incomplete employee placement tasks and current lifecycle actions." rows={workspaces.onboardingOffboarding || []} onOpen={(row) => navigate(destinationFor(row))} empty="No onboarding or offboarding actions are pending." /> : null}
        {activeTab === 'compliance' ? <QueuePanel title="Compliance alerts" detail="Identity, qualification, probation and policy records requiring review." rows={workspaces.complianceAlerts || []} onOpen={(row) => navigate(destinationFor(row))} empty="No employee compliance alerts are active." /> : null}
        {activeTab === 'branches' ? <BranchReadiness rows={workspaces.branchReadiness || []} onAdd={() => navigate('/organisation-structure')} /> : null}
      </div>
    </section>
  </div>;
}

function FilterSelect({ label, children, ...props }) {
  return <label><span>{label}</span><select className="input" {...props}>{children}</select></label>;
}

function ActionsTable({ rows, onOpen, emptyMessage }) {
  if (!rows.length) return <div className="dashboard-empty-table"><strong>All clear for this scope</strong><span>{emptyMessage}</span></div>;
  return <div className="dashboard-table-scroll"><table className="table hr-actions-table"><thead><tr><th className="table-th">Priority</th><th className="table-th">Employee</th><th className="table-th">Employee ID</th><th className="table-th">Branch / Department</th><th className="table-th">Issue Type</th><th className="table-th">Details</th><th className="table-th">Owner / Reporting Manager</th><th className="table-th">Status</th><th className="table-th table-th-right">Action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="table-row"><td className="table-td"><Badge variant={row.priority === 'HIGH' ? 'danger' : 'warning'}>{row.priority === 'HIGH' ? 'Critical' : 'Needs review'}</Badge></td><td className="table-td"><strong>{row.employeeName}</strong></td><td className="table-td mono">{row.empCode}</td><td className="table-td"><strong>{row.branchName}</strong><span className="hr-cell-subtext">{row.departmentName}</span></td><td className="table-td"><Badge variant={row.issueType === 'PAYROLL' ? 'info' : row.issueType === 'COMPLIANCE' ? 'warning' : 'default'}>{row.issueType}</Badge></td><td className="table-td hr-detail-cell">{row.details}</td><td className="table-td">{row.owner}</td><td className="table-td"><Badge variant={row.status === 'PENDING_APPROVAL' ? 'info' : row.status === 'COMPLETED' ? 'success' : 'warning'}>{statusLabel[row.status] || row.status}</Badge></td><td className="table-td table-td-right"><Button variant="secondary" size="sm" onClick={() => onOpen(row)}>{row.actionLabel || 'Review'}</Button></td></tr>)}</tbody></table></div>;
}

function PanelHeading({ title, detail }) {
  return <div className="dashboard-tab-heading"><div><h2>{title}</h2><p>{detail}</p></div></div>;
}

function QueuePanel({ title, detail, rows, onOpen, empty }) {
  return <><PanelHeading title={title} detail={detail} /><ActionsTable rows={rows} onOpen={onOpen} emptyMessage={empty} /></>;
}

function AttendanceExceptions({ rows, onOpen }) {
  return <><PanelHeading title="Attendance exceptions" detail="Shift context is shown before any employee is classified as late or absent." />{!rows.length ? <div className="dashboard-empty-table"><strong>No attendance exceptions</strong><span>All attendance records in this scope are marked.</span></div> : <div className="dashboard-table-scroll"><table className="table hr-exception-table"><thead><tr><th className="table-th">Employee</th><th className="table-th">Scheduled shift</th><th className="table-th">First check-in / last check-out</th><th className="table-th">Status</th><th className="table-th">Exception reason</th><th className="table-th">Manager</th><th className="table-th table-th-right">Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="table-row"><td className="table-td"><strong>{row.employeeName}</strong><span className="hr-cell-subtext mono">{row.empCode}</span></td><td className="table-td">{row.scheduledShift}<span className="hr-cell-subtext">Late threshold: {row.lateThreshold}</span></td><td className="table-td mono">{row.firstCheckIn || '—'} / {row.lastCheckOut || '—'}</td><td className="table-td"><Badge variant="warning">Unmarked</Badge></td><td className="table-td">{row.reason}</td><td className="table-td">{row.manager}</td><td className="table-td table-td-right"><div className="hr-row-actions"><Button size="sm" variant="secondary" onClick={() => onOpen(row)}>Correct</Button><Button size="sm" variant="ghost" onClick={() => onOpen(row)}>Approve</Button><Button size="sm" variant="ghost" onClick={() => onOpen(row)}>Escalate</Button></div></td></tr>)}</tbody></table></div>}</>;
}

function BranchReadiness({ rows, onAdd }) {
  return <><PanelHeading title="Branch readiness" detail="Today’s staffing state across configured operating units." />{!rows.length ? <div className="dashboard-empty-table"><strong>No branches configured yet</strong><span>Add a branch before assigning branch-level staff and attendance.</span><Button size="sm" onClick={onAdd}>Add a branch</Button></div> : <div className="dashboard-table-scroll"><table className="table"><thead><tr><th className="table-th">Branch</th><th className="table-th">Unit</th><th className="table-th table-th-right">Employees</th><th className="table-th table-th-right">Present</th><th className="table-th table-th-right">On leave</th><th className="table-th table-th-right">Unmarked</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="table-row"><td className="table-td"><strong>{row.name}</strong><span className="hr-cell-subtext mono">{row.code}</span></td><td className="table-td"><Badge variant={row.isHeadOffice ? 'info' : 'default'}>{row.isHeadOffice ? 'Head Office' : 'Branch'}</Badge></td><td className="table-td table-td-right">{row.employees}</td><td className="table-td table-td-right dashboard-number-success">{row.present}</td><td className="table-td table-td-right dashboard-number-warning">{row.onLeave}</td><td className="table-td table-td-right dashboard-number-danger">{row.unmarked}</td></tr>)}</tbody></table></div>}</>;
}
