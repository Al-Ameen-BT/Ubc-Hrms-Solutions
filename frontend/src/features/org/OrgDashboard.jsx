import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { orgApi } from '../../api/client';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  AttentionList,
  DashboardError,
  DashboardSkeleton,
  DashboardSummary,
  DistributionBars,
} from '../dashboard/DashboardPrimitives';
import {
  clampedPercent,
  configuredBranches,
  licenceAttention,
  nextTabIndex,
} from '../dashboard/dashboardModel';

const TABS = [
  { id: 'branches', label: 'Branches' },
  { id: 'clockins', label: 'Today’s check-ins' },
  { id: 'leaves', label: 'Staff on leave' },
  { id: 'promotions', label: 'Career changes' },
  { id: 'setup', label: 'Setup readiness' },
];

export function OrgDashboard() {
  const navigate = useNavigate();
  const [selectedBranchId, setSelectedBranchId] = useState('ALL');
  const [activeTab, setActiveTab] = useState('branches');

  const settingsQuery = useQuery({ queryKey: ['org-settings'], queryFn: orgApi.settings });
  const analyticsQuery = useQuery({
    queryKey: ['org-dashboard-analytics'],
    queryFn: orgApi.dashboardAnalytics,
    refetchInterval: 30000,
  });

  const settings = settingsQuery.data;
  const analytics = analyticsQuery.data;
  const license = settings?.license || {};
  const usage = settings?.usage || {};
  const branches = analytics?.branches || [];
  const configuredBranchRows = configuredBranches(branches);
  const attendance = analytics?.attendance || {};
  const leaves = analytics?.leaves || {};
  const promotions = analytics?.promotions || {};
  const settingsAvailable = Boolean(settings);
  const analyticsAvailable = Boolean(analytics);

  const currentBranch = useMemo(() => {
    if (selectedBranchId === 'ALL') return null;
    return branches.find((branch) => String(branch.id) === String(selectedBranchId)) || null;
  }, [branches, selectedBranchId]);

  const metrics = useMemo(() => {
    if (currentBranch) {
      const total = Number(currentBranch.totalEmployees) || 0;
      const present = Number(currentBranch.presentToday) || 0;
      return {
        totalEmployees: total,
        presentToday: present,
        onLeaveToday: Number(currentBranch.onLeaveToday) || 0,
        absentToday: Number(currentBranch.absentToday) || 0,
        presenceRate: clampedPercent(present, total),
        scopeName: currentBranch.name,
      };
    }
    const total = Number(attendance.totalEmployees ?? usage.employees) || 0;
    if (!analyticsAvailable) {
      return {
        totalEmployees: total,
        presentToday: 0,
        onLeaveToday: 0,
        absentToday: 0,
        presenceRate: 0,
        scopeName: 'All branches',
        attendanceAvailable: false,
      };
    }
    const present = Number(attendance.presentToday) || 0;
    const onLeave = Number(attendance.onLeaveToday) || 0;
    const absent = attendance.absentToday == null
      ? Math.max(0, total - present - onLeave)
      : Number(attendance.absentToday) || 0;
    return {
      totalEmployees: total,
      presentToday: present,
      onLeaveToday: onLeave,
      absentToday: absent,
      presenceRate: clampedPercent(present, total),
      scopeName: 'All branches',
      attendanceAvailable: true,
    };
  }, [analyticsAvailable, attendance, currentBranch, usage.employees]);

  const filteredClockIns = useMemo(() => filterByBranch(attendance.recentCheckIns, currentBranch), [attendance.recentCheckIns, currentBranch]);
  const filteredLeaves = useMemo(() => filterByBranch(leaves.activeLeavesList, currentBranch), [leaves.activeLeavesList, currentBranch]);
  const filteredPromotions = useMemo(() => filterByBranch(promotions.recentEvents, currentBranch), [promotions.recentEvents, currentBranch]);
  const setupItems = [
    { done: settingsAvailable ? Boolean(settings?.organization?.name) : null, label: 'Organisation profile and details configured' },
    { done: settingsAvailable ? Boolean(settings?.smtp?.enabled) : null, label: 'Email notification service configured' },
    { done: settingsAvailable ? Number(usage.users) > 0 : null, label: 'System administrative users created' },
    { done: settingsAvailable ? Number(usage.employees) > 0 : null, label: 'Employee records onboarded' },
    { done: analyticsAvailable ? configuredBranchRows.length > 0 : null, label: 'Branch hierarchy configured' },
  ];
  const incompleteSetup = setupItems.filter((item) => item.done === false).length;
  const pendingApprovals = Number(leaves.pendingApprovalsCount) || 0;
  const licenceStatus = licenceAttention(license);

  const summaryItems = [
    {
      id: 'present', label: 'Present today', value: metrics.attendanceAvailable === false ? `— / ${metrics.totalEmployees}` : `${metrics.presentToday} / ${metrics.totalEmployees}`,
      detail: metrics.attendanceAvailable === false ? 'Attendance analytics unavailable' : `${metrics.presenceRate}% attendance in ${metrics.scopeName}`,
      tone: metrics.attendanceAvailable === false ? 'neutral' : metrics.presenceRate >= 85 ? 'success' : metrics.presenceRate >= 65 ? 'warning' : 'danger',
    },
    {
      id: 'leave', label: 'On approved leave', value: metrics.attendanceAvailable === false ? '—' : metrics.onLeaveToday,
      detail: metrics.attendanceAvailable === false ? 'Attendance analytics unavailable' : currentBranch ? `Current status in ${currentBranch.name}` : 'Current organisation status',
      tone: metrics.attendanceAvailable !== false && metrics.onLeaveToday ? 'warning' : 'neutral',
    },
    {
      id: 'exceptions', label: 'Attendance exceptions', value: metrics.attendanceAvailable === false ? '—' : metrics.absentToday,
      detail: metrics.attendanceAvailable === false ? 'Attendance analytics unavailable' : 'Absent or not yet marked',
      tone: metrics.attendanceAvailable === false ? 'neutral' : metrics.absentToday ? 'danger' : 'success',
    },
    {
      id: 'branches', label: 'Active branch units', value: analyticsAvailable ? configuredBranchRows.length : '—',
      detail: analyticsAvailable ? `${configuredBranchRows.filter((branch) => branch.isHeadOffice).length} Head Office · ${configuredBranchRows.filter((branch) => !branch.isHeadOffice).length} branches` : 'Branch analytics unavailable',
    },
  ];
  const attendanceBars = [
    { id: 'present', label: 'Present', value: metrics.presentToday, tone: 'success' },
    { id: 'leave', label: 'Approved leave', value: metrics.onLeaveToday, tone: 'warning' },
    { id: 'absent', label: 'Absent or unmarked', value: metrics.absentToday, tone: 'danger' },
  ];
  const attentionItems = [
    pendingApprovals > 0 && {
      id: 'leave-approvals', title: `${pendingApprovals} leave ${pendingApprovals === 1 ? 'request' : 'requests'} awaiting review`,
      detail: 'Organisation-wide approval queue.', tone: 'warning', actionLabel: 'Review', onAction: () => navigate('/leave'),
    },
    analyticsAvailable && metrics.absentToday > 0 && {
      id: 'attendance', title: `${metrics.absentToday} attendance ${metrics.absentToday === 1 ? 'exception' : 'exceptions'}`,
      detail: `Absent or unmarked in ${metrics.scopeName}.`, tone: 'danger', actionLabel: 'Open people', onAction: () => navigate('/people'),
    },
    settingsAvailable && licenceStatus.warning && {
      id: 'licence', title: licenceStatus.title,
      detail: 'Review the licence status to avoid interrupted access.', tone: 'danger', actionLabel: 'Settings', onAction: () => navigate('/settings'),
    },
    incompleteSetup > 0 && {
      id: 'setup', title: `${incompleteSetup} setup ${incompleteSetup === 1 ? 'item' : 'items'} incomplete`,
      detail: 'Complete the operational readiness checklist.', tone: 'warning', actionLabel: 'Review', onAction: () => setActiveTab('setup'),
    },
  ].filter(Boolean);
  const branchRanking = [...configuredBranchRows].sort((left, right) => Number(right.presenceRate || 0) - Number(left.presenceRate || 0)).slice(0, 5);
  const cadreRanking = [...(promotions.cadrePieChart || [])].sort((left, right) => Number(right.value || 0) - Number(left.value || 0)).slice(0, 5);
  const tabCounts = {
    branches: branches.length,
    clockins: filteredClockIns.length,
    leaves: filteredLeaves.length,
    promotions: filteredPromotions.length,
    setup: incompleteSetup,
  };

  const handleTabKeyDown = (event, index) => {
    const nextIndex = nextTabIndex(index, event.key, TABS.length);
    if (nextIndex === index) return;
    event.preventDefault();
    const tabList = event.currentTarget.parentElement;
    setActiveTab(TABS[nextIndex].id);
    requestAnimationFrame(() => tabList?.querySelectorAll('[role="tab"]')[nextIndex]?.focus());
  };

  if (analyticsQuery.isLoading && !analytics) return <DashboardSkeleton />;

  return (
    <div className="page dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-header-copy">
          <h1>{settings?.organization?.name || 'Organisation'} Overview</h1>
          <p>Current attendance, operational exceptions, and branch activity in one control room.</p>
        </div>
        <div className="dashboard-toolbar">
          <div className="dashboard-scope">
            <label htmlFor="dash-branch-select">Reporting scope</label>
            <select id="dash-branch-select" className="input" value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)}>
              <option value="ALL">All organisation staff</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} — {branch.name} ({branch.totalEmployees} staff)</option>)}
            </select>
          </div>
          <div className="dashboard-actions">
            <Button variant="secondary" onClick={() => navigate('/people')}>People</Button>
            <Button variant="secondary" onClick={() => navigate('/organisation-structure')}>Structure</Button>
            <Button onClick={() => navigate('/payroll')}>Payroll</Button>
          </div>
        </div>
      </header>

      {settingsQuery.isError ? <DashboardError message="Organisation settings could not be loaded. Available analytics remain visible." onRetry={() => settingsQuery.refetch()} /> : null}
      {analyticsQuery.isError ? <DashboardError message="Operational analytics could not be loaded." onRetry={() => analyticsQuery.refetch()} /> : null}
      <DashboardSummary items={summaryItems} />

      <div className="dashboard-control-grid">
        <section className="dashboard-panel" aria-labelledby="attendance-overview-title">
          <div className="dashboard-panel-header"><div><h2 id="attendance-overview-title">Attendance overview</h2><p>Current status for {metrics.scopeName}.</p></div></div>
          <div className="dashboard-panel-body">
            <div className="dashboard-panel-section">
              <DistributionBars items={attendanceBars} total={metrics.totalEmployees} emptyMessage="No employee attendance data is available for this scope." ariaLabel={`Attendance distribution for ${metrics.scopeName}`} />
            </div>
            {branchRanking.length > 1 ? (
              <div className="dashboard-panel-section">
                <h3 className="dashboard-subheading">Branch comparison <span>by today’s presence rate</span></h3>
                <ul className="dashboard-ranked-list">{branchRanking.map((branch) => <li key={branch.id}><span>{branch.name}</span><strong>{Number(branch.presenceRate) || 0}%</strong></li>)}</ul>
              </div>
            ) : null}
            <div className="dashboard-panel-section">
              <h3 className="dashboard-subheading">Staff cadre <span>Organisation-wide</span></h3>
              {cadreRanking.length ? <ul className="dashboard-ranked-list">{cadreRanking.map((cadre) => <li key={cadre.label}><span>{cadre.label}</span><strong>{cadre.value}</strong></li>)}</ul> : <p className="dashboard-empty">No cadre distribution is available.</p>}
            </div>
          </div>
        </section>
        <aside className="dashboard-panel" aria-labelledby="org-attention-title">
          <div className="dashboard-panel-header"><div><h2 id="org-attention-title">Needs attention</h2><p>Items that may need an administrator’s action.</p></div></div>
          <div className="dashboard-panel-body"><AttentionList items={attentionItems} emptyTitle="No immediate action required" emptyDetail="Attendance, leave, licence, and setup checks are clear." /></div>
        </aside>
      </div>

      <section className="dashboard-panel dashboard-workspace" aria-label="Operational workspace">
        <div className="dashboard-tabs" role="tablist" aria-label="Organisation dashboard views">
          {TABS.map((tab, index) => (
            <button id={`dashboard-tab-${tab.id}`} key={tab.id} type="button" role="tab" className="dashboard-tab" aria-selected={activeTab === tab.id} aria-controls={`dashboard-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => handleTabKeyDown(event, index)}>
              {tab.label}<span className="dashboard-tab-count">{tabCounts[tab.id]}</span>
            </button>
          ))}
        </div>
        <div id={`dashboard-panel-${activeTab}`} className="dashboard-tab-panel" role="tabpanel" aria-labelledby={`dashboard-tab-${activeTab}`}>
          {activeTab === 'branches' ? <BranchesPanel branches={branches} selectedBranchId={selectedBranchId} onSelect={setSelectedBranchId} /> : null}
          {activeTab === 'clockins' ? <CheckInsPanel rows={filteredClockIns} scopeName={metrics.scopeName} /> : null}
          {activeTab === 'leaves' ? <LeavesPanel rows={filteredLeaves} scopeName={metrics.scopeName} /> : null}
          {activeTab === 'promotions' ? <CareerPanel rows={filteredPromotions} scopeName={metrics.scopeName} /> : null}
          {activeTab === 'setup' ? <SetupPanel items={setupItems} /> : null}
        </div>
      </section>
    </div>
  );
}

function filterByBranch(rows = [], currentBranch) {
  if (!currentBranch) return rows || [];
  return (rows || []).filter((row) => row.branchName === currentBranch.name);
}

function PanelHeading({ title, detail, action }) {
  return <div className="dashboard-tab-heading"><div><h2>{title}</h2><p>{detail}</p></div>{action}</div>;
}

function BranchesPanel({ branches, selectedBranchId, onSelect }) {
  return (
    <>
      <PanelHeading title="Branch operations" detail="Today’s staffing and attendance by operating unit." action={selectedBranchId !== 'ALL' ? <Button variant="secondary" size="sm" onClick={() => onSelect('ALL')}>Show all branches</Button> : null} />
      {!branches.length ? <p className="dashboard-empty-table">No active branches found. Add branches under Organisation Structure.</p> : (
        <div className="dashboard-table-scroll"><table className="table"><thead><tr>
          <th className="table-th">Branch</th><th className="table-th">Unit type</th><th className="table-th table-th-right">Staff</th><th className="table-th table-th-right">Present</th><th className="table-th table-th-right">On leave</th><th className="table-th table-th-right">Exceptions</th><th className="table-th">Presence</th><th className="table-th table-th-right">Action</th>
        </tr></thead><tbody>{branches.map((branch) => {
          const selected = String(branch.id) === String(selectedBranchId);
          const rate = Number(branch.presenceRate) || 0;
          const progressClass = rate >= 85 ? 'dashboard-progress-success' : rate >= 65 ? 'dashboard-progress-warning' : 'dashboard-progress-danger';
          return <tr key={branch.id} className={`table-row ${selected ? 'dashboard-table-row-selected' : ''}`}>
            <td className="table-td"><div className="dashboard-table-name"><strong>{branch.name}</strong><span className="mono dashboard-code">{branch.code}</span></div></td>
            <td className="table-td"><Badge variant={branch.isHeadOffice ? 'info' : 'default'}>{branch.unitType === 'HEAD_OFFICE' || branch.isHeadOffice ? 'Head Office' : 'Branch'}</Badge></td>
            <td className="table-td table-td-right dashboard-number">{branch.totalEmployees}</td><td className="table-td table-td-right dashboard-number dashboard-number-success">{branch.presentToday}</td><td className="table-td table-td-right dashboard-number dashboard-number-warning">{branch.onLeaveToday}</td><td className="table-td table-td-right dashboard-number dashboard-number-danger">{branch.absentToday}</td>
            <td className="table-td"><div className="dashboard-progress-cell"><progress className={`dashboard-table-progress ${progressClass}`} max="100" value={rate} aria-label={`${branch.name} presence ${rate}%`} /><span>{rate}%</span></div></td>
            <td className="table-td table-td-right"><Button variant={selected ? 'primary' : 'ghost'} size="sm" onClick={() => onSelect(selected ? 'ALL' : String(branch.id))}>{selected ? 'Viewing' : 'Inspect'}</Button></td>
          </tr>;
        })}</tbody></table></div>
      )}
    </>
  );
}

function CheckInsPanel({ rows, scopeName }) {
  return <><PanelHeading title="Recent check-ins today" detail={`Recent server activity for ${scopeName}; this is not a complete attendance history.`} />
    {!rows.length ? <p className="dashboard-empty-table">No check-in events have been recorded for this scope today.</p> : <div className="dashboard-table-scroll"><table className="table"><thead><tr><th className="table-th">Employee</th><th className="table-th">Branch</th><th className="table-th">Check-in</th><th className="table-th">Check-out</th><th className="table-th">Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="table-row"><td className="table-td"><strong>{row.name}</strong> <span className="mono dashboard-code">({row.empCode})</span></td><td className="table-td">{row.branchName}</td><td className="table-td mono dashboard-number-success">{row.checkInTime}</td><td className="table-td mono">{row.checkOutTime || '—'}</td><td className="table-td"><Badge variant={row.checkOutTime ? 'default' : 'success'}>{row.checkOutTime ? 'Clocked out' : 'Present'}</Badge></td></tr>)}</tbody></table></div>}
  </>;
}

function LeavesPanel({ rows, scopeName }) {
  return <><PanelHeading title="Staff on approved leave" detail={`Current approved leave for ${scopeName}.`} />
    {!rows.length ? <p className="dashboard-empty-table">No staff members are on approved leave in this scope today.</p> : <div className="dashboard-table-scroll"><table className="table"><thead><tr><th className="table-th">Employee</th><th className="table-th">Branch</th><th className="table-th">Leave type</th><th className="table-th">Duration</th><th className="table-th">Period</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="table-row"><td className="table-td"><strong>{row.name}</strong> <span className="mono dashboard-code">({row.empCode})</span></td><td className="table-td">{row.branchName}</td><td className="table-td"><Badge variant="warning">{row.leaveType}</Badge></td><td className="table-td mono">{row.days} days</td><td className="table-td mono">{row.fromDate} to {row.toDate}</td></tr>)}</tbody></table></div>}
  </>;
}

function CareerPanel({ rows, scopeName }) {
  return <><PanelHeading title="Recent career changes" detail={`Recent server activity for ${scopeName}; this is not a complete service history.`} />
    {!rows.length ? <p className="dashboard-empty-table">No recent promotions or cadre changes are available for this scope.</p> : <div className="dashboard-table-scroll"><table className="table"><thead><tr><th className="table-th">Date</th><th className="table-th">Employee</th><th className="table-th">Branch</th><th className="table-th">Event</th><th className="table-th">Current cadre</th><th className="table-th">Order reference / notes</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="table-row"><td className="table-td mono">{row.eventDate}</td><td className="table-td"><strong>{row.name}</strong> <span className="mono dashboard-code">({row.empCode})</span></td><td className="table-td">{row.branchName}</td><td className="table-td"><Badge variant="info">{row.eventType}</Badge></td><td className="table-td">{row.cadre}</td><td className="table-td">{row.orderRef ? <span className="mono">[{row.orderRef}] </span> : null}{row.remarks}</td></tr>)}</tbody></table></div>}
  </>;
}

function SetupPanel({ items }) {
  return <><PanelHeading title="Setup readiness" detail="Core configuration needed for normal organisation operations." /><div className="dashboard-checklist">{items.map((item) => <div key={item.label} className="dashboard-checklist-item" data-complete={item.done === true}><span className="dashboard-checklist-mark">{item.done == null ? 'Unavailable' : item.done ? 'Complete' : 'Pending'}</span><span>{item.label}</span></div>)}</div></>;
}
