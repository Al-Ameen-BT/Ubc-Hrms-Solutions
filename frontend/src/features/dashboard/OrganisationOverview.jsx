import React, { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { distributionDestination } from './dashboardModel';

const DIMENSIONS = [['branch', 'Branch'], ['department', 'Department'], ['employmentType', 'Employment Type'], ['cadre', 'Cadre'], ['grade', 'Grade']];
const ATTENDANCE_TONES = { present: 'success', late: 'warning', onLeave: 'info', unmarked: 'neutral', absent: 'danger' };
const DONUT_COLORS = { blue: '#2563eb', green: '#168765', amber: '#b7791f', red: '#c2413b', grey: '#8793a3', pale: '#dbe3ee' };

function bounded(value, maximum) {
  return Math.min(Math.max(Number(value || 0), 0), Math.max(Number(maximum || 0), 0));
}

function DonutMetric({ label, value, suffix = '', detail, segments, destination, onOpen }) {
  const safeSegments = segments.filter((row) => Number(row.value) > 0);
  const chartSegments = safeSegments.length ? safeSegments : [{ label: 'No recorded data', value: 1, color: DONUT_COLORS.pale }];
  return <button type="button" className="command-donut-metric command-surface" onClick={() => onOpen(destination)} aria-label={`${label}: ${value}${suffix}. ${detail}. Open details`}>
    <span className="command-donut-visual" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartSegments} dataKey="value" nameKey="label" innerRadius="70%" outerRadius="96%" startAngle={90} endAngle={-270} paddingAngle={safeSegments.length > 1 ? 2 : 0} stroke="none">{chartSegments.map((row) => <Cell key={row.label} fill={row.color} />)}</Pie></PieChart></ResponsiveContainer>
      <span className="command-donut-total"><strong>{value}{suffix}</strong></span>
    </span>
    <span className="command-donut-copy"><strong>{label}</strong><small>{detail}</small><span>View details</span></span>
  </button>;
}

export function OrganisationOverview({ data, filters, onFilter, onNavigate }) {
  const [dimension, setDimension] = useState('branch');
  const overview = data.overview || {};
  const distribution = data.distribution?.[dimension] || [];
  const attendance = data.attendance || {};
  const attendanceTotal = (attendance.statuses || []).reduce((sum, row) => sum + Number(row.count || 0), 0);
  const openMetric = (destination) => onNavigate(destination === '#action-centre' ? '/?focus=actions#action-centre' : destination || '/people');
  const workforce = Number(overview.totalWorkforce?.value || 0);
  const vacancies = Number(overview.openPositions?.value || 0);
  const present = Number(overview.presentToday?.value || 0);
  const leave = Number(overview.onLeave?.value || 0);
  const payrollPercent = bounded(overview.payrollReadiness?.value, 100);
  const actionCount = Number(overview.hrActions?.value || 0);
  const criticalActions = bounded(overview.hrActions?.critical, actionCount);
  const metrics = [
    { key: 'workforce', label: 'Workforce capacity', value: workforce, detail: `${vacancies} open position${vacancies === 1 ? '' : 's'}`, destination: overview.totalWorkforce?.destination, segments: [{ label: 'Employees', value: workforce, color: DONUT_COLORS.blue }, { label: 'Open positions', value: vacancies, color: DONUT_COLORS.pale }] },
    { key: 'attendance', label: 'Present today', value: present, detail: `${overview.presentToday?.percentage ?? 0}% attendance recorded`, destination: overview.presentToday?.destination, segments: [{ label: 'Present', value: present, color: DONUT_COLORS.green }, { label: 'Other attendance status', value: Math.max(attendanceTotal - present, 0), color: DONUT_COLORS.grey }] },
    { key: 'leave', label: 'Approved leave', value: leave, detail: 'Employees on approved leave', destination: overview.onLeave?.destination, segments: [{ label: 'On leave', value: leave, color: DONUT_COLORS.amber }, { label: 'Available workforce', value: Math.max(workforce - leave, 0), color: DONUT_COLORS.pale }] },
    { key: 'payroll', label: 'Payroll readiness', value: payrollPercent, suffix: '%', detail: `${100 - payrollPercent}% requires review`, destination: overview.payrollReadiness?.destination, segments: [{ label: 'Ready', value: payrollPercent, color: DONUT_COLORS.blue }, { label: 'Requires review', value: 100 - payrollPercent, color: DONUT_COLORS.pale }] },
    { key: 'actions', label: 'Open HR actions', value: actionCount, detail: `${criticalActions} critical action${criticalActions === 1 ? '' : 's'}`, destination: overview.hrActions?.destination, segments: [{ label: 'Critical', value: criticalActions, color: DONUT_COLORS.red }, { label: 'Other open actions', value: Math.max(actionCount - criticalActions, 0), color: DONUT_COLORS.amber }] },
  ];

  return <>
    <section className="command-donut-metrics" aria-label="Organisation overview metrics">{metrics.map((metric) => <DonutMetric key={metric.key} {...metric} onOpen={openMetric} />)}</section>
    <section className="command-overview-grid">
      <article className="command-surface command-distribution" aria-labelledby="workforce-distribution-title"><header className="command-section-header"><div><h2 id="workforce-distribution-title">Workforce Distribution</h2><p>Current assignments in the selected organisational scope.</p></div></header><div className="command-segmented-control" aria-label="Workforce distribution dimension">{DIMENSIONS.map(([key, label]) => <button type="button" key={key} aria-pressed={dimension === key} onClick={() => setDimension(key)}>{label}</button>)}</div>{!distribution.length ? <div className="command-empty"><strong>No workforce data matches this scope</strong><span>Clear filters or complete employee organisation assignments.</span></div> : <><div className="command-horizontal-chart" role="img" aria-label={`Workforce distribution by ${dimension}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={distribution.slice(0, 8)} layout="vertical" margin={{ top: 4, right: 30, bottom: 4, left: 20 }}><CartesianGrid horizontal={false} stroke="var(--dashboard-line)" /><XAxis type="number" allowDecimals={false} /><YAxis dataKey="label" type="category" width={105} tick={{ fontSize: 11 }} /><Tooltip formatter={(value, name, item) => [`${value} staff · ${item.payload.percentage}%`, 'Workforce']} /><Bar dataKey="count" fill="#2563eb" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></div><div className="command-chart-links">{distribution.slice(0, 8).map((row) => <button type="button" key={`${dimension}-${row.id ?? row.label}`} onClick={() => onNavigate(distributionDestination(row))} aria-label={`View ${row.label}: ${row.count} staff, ${row.percentage} percent`}><span>{row.label}</span><b>{row.count} · {row.percentage}%</b></button>)}</div></>}</article>
      <article className="command-surface command-attendance" aria-labelledby="today-attendance-title"><header className="command-section-header"><div><h2 id="today-attendance-title">Today’s Attendance</h2><p>Present, leave, unmarked and absence remain distinct.</p></div><button type="button" className="command-link" onClick={() => onNavigate('/employee-services/time')}>View attendance</button></header>{!attendanceTotal ? <div className="command-empty"><strong>No attendance data is available</strong><span>Check the selected date or configure attendance capture.</span></div> : <><div className="command-attendance-bar" aria-label={`${attendanceTotal} employees in attendance scope`}>{(attendance.statuses || []).map((row) => <button type="button" key={row.key} className={`command-attendance-${ATTENDANCE_TONES[row.key] || 'neutral'}`} style={{ width: `${Math.max(row.percentage, row.count ? 4 : 0)}%` }} onClick={() => onNavigate(`/employee-services/time?status=${encodeURIComponent(row.key)}&date=${filters.date || data.asOf}`)} aria-label={`${row.label}: ${row.count}, ${row.percentage} percent`} title={`${row.label}: ${row.count} (${row.percentage}%)`} />)}</div><ul className="command-attendance-legend">{(attendance.statuses || []).map((row) => <li key={row.key}><i className={`command-attendance-${ATTENDANCE_TONES[row.key] || 'neutral'}`} aria-hidden="true" /><span>{row.label}</span><b>{row.count} <small>{row.percentage}%</small></b></li>)}</ul></>}{!attendance.shiftAnalyticsAvailable ? <p className="command-notice"><strong>Shift analytics are unavailable.</strong> Late and absent classifications are not inferred; unmarked attendance stays separate.</p> : null}{(attendance.branchExceptions || []).length ? <div className="command-exceptions"><h3>Branches needing attention</h3>{attendance.branchExceptions.map((row) => <button type="button" key={row.branchId} onClick={() => onNavigate(`/branches/${row.branchId}`)}><span>{row.name}</span><b>{row.count} issue{row.count === 1 ? '' : 's'}</b></button>)}</div> : null}</article>
    </section>
    <article className="command-surface command-trend" aria-labelledby="workforce-trend-title"><header className="command-section-header"><div><h2 id="workforce-trend-title">Workforce & Attendance Trend</h2><p>Operational attendance coverage for the selected period.</p></div><div className="command-periods" aria-label="Trend period">{[['7d', '7 days'], ['30d', '30 days'], ['6m', '6 months'], ['1y', '1 year']].map(([key, label]) => <button type="button" key={key} aria-pressed={(filters.period || '7d') === key} onClick={() => onFilter('period', key)}>{label}</button>)}</div></header>{attendance.trend?.length ? <div className="command-trend-chart" role="img" aria-label="Attendance percentage trend"><ResponsiveContainer width="100%" height="100%"><LineChart data={attendance.trend} margin={{ top: 10, right: 24, bottom: 4, left: -12 }}><CartesianGrid vertical={false} stroke="var(--dashboard-line)" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11 }} /><Tooltip formatter={(value, name) => [`${value}%`, name]} /><Line name="Present" type="monotone" dataKey="presentPercent" stroke="#168765" strokeWidth={2.5} dot={{ r: 3 }} /><Line name="Late" type="monotone" dataKey="latePercent" stroke="#b7791f" strokeWidth={2} dot={false} /><Line name="Absent" type="monotone" dataKey="absentPercent" stroke="#c2413b" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div> : <div className="command-empty"><strong>No trend history is available</strong><span>Attendance history will appear after working-day records are captured.</span></div>}</article>
  </>;
}

export default OrganisationOverview;
