import React, { useMemo, useState } from 'react';
import { clampedPercent } from './dashboardModel';

const PALETTE = [
  '#2563eb', // Royal Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#64748b', // Slate
];

const ATTENDANCE_COLORS = {
  present: '#10b981',
  onLeave: '#3b82f6',
  unmarked: '#f59e0b',
  absent: '#ef4444',
};

function DonutSvg({ slices = [], total = 0, centerValue, centerLabel, centerColor }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius; // ~276.46
  const safeTotal = total > 0 ? total : slices.reduce((acc, s) => acc + (Number(s.value) || 0), 0) || 1;

  let offset = 0;
  const arcs = slices.map((slice, idx) => {
    const val = Math.max(0, Number(slice.value) || 0);
    const pct = val / safeTotal;
    const dash = pct * circumference;
    const currentOffset = offset;
    offset += dash;
    return {
      ...slice,
      dash,
      offset: currentOffset,
      color: slice.color || PALETTE[idx % PALETTE.length],
    };
  });

  return (
    <div className="command-donut-visual" aria-hidden="true">
      <svg viewBox="0 0 120 120" className="command-donut-svg">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--dashboard-line, #e2e8f0)" strokeWidth="15" />
        {arcs.map((arc, idx) => (
          arc.dash > 0.01 ? (
            <circle
              key={idx}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth="15"
              strokeDasharray={`${arc.dash} ${Math.max(0, circumference - arc.dash)}`}
              strokeDashoffset={-arc.offset}
              className="command-donut-slice"
            />
          ) : null
        ))}
      </svg>
      <div className="command-donut-center">
        <strong style={centerColor ? { color: centerColor } : undefined}>{centerValue}</strong>
        <span>{centerLabel}</span>
      </div>
    </div>
  );
}

export function DashboardDonuts({ data, onNavigate, onFilter }) {
  const [distributionDimension, setDistributionDimension] = useState('branch');

  const totalStaff = Number(data?.overview?.totalWorkforce?.value || data?.explorer?.totals?.employees || 0);

  // 1. Workforce Distribution
  const distributionData = data?.distribution || {};
  const currentDistribution = useMemo(() => {
    const rows = distributionData[distributionDimension] || [];
    return rows.map((r, i) => ({
      label: r.label || 'Unassigned',
      value: Number(r.count ?? r.value ?? 0),
      color: PALETTE[i % PALETTE.length],
      query: r.query,
    }));
  }, [distributionData, distributionDimension]);

  // 2. Attendance Statuses
  const attendanceStatuses = data?.attendance?.statuses || [];
  const presentCount = Number(
    attendanceStatuses.find((s) => s.key === 'present')?.count ??
    data?.overview?.presentToday?.value ?? 0
  );
  const onLeaveCount = Number(
    attendanceStatuses.find((s) => s.key === 'onLeave')?.count ??
    data?.overview?.onLeave?.value ?? 0
  );
  const unmarkedCount = Number(
    attendanceStatuses.find((s) => s.key === 'unmarked')?.count ??
    attendanceStatuses.find((s) => s.key === 'absent')?.count ??
    Math.max(0, totalStaff - presentCount - onLeaveCount)
  );

  const attendanceSlices = [
    { label: 'Present Today', value: presentCount, color: ATTENDANCE_COLORS.present },
    { label: 'On Approved Leave', value: onLeaveCount, color: ATTENDANCE_COLORS.onLeave },
    { label: 'Absent / Unmarked', value: unmarkedCount, color: ATTENDANCE_COLORS.unmarked },
  ];
  const attendancePercent = totalStaff > 0 ? Math.round((presentCount / totalStaff) * 100) : 0;

  // 3. Payroll Readiness
  const payroll = data?.payrollReadiness || {};
  const readinessPercent = Number(payroll.readinessPercent ?? data?.overview?.payrollReadiness?.value ?? 100);
  const stages = payroll.stages || {};
  const verifiedCount = Number(stages.statutoryDataVerified || stages.attendanceVerified || 0);
  const reviewPending = Number(stages.payrollReviewPending ?? payroll.recordsNeedingReview ?? 0);
  const readyEstimate = Math.max(0, totalStaff - reviewPending);

  const payrollSlices = [
    { label: 'Processed / Ready', value: readyEstimate, color: '#2563eb' },
    { label: 'Pending Review', value: reviewPending, color: '#f59e0b' },
  ];
  if (totalStaff === 0) {
    payrollSlices[0].value = 1;
  }

  const asOfDate = data?.appliedFilters?.date || data?.asOf || '';
  const monthName = asOfDate
    ? new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(`${asOfDate}T12:00:00+05:30`))
    : 'Current Cycle';

  return (
    <section className="command-donuts-grid" aria-label="Top Organisation Donut Charts">
      {/* DONUT 1: Workforce Distribution */}
      <article className="command-surface command-donut-card">
        <header className="command-donut-header">
          <div>
            <h2>Workforce Distribution</h2>
            <p>Staff split across units &amp; categories</p>
          </div>
          <select
            className="command-donut-select"
            value={distributionDimension}
            onChange={(e) => setDistributionDimension(e.target.value)}
            aria-label="Workforce distribution dimension"
          >
            <option value="branch">By Branch</option>
            <option value="cadre">By Cadre</option>
            <option value="department">By Department</option>
            <option value="employmentType">By Type</option>
          </select>
        </header>

        <div className="command-donut-content">
          <DonutSvg
            slices={currentDistribution}
            total={totalStaff}
            centerValue={totalStaff}
            centerLabel="Total Staff"
          />

          <div className="command-donut-legend-wrap">
            <ul className="command-donut-legend" aria-label="Workforce distribution breakdown">
              {currentDistribution.slice(0, 6).map((item, idx) => {
                const pct = clampedPercent(item.value, totalStaff);
                return (
                  <li
                    key={idx}
                    className="command-donut-legend-item"
                    onClick={() => {
                      if (item.query && onFilter) {
                        const [key, val] = Object.entries(item.query)[0] || [];
                        if (key && val) onFilter(key, val);
                      }
                    }}
                    title={item.query ? `Click to filter by ${item.label}` : undefined}
                  >
                    <span className="command-donut-swatch" style={{ backgroundColor: item.color }} />
                    <span className="command-donut-label">{item.label}</span>
                    <strong className="command-donut-value">
                      {item.value} <small>({pct}%)</small>
                    </strong>
                  </li>
                );
              })}
              {currentDistribution.length > 6 && (
                <li className="command-donut-legend-item muted">
                  <span className="command-donut-swatch" style={{ backgroundColor: '#94a3b8' }} />
                  <span className="command-donut-label">+{currentDistribution.length - 6} more</span>
                  <strong className="command-donut-value">
                    {currentDistribution.slice(6).reduce((acc, r) => acc + r.value, 0)}
                  </strong>
                </li>
              )}
            </ul>
          </div>
        </div>
      </article>

      {/* DONUT 2: Today's Attendance */}
      <article className="command-surface command-donut-card">
        <header className="command-donut-header">
          <div>
            <h2>Today's Attendance</h2>
            <p>Live attendance &amp; leave status</p>
          </div>
          <button
            type="button"
            className="command-link"
            onClick={() => onNavigate?.('/employee-services/time')}
          >
            View log →
          </button>
        </header>

        <div className="command-donut-content">
          <DonutSvg
            slices={attendanceSlices}
            total={totalStaff}
            centerValue={`${attendancePercent}%`}
            centerLabel="Present"
            centerColor="#10b981"
          />

          <div className="command-donut-legend-wrap">
            <ul className="command-donut-legend" aria-label="Attendance status breakdown">
              {attendanceSlices.map((item, idx) => {
                const pct = clampedPercent(item.value, totalStaff);
                return (
                  <li key={idx} className="command-donut-legend-item">
                    <span className="command-donut-swatch" style={{ backgroundColor: item.color }} />
                    <span className="command-donut-label">{item.label}</span>
                    <strong className="command-donut-value">
                      {item.value} <small>({pct}%)</small>
                    </strong>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </article>

      {/* DONUT 3: Payroll Readiness */}
      <article className="command-surface command-donut-card">
        <header className="command-donut-header">
          <div>
            <h2>Payroll Readiness</h2>
            <p>{payroll.cycleStatus ? String(payroll.cycleStatus).replace(/_/g, ' ') : 'Current cycle'} · {payroll.deadline || 'pending'}</p>
          </div>
          <span className="command-pill-badge">{monthName}</span>
        </header>

        <div className="command-donut-content">
          <DonutSvg
            slices={payrollSlices}
            total={totalStaff || 1}
            centerValue={`${readinessPercent}%`}
            centerLabel="Ready"
            centerColor="var(--accent-strong, #2563eb)"
          />

          <div className="command-donut-legend-wrap">
            <div className="command-donut-stage-list">
              <div className="command-stage-row">
                <span>Attendance verified</span>
                <strong>{stages.attendanceVerified ?? readyEstimate} / {totalStaff}</strong>
              </div>
              <div className="command-stage-row">
                <span>Leave approved</span>
                <strong>{stages.leaveApproved ?? readyEstimate} / {totalStaff}</strong>
              </div>
              <div className="command-stage-row">
                <span>Bank verified</span>
                <strong>{stages.bankDetailsVerified ?? readyEstimate} / {totalStaff}</strong>
              </div>
              <div className="command-stage-row">
                <span>Statutory / KYC</span>
                <strong>{stages.statutoryDataVerified ?? readyEstimate} / {totalStaff}</strong>
              </div>
            </div>
            <button
              type="button"
              className="command-link command-donut-action-btn"
              onClick={() => onNavigate?.('/payroll')}
            >
              Open payroll →
            </button>
          </div>
        </div>
      </article>
    </section>
  );
}

export default DashboardDonuts;
