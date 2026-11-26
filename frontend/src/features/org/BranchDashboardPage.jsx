import React, { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { orgApi } from '../../api/client';
import { commandCentreParams } from '../dashboard/dashboardModel';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ActionCentre } from '../dashboard/ActionCentre';
import { DashboardError, DashboardSkeleton } from '../dashboard/DashboardPrimitives';
import '../dashboard/Dashboard.css';

const HEALTH_VARIANT = { HEALTHY: 'success', WATCH: 'default', NEEDS_ATTENTION: 'warning', CRITICAL: 'danger' };

function IssueList({ title, rows = [], empty, onNavigate }) {
  return <article className="command-surface branch-issue-card"><header><h2>{title}</h2><Badge variant={rows.length ? 'warning' : 'success'}>{rows.length}</Badge></header>{rows.length ? <ul>{rows.slice(0, 6).map((row) => <li key={row.id}><button type="button" onClick={() => onNavigate(row.destination || '/people')}><span><strong>{row.employeeName}</strong><small>{row.problem}</small></span><b>Open</b></button></li>)}</ul> : <div className="command-empty command-empty-compact"><strong>{empty}</strong><span>No records require attention for this branch.</span></div>}</article>;
}

export function BranchDashboardPage() {
  const { branchId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filters = commandCentreParams(searchParams);
  const [actionFilters, setActionFilters] = useState({ tab: 'all', priority: '', owner: '', due: '' });

  const query = useQuery({ queryKey: ['branch-dashboard', branchId, filters], queryFn: () => orgApi.branchDashboard(branchId, filters), enabled: !!branchId });
  if (query.isLoading && !query.data) return <DashboardSkeleton />;
  if (query.isError) return <div className="page dashboard-page"><Breadcrumbs items={[{ label: 'Organisation', to: '/' }, { label: 'Branch Dashboard' }]} /><DashboardError message="This branch dashboard could not be loaded or is outside your current access scope." onRetry={() => query.refetch()} /></div>;
  const data = query.data;
  if (!data) return null;
  const branch = data.branch;
  const overview = data.overview || {};
  const health = branch.health?.status || 'WATCH';
  const branchActions = data.actions || data.employeeIssues || [];

  return <div className="page dashboard-page command-centre-page branch-dashboard-page">
    <Breadcrumbs items={[{ label: 'Organisation', to: '/' }, { label: branch.name }]} />
    <header className="command-page-header"><div><span className="command-eyebrow">Branch Dashboard</span><h1>{branch.name}</h1><p>{branch.code} · {String(branch.unitType || 'BRANCH').replace(/_/g, ' ')} · Manager: {branch.manager?.assigned ? branch.manager.name : 'Not assigned'}</p></div><div className="branch-header-actions"><Badge variant={HEALTH_VARIANT[health]}>{health.replace(/_/g, ' ')}</Badge><Button variant="secondary" size="sm" onClick={() => navigate('/organisation-explorer')}>Organisation Explorer</Button></div></header>
    <section className="command-kpis branch-kpis">{[['totalWorkforce', 'Employees'], ['presentToday', 'Present Today'], ['onLeave', 'On Leave'], ['openPositions', 'Vacancies'], ['payrollReadiness', 'Payroll Readiness'], ['hrActions', 'Open Actions']].map(([key, label]) => <button type="button" key={key} className="command-kpi command-surface" onClick={() => navigate(overview[key]?.destination || '/people')}><span>{label}</span><strong>{overview[key]?.value ?? 0}{overview[key]?.suffix || ''}</strong><small>Open the filtered operational record</small><b>View details →</b></button>)}</section>
    <section className="branch-dashboard-grid"><article className="command-surface branch-departments"><header className="command-section-header"><div><h2>Department Staffing</h2><p>Current employee placement within this branch.</p></div></header>{data.departmentDistribution?.length ? <div>{data.departmentDistribution.map((row) => <button type="button" key={row.id || row.label} onClick={() => navigate(`/people?branchId=${branch.id}&departmentId=${row.id || ''}`)}><span>{row.label}</span><strong>{row.count} <small>{row.percentage}%</small></strong></button>)}</div> : <div className="command-empty"><strong>No department staffing is recorded</strong><span>Assign current employees to branch departments.</span></div>}</article><article className="command-surface branch-attendance-trend"><header className="command-section-header"><div><h2>Attendance Trend</h2><p>Last seven recorded working days.</p></div></header>{data.attendanceTrend?.length ? <div><ResponsiveContainer width="100%" height="100%"><LineChart data={data.attendanceTrend} margin={{ top: 10, right: 20, bottom: 5, left: -15 }}><CartesianGrid vertical={false} stroke="var(--dashboard-line)" /><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} /><Tooltip /><Line type="monotone" dataKey="presentPercent" name="Present" stroke="#168765" strokeWidth={2.5} /></LineChart></ResponsiveContainer></div> : <div className="command-empty"><strong>No attendance trend is recorded</strong><span>Attendance history will appear after working-day records are captured.</span></div>}</article></section>

    {/* Branch Manager Action Centre */}
    <ActionCentre
      actions={branchActions}
      filters={actionFilters}
      onFiltersChange={setActionFilters}
      onNavigate={navigate}
    />

    <section className="branch-detail-grid"><article className="command-surface branch-issue-card"><header><h2>Upcoming Approved Leave</h2><Badge variant="info">{data.upcomingLeave?.length || 0}</Badge></header>{data.upcomingLeave?.length ? <ul>{data.upcomingLeave.map((row) => <li key={row.id}><button type="button" onClick={() => navigate('/leave')}><span><strong>{row.name}</strong><small>{row.leaveType} · {row.fromDate} to {row.toDate}</small></span><b>Open</b></button></li>)}</ul> : <div className="command-empty command-empty-compact"><strong>No approved leave is recorded</strong><span>No approved leave overlaps the selected date.</span></div>}</article><article className="command-surface branch-vacancies"><header><h2>Vacancies</h2><strong>{data.vacancies?.count ?? '—'}</strong></header><p>Unoccupied sanctioned position capacity.</p><Button variant="secondary" size="sm" onClick={() => navigate('/organisation-structure?view=vacancies')}>View positions</Button></article><IssueList title="Payroll Blockers" rows={data.payrollBlockers} empty="No payroll blockers" onNavigate={navigate} /><IssueList title="Compliance Issues" rows={data.complianceIssues} empty="No compliance issues" onNavigate={navigate} /><IssueList title="Onboarding Issues" rows={data.onboardingIssues} empty="No onboarding issues" onNavigate={navigate} /><IssueList title="Employee Issues" rows={data.employeeIssues} empty="No employee issues" onNavigate={navigate} /></section>
  </div>;
}

export default BranchDashboardPage;
