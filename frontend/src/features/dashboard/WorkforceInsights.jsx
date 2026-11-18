import React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '../../components/ui/Button';

const COLORS = ['#2f6fad', '#168765', '#b7791f', '#64748b', '#c2413b', '#0f7c84'];
const SEMANTIC_COLORS = { present: '#168765', completed: '#168765', late: '#b7791f', onLeave: '#2f6fad', pending: '#2f6fad', unmarked: '#64748b', noCheckIn: '#c2413b', absent: '#c2413b', missingCheckOut: '#b45309', shiftMismatch: '#64748b', exits: '#c2413b' };
const safe = value => Math.max(0, Number(value) || 0);
const percent = (value, total) => total ? Math.round((safe(value) / total) * 100) : 0;
const dayLabel = value => new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00+05:30`));
const monthLabel = value => new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(new Date(`${value}-01T12:00:00+05:30`));
const colorFor = (item, index) => item.color || SEMANTIC_COLORS[item.key] || COLORS[index % COLORS.length];

function ChartEmpty({ message, action, onAction }) {
  return <div className="workforce-chart-empty"><strong>No data available</strong><span>{message}</span>{action && <Button size="sm" variant="secondary" onClick={onAction}>{action}</Button>}</div>;
}

function ChartTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return <div className="workforce-tooltip"><strong>{row.label || payload[0].name}</strong><span>{safe(row.value ?? payload[0].value)} · {percent(row.value ?? payload[0].value, total)}%</span></div>;
}

function DonutCard({ title, subtitle, data = [], centreValue, centreLabel, onSelect, action, onAction, control, footer }) {
  const items = data.filter(item => safe(item.value) > 0);
  const total = items.reduce((sum, item) => sum + safe(item.value), 0);
  return <article className="workforce-chart-card">
    <header><div><h3>{title}</h3><p>{subtitle}</p></div>{control}</header>
    {!items.length ? <ChartEmpty message="Nothing is recorded for the selected scope." /> : <div className="workforce-donut-layout">
      <div className="workforce-donut" role="img" aria-label={`${title}: ${total} total`}>
        <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={items} dataKey="value" nameKey="label" innerRadius={48} outerRadius={68} paddingAngle={2} strokeWidth={0}>{items.map((item, index) => <Cell key={`${item.key || item.label}-${index}`} fill={colorFor(item, index)} onClick={() => onSelect?.(item)} className="workforce-chart-segment" />)}</Pie><Tooltip content={<ChartTooltip total={total} />} /></PieChart></ResponsiveContainer>
        <div className="workforce-donut-centre"><strong>{centreValue ?? total}</strong><span>{centreLabel}</span></div>
      </div>
      <ul className="workforce-legend">{items.map((item, index) => <li key={item.key || item.label}><button type="button" onClick={() => onSelect?.(item)} aria-label={`${item.label}: count ${safe(item.value)}, ${percent(item.value, total)} percent`}><i style={{ backgroundColor: colorFor(item, index) }} /><span>{item.label}</span><strong>{safe(item.value)} <small>{percent(item.value, total)}%</small></strong></button></li>)}</ul>
    </div>}
    {action && <div className="workforce-card-action"><Button size="sm" variant="secondary" onClick={onAction}>{action}</Button></div>}
    {footer}
  </article>;
}

function TrendCard({ title, subtitle, children, empty, action, onAction, wide = false }) {
  return <article className={`workforce-chart-card workforce-trend-card${wide ? ' workforce-chart-wide' : ''}`}><header><div><h3>{title}</h3><p>{subtitle}</p></div></header>{empty ? <ChartEmpty message={empty} action={action} onAction={onAction} /> : children}</article>;
}

function LifecycleComparison({ current, previous }) {
  if (!previous) return null;
  const comparable = safe(current.joiners) + safe(current.transfers) + safe(current.probationCompletions);
  const prior = safe(previous.joiners) + safe(previous.transfers) + safe(previous.probationCompletions);
  const delta = comparable - prior;
  return <p className="workforce-comparison">{delta === 0 ? 'No change' : `${Math.abs(delta)} ${delta > 0 ? 'more' : 'fewer'}`} recorded movements than {monthLabel(previous.month)}.</p>;
}

function PayrollReadiness({ payroll = {}, summary = {}, onOpen }) {
  const total = safe(payroll.total);
  const stages = payroll.stages || {};
  const rows = [
    ['Attendance verified', stages.attendanceVerified],
    ['Leave approved', stages.leaveApproved],
    ['Bank details verified', stages.bankDetailsVerified],
    ['Statutory data verified', stages.statutoryDataVerified],
  ];
  return <TrendCard title="Payroll Readiness" subtitle={`${summary.readinessPercent ?? 100}% complete · deadline ${summary.deadline || 'not scheduled'}`} wide empty={!total ? 'Add employees before assessing payroll readiness.' : ''}>
    <div className="payroll-readiness"><div className="payroll-readiness-summary"><strong>{summary.readinessPercent ?? 100}%</strong><span>{safe(stages.payrollReviewPending)} remaining blocker{safe(stages.payrollReviewPending) === 1 ? '' : 's'}</span></div>{rows.map(([label, value]) => <button type="button" key={label} onClick={onOpen} aria-label={`${label}: ${safe(value)} of ${total}`}><span>{label}</span><b>{safe(value)} / {total}</b><i><span style={{ width: `${percent(value, total)}%` }} /></i></button>)}</div>
  </TrendCard>;
}

export function WorkforceInsights({ analytics = {}, summary = {}, payroll = {}, date, asOfTime, branches = [], branchId = '', onBranchChange, onNavigate, onOpenAttendance, onOpenPayroll }) {
  const attendance = analytics.attendanceStatus || [];
  const exceptions = analytics.attendanceExceptions || [];
  const branchRows = analytics.headcountByBranch || [];
  const departmentRows = analytics.headcountByDepartment || [];
  const leaveRows = analytics.leaveDistribution || [];
  const movements = analytics.monthlyMovements || {};
  const lifecycle = [
    { key: 'joiners', label: 'New joiners', value: movements.joiners },
    { key: 'transfers', label: 'Transfers', value: movements.transfers },
    { key: 'completed', label: 'Probation confirmations', value: movements.probationCompletions },
    { key: 'exits', label: 'Exits', value: movements.exitsAvailable ? movements.exits : 0 },
  ];
  const trend = analytics.attendanceTrend || [];
  const lateTrend = analytics.lateArrivalTrend || [];
  const leaveTrend = analytics.leaveTrendByType || { categories: [], rows: [] };
  const openAttendanceSegment = item => item.key === 'onLeave' ? onNavigate(`/leave?status=APPROVED&date=${date}`) : item.key === 'present' ? onNavigate(`/employee-services/time?date=${date}&status=PRESENT`) : onOpenAttendance();
  const lifecycleRoute = item => item.key === 'transfers' ? '/organisation-structure?tab=transfers' : `/people?view=staff&${item.key === 'joiners' ? `dojMonth=${date?.slice(0, 7)}` : `confirmationMonth=${date?.slice(0, 7)}`}`;

  return <section className="dashboard-panel workforce-insights" aria-labelledby="workforce-insights-title">
    <div className="dashboard-panel-header"><div><h2 id="workforce-insights-title">Workforce Insights</h2><p>Interactive operational distributions and trend analytics for the selected scope. Select any slice or bar to drill down.</p></div></div>
    
    <div className="workforce-insights-stack">
      {/* Top 3 Core Operational Donut Charts */}
      <div className="workforce-donut-hero">
        <DonutCard title="Attendance Status Today" subtitle={`As of ${asOfTime} · shift rules applied where configured`} data={attendance} centreValue={summary.attendance?.total || 0} centreLabel="Staff" onSelect={openAttendanceSegment} />
        <DonutCard title="Attendance Exceptions" subtitle="Late, missing and mismatched records" data={exceptions} centreValue={summary.attendanceExceptions?.total || 0} centreLabel="Exceptions" onSelect={onOpenAttendance} action="Review exceptions" onAction={onOpenAttendance} />
        <DonutCard title="Leave Distribution" subtitle="Approved leave active on the selected date" data={leaveRows} centreValue={leaveRows.reduce((sum, row) => sum + safe(row.value), 0)} centreLabel="On leave" onSelect={item => onNavigate(`/leave?status=APPROVED&type=${encodeURIComponent(item.label)}&date=${date}`)} />
      </div>

      {/* Structural & Lifecycle Donut Charts */}
      <div className="workforce-donut-secondary">
        <DonutCard title="Workforce by Branch" subtitle="Current employee assignments" data={branchRows} centreValue={branchRows.reduce((sum, row) => sum + safe(row.value), 0)} centreLabel="Staff" onSelect={item => onNavigate(`/people?view=staff&branchId=${item.id}`)} control={<label className="workforce-card-filter"><span>Branch</span><select value={branchId} onChange={event => onBranchChange(event.target.value)}><option value="">All branches</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>} />
        <DonutCard title="Workforce by Department" subtitle="Current organisational placement" data={departmentRows} centreValue={departmentRows.reduce((sum, row) => sum + safe(row.value), 0)} centreLabel="Staff" onSelect={item => onNavigate(`/people?view=staff&departmentId=${item.id || 'unassigned'}`)} action="View organisation structure" onAction={() => onNavigate('/organisation-structure?tab=chart')} />
        <DonutCard title="Employee Lifecycle" subtitle="Current month movements" data={lifecycle} centreValue="This month" centreLabel="Movements" onSelect={item => onNavigate(lifecycleRoute(item))} footer={<LifecycleComparison current={movements} previous={movements.previousMonth} />} />
      </div>

      {/* Operational Trends & Payroll Readiness */}
      <div className="workforce-trend-grid">
        <TrendCard title="Seven-Day Attendance Trend" subtitle="Present, late and absent percentage · today highlighted" empty={!trend.length ? 'Attendance history is not available for this scope.' : ''}>
          <div className="workforce-chart-canvas" role="img" aria-label="Attendance percentage over the last seven working days"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 8, right: 12, left: -22, bottom: 0 }}><CartesianGrid stroke="var(--dashboard-line)" vertical={false} /><XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tickFormatter={value => `${value}%`} tick={{ fontSize: 11 }} /><Tooltip labelFormatter={dayLabel} formatter={(value, name) => [`${value}%`, name]} /><Line name="Present" type="monotone" dataKey="presentPercent" stroke="#168765" strokeWidth={2} dot={({ cx, cy, index }) => <circle cx={cx} cy={cy} r={index === trend.length - 1 ? 4 : 2} fill="#168765" />} /><Line name="Late" type="monotone" dataKey="latePercent" stroke="#b7791f" strokeWidth={2} /><Line name="Absent" type="monotone" dataKey="absentPercent" stroke="#c2413b" strokeWidth={2} /></LineChart></ResponsiveContainer></div>
          {!analytics.shiftAnalyticsAvailable && <p className="workforce-chart-note">Shift rules are not configured, so late and absent remain zero; unmarked records are not reclassified.</p>}
        </TrendCard>
        <TrendCard title="Late Arrival Trend" subtitle="Late-arrival count · last 7 working days" empty={!analytics.shiftAnalyticsAvailable ? 'Configure shift schedules and late thresholds to activate this chart.' : !lateTrend.some(row => safe(row.value)) ? 'No late arrivals are recorded.' : ''} action="Review attendance setup" onAction={() => onNavigate('/settings')}>
          <div className="workforce-chart-canvas" role="img" aria-label="Late arrivals over the last seven working days"><ResponsiveContainer width="100%" height="100%"><BarChart data={lateTrend} margin={{ top: 8, right: 12, left: -22, bottom: 0 }}><CartesianGrid stroke="var(--dashboard-line)" vertical={false} /><XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip labelFormatter={dayLabel} /><Bar dataKey="value" name="Late arrivals" fill="#b7791f" radius={[4, 4, 0, 0]} onClick={onOpenAttendance} /></BarChart></ResponsiveContainer></div>
        </TrendCard>
        <TrendCard title="Leave Trend by Type" subtitle="Approved applications · rolling six months" empty={!leaveTrend.categories.length ? 'No approved leave is recorded in the last six months.' : ''}>
          <div className="workforce-chart-canvas" role="img" aria-label="Approved leave applications by type and month"><ResponsiveContainer width="100%" height="100%"><BarChart data={leaveTrend.rows} margin={{ top: 8, right: 12, left: -22, bottom: 0 }}><CartesianGrid stroke="var(--dashboard-line)" vertical={false} /><XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip labelFormatter={monthLabel} />{leaveTrend.categories.map((category, index) => <Bar key={category} dataKey={category} stackId="leave" fill={COLORS[index % COLORS.length]} onClick={() => onNavigate(`/leave?status=APPROVED&type=${encodeURIComponent(category)}`)} />)}</BarChart></ResponsiveContainer></div>
        </TrendCard>
        <PayrollReadiness payroll={analytics.payrollReadiness} summary={payroll} onOpen={onOpenPayroll} />
      </div>
    </div>
  </section>;
}

export default WorkforceInsights;
