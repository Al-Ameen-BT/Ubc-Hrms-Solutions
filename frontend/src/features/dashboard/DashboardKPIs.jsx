import React from 'react';

export function DashboardKPIs({ overview = {}, onNavigate, onScrollToActionCentre }) {
  const total = overview.totalWorkforce?.value ?? 0;
  const present = overview.presentToday?.value ?? 0;
  const presentPct = overview.presentToday?.percentage ?? (total > 0 ? Math.round((present / total) * 100) : 0);
  const onLeave = overview.onLeave?.value ?? 0;
  const openPositions = overview.openPositions?.value ?? 0;
  const payrollPct = overview.payrollReadiness?.value ?? 100;
  const hrActions = overview.hrActions?.value ?? 0;
  const criticalActions = overview.hrActions?.critical ?? 0;

  const handleActionCentreClick = () => {
    if (onScrollToActionCentre) {
      onScrollToActionCentre();
    } else {
      const el = document.getElementById('action-centre');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <section className="command-kpis" aria-label="Key HR Performance Indicators">
      {/* 1. Total Workforce */}
      <button
        type="button"
        className="command-surface command-kpi"
        onClick={() => onNavigate?.('/people')}
        title="View People Directory"
      >
        <span>Total Workforce</span>
        <strong>{total}</strong>
        <small>Active staff across units</small>
        <b>View directory →</b>
      </button>

      {/* 2. Present Today */}
      <button
        type="button"
        className="command-surface command-kpi"
        onClick={() => onNavigate?.('/employee-services/time')}
        title="View Attendance Details"
      >
        <span>Present Today</span>
        <strong style={{ color: '#10b981' }}>{present}</strong>
        <small>{presentPct}% check-in rate</small>
        <b>Attendance log →</b>
      </button>

      {/* 3. On Leave */}
      <button
        type="button"
        className="command-surface command-kpi"
        onClick={() => onNavigate?.('/leave')}
        title="View Leave Requests"
      >
        <span>On Leave</span>
        <strong style={{ color: '#3b82f6' }}>{onLeave}</strong>
        <small>Approved leaves today</small>
        <b>Review leaves →</b>
      </button>

      {/* 4. Open Positions */}
      <button
        type="button"
        className="command-surface command-kpi"
        onClick={() => onNavigate?.('/organisation-structure?view=vacancies')}
        title="View Sanctioned Vacancies"
      >
        <span>Open Positions</span>
        <strong style={openPositions > 0 ? { color: '#f59e0b' } : undefined}>{openPositions}</strong>
        <small>Vacant sanctioned posts</small>
        <b>Staffing structure →</b>
      </button>

      {/* 5. Payroll Readiness */}
      <button
        type="button"
        className="command-surface command-kpi"
        onClick={() => onNavigate?.('/payroll')}
        title="View Payroll Preparation"
      >
        <span>Payroll Readiness</span>
        <strong style={{ color: payrollPct < 90 ? '#f59e0b' : 'var(--accent-strong, #2563eb)' }}>
          {payrollPct}%
        </strong>
        <small>Current cycle checks</small>
        <b>Run payroll →</b>
      </button>

      {/* 6. HR Actions */}
      <button
        type="button"
        className="command-surface command-kpi"
        onClick={handleActionCentreClick}
        title="Jump to Action Centre"
      >
        <span>HR Actions</span>
        <strong style={criticalActions > 0 ? { color: '#ef4444' } : undefined}>
          {hrActions}
        </strong>
        <small>{criticalActions > 0 ? `${criticalActions} critical priority` : 'Pending review items'}</small>
        <b>Action centre ↓</b>
      </button>
    </section>
  );
}

export default DashboardKPIs;
