import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { orgApi, fmt } from '../../api/client';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ColorfulPieChart } from '../../components/ui/ColorfulPieChart';

export function OrgDashboard() {
  const navigate = useNavigate();
  const [selectedBranchId, setSelectedBranchId] = useState('ALL');
  const [activeTab, setActiveTab] = useState('branches'); // 'branches' | 'clockins' | 'leaves' | 'promotions' | 'setup'

  // Settings & Licence query
  const { data: settings } = useQuery({
    queryKey: ['org-settings'],
    queryFn: orgApi.settings,
  });

  // Operational Analytics query
  const { data: analytics, isLoading: loadingAnalytics } = useQuery({
    queryKey: ['org-dashboard-analytics'],
    queryFn: orgApi.dashboardAnalytics,
    refetchInterval: 30000, // Refresh live metrics every 30s
  });

  const license = settings?.license || {};
  const usage = settings?.usage || {};
  const expired = license.expiresAt && new Date(license.expiresAt) < new Date();

  const branches = analytics?.branches || [];
  const attendance = analytics?.attendance || {};
  const leaves = analytics?.leaves || {};
  const promotions = analytics?.promotions || {};

  // Find currently selected branch object
  const currentBranch = useMemo(() => {
    if (selectedBranchId === 'ALL') return null;
    return branches.find((b) => String(b.id) === String(selectedBranchId)) || null;
  }, [branches, selectedBranchId]);

  // Dynamic metrics based on selected branch
  const metrics = useMemo(() => {
    if (currentBranch) {
      const total = currentBranch.totalEmployees || 0;
      const present = currentBranch.presentToday || 0;
      const onLeave = currentBranch.onLeaveToday || 0;
      const absent = currentBranch.absentToday || 0;
      const rate = currentBranch.presenceRate || 0;

      return {
        totalEmployees: total,
        presentToday: present,
        onLeaveToday: onLeave,
        absentToday: absent,
        presenceRate: rate,
        scopeName: currentBranch.name,
        attendancePie: [
          { label: 'Present Today', value: present, color: '#10B981' },
          { label: 'On Approved Leave', value: onLeave, color: '#F59E0B' },
          { label: 'Absent / Unmarked', value: absent, color: '#EF4444' },
        ],
      };
    }

    // Bank-wide
    const total = attendance.totalEmployees || usage.employees || 0;
    const present = attendance.presentToday || 0;
    const onLeave = attendance.onLeaveToday || 0;
    const absent = attendance.absentToday != null ? attendance.absentToday : Math.max(0, total - present - onLeave);
    const rate = attendance.presenceRate || (total > 0 ? Math.round((present / total) * 100) : 0);

    return {
      totalEmployees: total,
      presentToday: present,
      onLeaveToday: onLeave,
      absentToday: absent,
      presenceRate: rate,
      scopeName: 'All Branches (Bank-Wide)',
      attendancePie: attendance.pieChartData || [
        { label: 'Present Today', value: present, color: '#10B981' },
        { label: 'On Approved Leave', value: onLeave, color: '#F59E0B' },
        { label: 'Absent / Unmarked', value: absent, color: '#EF4444' },
      ],
    };
  }, [currentBranch, attendance, usage.employees]);

  // Filtered recent clock-ins
  const filteredClockIns = useMemo(() => {
    const list = attendance.recentCheckIns || [];
    if (selectedBranchId === 'ALL') return list;
    return list.filter((ci) => !currentBranch || ci.branchName === currentBranch.name);
  }, [attendance.recentCheckIns, selectedBranchId, currentBranch]);

  // Filtered leaves
  const filteredLeaves = useMemo(() => {
    const list = leaves.activeLeavesList || [];
    if (selectedBranchId === 'ALL') return list;
    return list.filter((l) => !currentBranch || l.branchName === currentBranch.name);
  }, [leaves.activeLeavesList, selectedBranchId, currentBranch]);

  // Filtered promotions
  const filteredPromotions = useMemo(() => {
    const list = promotions.recentEvents || [];
    if (selectedBranchId === 'ALL') return list;
    return list.filter((p) => !currentBranch || p.branchName === currentBranch.name);
  }, [promotions.recentEvents, selectedBranchId, currentBranch]);

  return (
    <div className="page" style={{ paddingBottom: 'var(--space-8)' }}>
      {/* HEADER SECTION */}
      <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="page-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 700 }}>
                {settings?.organization?.name || 'Bank'} Overview
              </h1>
              <Badge variant="info" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {metrics.scopeName}
              </Badge>
            </div>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
              Interactive operations dashboard · Live branch presence, leaves, promotions & staff analytics
            </p>
          </div>

          {/* Quick Actions & Branch Filter Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <label htmlFor="dash-branch-select" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                Branch:
              </label>
              <select
                id="dash-branch-select"
                className="input"
                style={{ padding: '6px 12px', minWidth: '180px', fontSize: 'var(--text-sm)', fontWeight: 500 }}
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
              >
                <option value="ALL">All Branches ({branches.length})</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name} ({b.totalEmployees} staff)
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button variant="secondary" onClick={() => navigate('/people')}>
                Employees
              </Button>
              <Button variant="secondary" onClick={() => navigate('/org/structure')}>
                Branches
              </Button>
              <Button variant="primary" onClick={() => navigate('/payroll')}>
                Payroll
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* 1. TOP EXECUTIVE TELEMETRY KPI CARDS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        {/* Card 1: Attendance Rate */}
        <div
          style={{
            background: 'var(--surface-raised)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Presence Today
            </span>
            <span style={{ fontSize: '18px' }}>🟢</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'var(--font-mono)', margin: '8px 0 2px', color: 'var(--text-primary)' }}>
            {metrics.presentToday} <span style={{ fontSize: '16px', fontWeight: 400, color: 'var(--text-tertiary)' }}>/ {metrics.totalEmployees}</span>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#10B981', fontWeight: 600 }}>{metrics.presenceRate}%</span> attendance rate
          </div>
        </div>

        {/* Card 2: Active Leaves */}
        <div
          style={{
            background: 'var(--surface-raised)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              On Leave Today
            </span>
            <span style={{ fontSize: '18px' }}>🌴</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'var(--font-mono)', margin: '8px 0 2px', color: 'var(--text-primary)' }}>
            {metrics.onLeaveToday}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            {leaves.pendingApprovalsCount || 0} pending application(s)
          </div>
        </div>

        {/* Card 3: Branches & Units */}
        <div
          style={{
            background: 'var(--surface-raised)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: '#06B6D4', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Branch Units
            </span>
            <span style={{ fontSize: '18px' }}>🏛️</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'var(--font-mono)', margin: '8px 0 2px', color: 'var(--text-primary)' }}>
            {branches.length}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            {branches.filter((b) => b.isHeadOffice).length} Head Office · {branches.filter((b) => !b.isHeadOffice).length} Branches
          </div>
        </div>

        {/* Card 4: Promotions & Milestones */}
        <div
          style={{
            background: 'var(--surface-raised)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: '#8B5CF6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Career Milestones
            </span>
            <span style={{ fontSize: '18px' }}>⭐</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'var(--font-mono)', margin: '8px 0 2px', color: 'var(--text-primary)' }}>
            {promotions.recentEvents?.length || 0}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Promotions & confirmations recorded
          </div>
        </div>

        {/* Card 5: Licence Seats */}
        <div
          style={{
            background: 'var(--surface-raised)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Licence & Seats
            </span>
            <span style={{ fontSize: '18px' }}>🔐</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-mono)', margin: '10px 0 4px', color: 'var(--text-primary)' }}>
            {usage.employees || 0} <span style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>/ {license.maxEmployees ?? '∞'} Seats</span>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: expired ? 'var(--danger)' : 'var(--text-secondary)' }}>
            {license.plan || 'Standard'} {license.daysLeft != null ? `(${license.daysLeft}d left)` : ''}
          </div>
        </div>
      </div>

      {/* 2. THE THREE CORE COLORFUL PIE CHARTS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 'var(--space-5)',
          marginBottom: 'var(--space-6)',
        }}
      >
        {/* CHART 1: ATTENDANCE & PRESENCE BREAKDOWN */}
        <Card>
          <div style={{ borderBottom: '2px solid #10B981', paddingBottom: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981' }} />
              Today&apos;s Presence Breakdown
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              Live presence status for {metrics.scopeName}
            </p>
          </div>

          <ColorfulPieChart
            data={metrics.attendancePie}
            size={200}
            donutWidth={34}
            centerTitle="Present"
            centerValue={`${metrics.presenceRate}%`}
          />
        </Card>

        {/* CHART 2: LEAVE TYPES DISTRIBUTION */}
        <Card>
          <div style={{ borderBottom: '2px solid #3B82F6', paddingBottom: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3B82F6' }} />
              Leave Types Distribution
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              Breakdown by Casual, Privilege, Medical & LOP
            </p>
          </div>

          <ColorfulPieChart
            data={leaves.pieChartData || []}
            size={200}
            donutWidth={34}
            centerTitle="Total Leaves"
            centerValue={leaves.pieChartData?.reduce((a, b) => a + Number(b.value), 0) || 0}
          />
        </Card>

        {/* CHART 3: CADRE & DESIGNATION DISTRIBUTION */}
        <Card>
          <div style={{ borderBottom: '2px solid #8B5CF6', paddingBottom: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#8B5CF6' }} />
              Staff Cadre Distribution
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              Headcount distribution across bank designations
            </p>
          </div>

          <ColorfulPieChart
            data={promotions.cadrePieChart || []}
            size={200}
            donutWidth={34}
            centerTitle="Staff"
            centerValue={metrics.totalEmployees}
          />
        </Card>
      </div>

      {/* 3. CORE BRANCH DETAILS & OPERATIONAL TELEMETRY */}
      <Card noPadding>
        {/* Navigation tabs for branch matrix and telemetry */}
        <div
          className="tabs"
          style={{
            padding: 'var(--space-3) var(--space-4) 0',
            margin: 0,
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-glass)',
          }}
        >
          <button
            type="button"
            className={`tab ${activeTab === 'branches' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('branches')}
          >
            🏛️ Branch Performance Matrix ({branches.length})
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'clockins' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('clockins')}
          >
            ⏱️ Today&apos;s Live Clock-Ins ({filteredClockIns.length})
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'leaves' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('leaves')}
          >
            🌴 Staff On Leave Today ({filteredLeaves.length})
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'promotions' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('promotions')}
          >
            ⭐ Promotions & Career Milestones ({filteredPromotions.length})
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'setup' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('setup')}
          >
            ⚙️ System Setup Checklist
          </button>
        </div>

        {/* TAB 1: BRANCH PERFORMANCE MATRIX */}
        {activeTab === 'branches' && (
          <div style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--text-base)' }}>Branch Operations & Attendance Matrix</h3>
                <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  Core operational statistics for each branch base across the bank
                </p>
              </div>
              {selectedBranchId !== 'ALL' && (
                <Button variant="secondary" onClick={() => setSelectedBranchId('ALL')}>
                  Reset to All Branches
                </Button>
              )}
            </div>

            {branches.length === 0 ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                No active branches found. Create bank branches under Organisation Structure.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th className="table-th">Branch Name & Code</th>
                      <th className="table-th">Unit Type</th>
                      <th className="table-th table-th-right">Total Staff</th>
                      <th className="table-th table-th-right" style={{ color: '#10B981' }}>Present</th>
                      <th className="table-th table-th-right" style={{ color: '#F59E0B' }}>On Leave</th>
                      <th className="table-th table-th-right" style={{ color: '#EF4444' }}>Absent</th>
                      <th className="table-th" style={{ width: '220px' }}>Presence Progress</th>
                      <th className="table-th table-th-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branches.map((b) => {
                      const isSelected = String(b.id) === String(selectedBranchId);
                      const rate = b.presenceRate || 0;
                      const progressColor = rate >= 85 ? '#10B981' : rate >= 65 ? '#F59E0B' : '#EF4444';

                      return (
                        <tr
                          key={b.id}
                          className="table-row"
                          style={{
                            background: isSelected ? 'var(--bg-glass-hover)' : 'transparent',
                            fontWeight: isSelected ? 600 : 400,
                          }}
                        >
                          <td className="table-td">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{b.name}</span>
                              <span className="mono" style={{ fontSize: '11px', color: 'var(--text-tertiary)', background: 'var(--bg-glass)', padding: '1px 6px', borderRadius: '4px' }}>
                                {b.code}
                              </span>
                            </div>
                          </td>
                          <td className="table-td">
                            <Badge variant={b.isHeadOffice ? 'info' : 'default'}>
                              {b.unitType === 'HEAD_OFFICE' || b.isHeadOffice ? 'Head Office' : 'Branch'}
                            </Badge>
                          </td>
                          <td className="table-td table-td-right mono" style={{ fontWeight: 600 }}>
                            {b.totalEmployees}
                          </td>
                          <td className="table-td table-td-right mono" style={{ color: '#10B981', fontWeight: 600 }}>
                            {b.presentToday}
                          </td>
                          <td className="table-td table-td-right mono" style={{ color: '#F59E0B', fontWeight: 600 }}>
                            {b.onLeaveToday}
                          </td>
                          <td className="table-td table-td-right mono" style={{ color: '#EF4444', fontWeight: 600 }}>
                            {b.absentToday}
                          </td>
                          <td className="table-td">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div
                                style={{
                                  flex: 1,
                                  height: '8px',
                                  backgroundColor: 'var(--border)',
                                  borderRadius: '4px',
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{
                                    width: `${rate}%`,
                                    height: '100%',
                                    backgroundColor: progressColor,
                                    borderRadius: '4px',
                                    transition: 'width 0.4s ease',
                                  }}
                                />
                              </div>
                              <span className="mono" style={{ fontSize: '11px', fontWeight: 600, minWidth: '32px', textAlign: 'right', color: progressColor }}>
                                {rate}%
                              </span>
                            </div>
                          </td>
                          <td className="table-td table-td-right">
                            <Button
                              variant={isSelected ? 'primary' : 'ghost'}
                              style={{ padding: '2px 8px', fontSize: '12px', minHeight: 'auto' }}
                              onClick={() => setSelectedBranchId(isSelected ? 'ALL' : String(b.id))}
                            >
                              {isSelected ? 'Viewing' : 'Inspect'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LIVE CLOCK-IN FEED */}
        {activeTab === 'clockins' && (
          <div style={{ padding: 'var(--space-4)' }}>
            <h3 style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-base)' }}>
              Recent Check-Ins Today ({metrics.scopeName})
            </h3>
            {filteredClockIns.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', margin: 'var(--space-4) 0' }}>
                No clock-in events recorded yet for today in this scope.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th className="table-th">Employee</th>
                      <th className="table-th">Branch</th>
                      <th className="table-th">Check-In Time</th>
                      <th className="table-th">Check-Out Time</th>
                      <th className="table-th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClockIns.map((ci) => (
                      <tr key={ci.id} className="table-row">
                        <td className="table-td">
                          <span style={{ fontWeight: 600 }}>{ci.name}</span>{' '}
                          <span className="mono" style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>({ci.empCode})</span>
                        </td>
                        <td className="table-td">{ci.branchName}</td>
                        <td className="table-td mono" style={{ color: '#10B981', fontWeight: 600 }}>{ci.checkInTime}</td>
                        <td className="table-td mono">{ci.checkOutTime || '—'}</td>
                        <td className="table-td">
                          <Badge variant={ci.checkOutTime ? 'default' : 'success'}>
                            {ci.checkOutTime ? 'Clocked Out' : 'Active / Present'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: STAFF ON LEAVE */}
        {activeTab === 'leaves' && (
          <div style={{ padding: 'var(--space-4)' }}>
            <h3 style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-base)' }}>
              Staff on Approved Leave ({metrics.scopeName})
            </h3>
            {filteredLeaves.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', margin: 'var(--space-4) 0' }}>
                No staff members currently on leave today.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th className="table-th">Employee</th>
                      <th className="table-th">Branch</th>
                      <th className="table-th">Leave Type</th>
                      <th className="table-th">Duration</th>
                      <th className="table-th">From - To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeaves.map((l) => (
                      <tr key={l.id} className="table-row">
                        <td className="table-td">
                          <span style={{ fontWeight: 600 }}>{l.name}</span>{' '}
                          <span className="mono" style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>({l.empCode})</span>
                        </td>
                        <td className="table-td">{l.branchName}</td>
                        <td className="table-td">
                          <Badge variant="warning">{l.leaveType}</Badge>
                        </td>
                        <td className="table-td mono">{l.days} Day(s)</td>
                        <td className="table-td mono">{l.fromDate} to {l.toDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: PROMOTIONS & MILESTONES */}
        {activeTab === 'promotions' && (
          <div style={{ padding: 'var(--space-4)' }}>
            <h3 style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-base)' }}>
              Recent Promotions & Career Milestones ({metrics.scopeName})
            </h3>
            {filteredPromotions.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', margin: 'var(--space-4) 0' }}>
                No recent career promotions or cadre changes recorded.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th className="table-th">Date</th>
                      <th className="table-th">Employee</th>
                      <th className="table-th">Branch</th>
                      <th className="table-th">Event</th>
                      <th className="table-th">Current Cadre</th>
                      <th className="table-th">Order Ref / Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPromotions.map((p) => (
                      <tr key={p.id} className="table-row">
                        <td className="table-td mono">{p.eventDate}</td>
                        <td className="table-td">
                          <span style={{ fontWeight: 600 }}>{p.name}</span>{' '}
                          <span className="mono" style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>({p.empCode})</span>
                        </td>
                        <td className="table-td">{p.branchName}</td>
                        <td className="table-td">
                          <Badge variant="info">{p.eventType}</Badge>
                        </td>
                        <td className="table-td">{p.cadre}</td>
                        <td className="table-td">{p.orderRef ? <span className="mono">[{p.orderRef}] </span> : ''}{p.remarks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: SYSTEM SETUP CHECKLIST */}
        {activeTab === 'setup' && (
          <div style={{ padding: 'var(--space-4)' }}>
            <h3 style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-base)' }}>Getting Started Checklist</h3>
            <div className="checklist">
              <ChecklistItem done={!!settings?.organization?.name} label="Organisation profile and details configured" />
              <ChecklistItem done={!!settings?.smtp?.enabled} label="Email notification service (SMTP) configured" />
              <ChecklistItem done={(usage.users || 0) > 0} label="System administrative users created" />
              <ChecklistItem done={(usage.employees || 0) > 0} label="Bank employee records onboarded" />
              <ChecklistItem done={branches.length > 0} label="Bank branch hierarchy configured" />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function ChecklistItem({ done, label }) {
  return (
    <div className={`checklist-item ${done ? 'checklist-done' : ''}`}>
      <span className="checklist-check">{done ? '✓' : '○'}</span>
      <span>{label}</span>
    </div>
  );
}
