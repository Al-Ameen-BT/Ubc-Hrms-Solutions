import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { platformApi, fmt } from '../../api/client';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Table } from '../../components/ui/Table';
import {
  AttentionList,
  DashboardError,
  DashboardSkeleton,
} from '../dashboard/DashboardPrimitives';
import '../dashboard/Dashboard.css';

function licenceBadge(row) {
  if (row.status !== 'ACTIVE') return { label: 'Suspended', variant: 'danger' };
  if (row.licenseState === 'ORG_LICENSE_EXPIRED') return { label: 'Expired', variant: 'danger' };
  if (row.daysLeft != null && row.daysLeft <= 30) return { label: `Expiring (${row.daysLeft}d)`, variant: 'warning' };
  if (row.licensePlan === 'TRIAL') return { label: 'Trial', variant: 'info' };
  if ((row.usersCount || 0) === 0) return { label: 'Pending Activation', variant: 'default' };
  return { label: 'Active', variant: 'success' };
}

function healthStatusBadge(status) {
  if (status === 'HEALTHY') return { label: 'Healthy', variant: 'success' };
  if (status === 'DEGRADED') return { label: 'Degraded', variant: 'warning' };
  if (status === 'CRITICAL') return { label: 'Critical', variant: 'danger' };
  return { label: 'Not verified', variant: 'default' };
}

function formatUptime(seconds) {
  const s = Number(seconds || 0);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatShortDateTime(val) {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="platform-chart-tooltip">
      <strong>{label}</strong>
      <span>{payload[0]?.value || 0} failed sign-in{payload[0]?.value === 1 ? '' : 's'}</span>
    </div>
  );
}

export function PlatformDashboard() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [licenceFilter, setLicenceFilter] = useState('ALL');
  const [securityWindow, setSecurityWindow] = useState('24h');
  const [showFailuresModal, setShowFailuresModal] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: ['platform-dashboard'],
    queryFn: platformApi.dashboard,
    refetchInterval: 60000,
  });

  const data = dashboardQuery.data;
  const summary = data?.organisations || {};
  const security = data?.security || {};
  const sys = data?.systemHealth || {};
  const orgMatrix = data?.orgMatrix || [];
  const recentActivity = data?.recentActivity || [];

  const filteredMatrix = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orgMatrix.filter((row) => {
      if (q && !`${row.name} ${row.code} ${row.bankClassLabel || ''}`.toLowerCase().includes(q)) {
        return false;
      }
      if (licenceFilter === 'ACTIVE') return row.status === 'ACTIVE' && row.licenseState !== 'ORG_LICENSE_EXPIRED' && (row.daysLeft == null || row.daysLeft > 30);
      if (licenceFilter === 'EXPIRING') return row.status === 'ACTIVE' && row.licenseState !== 'ORG_LICENSE_EXPIRED' && row.daysLeft != null && row.daysLeft <= 30;
      if (licenceFilter === 'TRIAL') return row.status === 'ACTIVE' && row.licensePlan === 'TRIAL';
      if (licenceFilter === 'EXPIRED') return row.status === 'ACTIVE' && row.licenseState === 'ORG_LICENSE_EXPIRED';
      if (licenceFilter === 'SUSPENDED') return row.status !== 'ACTIVE';
      return true;
    });
  }, [orgMatrix, search, licenceFilter]);

  const failedCount = securityWindow === '30d'
    ? (security.failed30d ?? 0)
    : securityWindow === '7d'
      ? (security.failed7d ?? 0)
      : (security.failed24h ?? data?.failedLogins24h ?? 0);

  const actionItems = useMemo(() => {
    const items = [];
    orgMatrix.forEach((org) => {
      if (org.status !== 'ACTIVE') {
        items.push({
          id: `susp-${org.id}`,
          title: `${org.name} (${org.code})`,
          detail: 'Organisation is suspended by administrative action.',
          tone: 'danger',
          actionLabel: 'Manage',
          onAction: () => navigate(`/organisations/${org.id}`),
        });
      } else if (org.licenseState === 'ORG_LICENSE_EXPIRED') {
        items.push({
          id: `exp-${org.id}`,
          title: `${org.name} (${org.code})`,
          detail: 'Licence validity has expired.',
          tone: 'danger',
          actionLabel: 'Renew',
          onAction: () => navigate(`/organisations/${org.id}`),
        });
      } else if (org.daysLeft != null && org.daysLeft <= 30) {
        items.push({
          id: `soon-${org.id}`,
          title: `${org.name} (${org.code})`,
          detail: `Licence expires in ${org.daysLeft} day${org.daysLeft === 1 ? '' : 's'}.`,
          tone: 'warning',
          actionLabel: 'Review',
          onAction: () => navigate(`/organisations/${org.id}`),
        });
      }
    });

    if (Number(security.failed24h) > 0) {
      const affectedCount = security.affectedOrganizations?.length || 0;
      items.push({
        id: 'sec-failures',
        title: `${security.failed24h} failed sign-in attempt${security.failed24h === 1 ? '' : 's'} (24h)`,
        detail: `${security.distinctIps24h || 0} unique IP${security.distinctIps24h === 1 ? '' : 's'} · ${affectedCount} org${affectedCount === 1 ? '' : 's'} · ${security.platformAdminFailed24h || 0} platform admin`,
        tone: security.failed24h >= 10 || security.platformAdminFailed24h > 0 ? 'danger' : 'warning',
        actionLabel: 'Investigate',
        onAction: () => setShowFailuresModal((v) => !v),
      });
    }
    return items;
  }, [orgMatrix, security, navigate]);

  // Bank-class compact distribution
  const classSummary = useMemo(() => {
    const map = new Map();
    orgMatrix.forEach((o) => {
      const label = o.bankClassLabel || 'Unclassified';
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [orgMatrix]);

  const totalAccounts = (Number(data?.orgUsers) || 0) + (Number(data?.platformUsers) || 0);
  const dbHealth = healthStatusBadge(sys.database?.status);

  if (dashboardQuery.isLoading && !data) return <DashboardSkeleton />;

  return (
    <div className="page dashboard-page platform-dashboard">
      {/* Header */}
      <header className="dashboard-header platform-dashboard-header">
        <div className="dashboard-header-copy">
          <h1>Platform Control Centre</h1>
          <p>
            Customer portfolio health, licence lifecycle, authentication security, and service availability.
            {data?.checkedAt && <span className="platform-freshness"> · Checked {formatShortDateTime(data.checkedAt)}</span>}
          </p>
        </div>
        <div className="dashboard-actions">
          <Button variant="secondary" size="sm" onClick={() => dashboardQuery.refetch()} loading={dashboardQuery.isFetching}>
            Refresh
          </Button>
          <Button variant="secondary" onClick={() => navigate('/platform-role-control')}>
            Role &amp; Feature Control
          </Button>
          <Button onClick={() => navigate('/organisations/new')}>Add organisation</Button>
        </div>
      </header>

      {dashboardQuery.isError && (
        <DashboardError message="Platform telemetry could not be loaded." onRetry={() => dashboardQuery.refetch()} />
      )}

      {/* Global Filter Bar */}
      <div className="platform-filter-bar" role="region" aria-label="Platform dashboard filters">
        <div className="platform-filter-group">
          <input
            type="search"
            className="input platform-filter-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter organisations by name, code, or bank class…"
            aria-label="Filter organisations"
          />
          <select
            className="input platform-filter-select"
            value={licenceFilter}
            onChange={(e) => setLicenceFilter(e.target.value)}
            aria-label="Filter by licence state"
          >
            <option value="ALL">All Licence States ({orgMatrix.length})</option>
            <option value="ACTIVE">Active ({summary.active ?? 0})</option>
            <option value="EXPIRING">Expiring &le; 30d ({summary.expiringSoon ?? 0})</option>
            <option value="TRIAL">Trial ({summary.trial ?? 0})</option>
            <option value="EXPIRED">Expired ({summary.expired ?? 0})</option>
            <option value="SUSPENDED">Suspended ({summary.suspended ?? 0})</option>
          </select>
        </div>
        <div className="platform-filter-group">
          <label htmlFor="sec-window-select" className="platform-filter-label">Security window:</label>
          <select
            id="sec-window-select"
            className="input platform-filter-select"
            value={securityWindow}
            onChange={(e) => setSecurityWindow(e.target.value)}
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>
      </div>

      {/* 6 Operational KPI Cards with Drill-Downs */}
      <section className="platform-kpi-grid" aria-label="Operational KPIs">
        <button type="button" className="platform-kpi-card" onClick={() => navigate('/organisations')}>
          <span className="platform-kpi-label">Customer Organisations</span>
          <strong className="platform-kpi-value">{summary.total ?? '—'}</strong>
          <span className="platform-kpi-sub">{summary.active ?? 0} active · {summary.trial ?? 0} trial</span>
        </button>

        <button type="button" className="platform-kpi-card" onClick={() => setLicenceFilter('EXPIRING')}>
          <span className="platform-kpi-label">Licence Renewals (&le;30d)</span>
          <strong className={`platform-kpi-value ${Number(summary.expiringSoon) > 0 ? 'tone-warning' : ''}`}>
            {summary.expiringSoon ?? '—'}
          </strong>
          <span className="platform-kpi-sub">
            {summary.expired ?? 0} expired · {summary.suspended ?? 0} suspended
          </span>
        </button>

        <div className="platform-kpi-card static">
          <span className="platform-kpi-label">Core Service &amp; DB</span>
          <strong className={`platform-kpi-value ${sys.database?.status === 'CRITICAL' ? 'tone-danger' : 'tone-success'}`}>
            {dbHealth.label}
          </strong>
          <span className="platform-kpi-sub">
            DB {sys.database?.latencyMs != null ? `${sys.database.latencyMs} ms` : '—'} · Uptime {formatUptime(sys.backend?.uptimeSeconds)}
          </span>
        </div>

        <button type="button" className="platform-kpi-card" onClick={() => setShowFailuresModal((v) => !v)}>
          <span className="platform-kpi-label">Auth Failures ({securityWindow})</span>
          <strong className={`platform-kpi-value ${failedCount > 0 ? 'tone-danger' : ''}`}>
            {failedCount}
          </strong>
          <span className="platform-kpi-sub">
            {security.distinctIps24h ?? 0} IPs (24h) · {security.platformAdminFailed24h ?? 0} admin
          </span>
        </button>

        <button type="button" className="platform-kpi-card" onClick={() => navigate('/platform-users')}>
          <span className="platform-kpi-label">Enabled Accounts</span>
          <strong className="platform-kpi-value">{totalAccounts}</strong>
          <span className="platform-kpi-sub">
            {data?.orgUsers ?? 0} org · {data?.platformUsers ?? 0} platform
          </span>
        </button>

        <button type="button" className="platform-kpi-card" onClick={() => navigate('/platform-role-control')}>
          <span className="platform-kpi-label">Access &amp; Feature Control</span>
          <strong className="platform-kpi-value">RBAC</strong>
          <span className="platform-kpi-sub">Manage tenant roles &amp; modules</span>
        </button>
      </section>

      {/* Primary Component: Organisation Health Matrix */}
      <section className="dashboard-panel dashboard-workspace" aria-labelledby="org-matrix-title">
        <div className="dashboard-panel-header">
          <div>
            <h2 id="org-matrix-title">Organisation Health &amp; Licence Matrix</h2>
            <p>Independent commercial entitlement, configuration readiness, and security posture per customer.</p>
          </div>
          <Badge variant="info">
            Showing {filteredMatrix.length} of {orgMatrix.length}
          </Badge>
        </div>

        <Table
          columns={[
            {
              field: 'name',
              label: 'Organisation',
              render: (row) => (
                <div className="platform-matrix-org">
                  <strong>{row.name}</strong>
                  <small className="mono">{row.code} · {row.bankClassLabel || 'Unclassified'}</small>
                </div>
              ),
            },
            {
              field: 'licenseState',
              label: 'Licence Status',
              render: (row) => {
                const b = licenceBadge(row);
                return (
                  <div className="platform-matrix-cell">
                    <Badge variant={b.variant} size="sm">{b.label}</Badge>
                    <small className="mono">{row.licenseExpiresAt ? fmt.date(row.licenseExpiresAt) : 'No expiry'}</small>
                  </div>
                );
              },
            },
            {
              field: 'usersCount',
              label: 'Accounts / Seats',
              mono: true,
              render: (row) => `${row.usersCount} / ${row.maxUsers ?? '∞'} users · ${row.employeesCount} emp`,
            },
            {
              field: 'smtpStatus',
              label: 'SMTP & Domain',
              render: (row) => (
                <div className="platform-matrix-cell">
                  <Badge variant={row.smtpStatus === 'HEALTHY' ? 'success' : row.smtpStatus === 'DEGRADED' ? 'warning' : 'default'} size="sm">
                    SMTP: {row.smtpStatus === 'HEALTHY' ? 'OK' : row.smtpStatus === 'DEGRADED' ? 'Error' : 'Unset'}
                  </Badge>
                  <small>{row.customDomain ? (row.customDomainVerified ? `${row.customDomain} (Verified)` : `${row.customDomain} (Pending)`) : 'Shared URL'}</small>
                </div>
              ),
            },
            {
              field: 'failedLogins24h',
              label: 'Auth Failures (24h)',
              render: (row) => (
                <Badge variant={row.failedLogins24h > 0 ? 'danger' : 'success'} size="sm">
                  {row.failedLogins24h} {row.failedLogins24h === 1 ? 'failure' : 'failures'}
                </Badge>
              ),
            },
            {
              field: 'lastActivityAt',
              label: 'Last Activity',
              render: (row) => <span className="mono" style={{ fontSize: '12px' }}>{formatShortDateTime(row.lastActivityAt)}</span>,
            },
            {
              field: 'actions',
              label: '',
              sortable: false,
              render: (row) => (
                <div className="row-actions">
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/organisations/${row.id}`)}>Manage</Button>
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/platform-role-control?orgId=${row.id}`)}>Roles</Button>
                </div>
              ),
            },
          ]}
          data={filteredMatrix}
          keyField="id"
          emptyMessage="No organisations match the selected filter."
        />
      </section>

      {/* Operational 2-Column Row: Action Centre + Infrastructure Health */}
      <div className="platform-two-col-grid">
        {/* Platform Action Centre */}
        <section className="dashboard-panel" aria-labelledby="platform-action-title">
          <div className="dashboard-panel-header">
            <div>
              <h2 id="platform-action-title">Platform Action Centre</h2>
              <p>Prioritised licence renewals, suspensions, and authentication exceptions.</p>
            </div>
            <Badge variant={actionItems.length ? 'warning' : 'success'}>
              {actionItems.length ? `${actionItems.length} active` : 'Clear'}
            </Badge>
          </div>
          <div className="dashboard-panel-body">
            <AttentionList
              items={actionItems}
              emptyTitle="No organisation exceptions detected"
              emptyDetail={`Licence and authentication checks completed at ${formatShortDateTime(data?.checkedAt)}.`}
            />

            {showFailuresModal && (
              <div className="platform-sec-drilldown">
                <div className="platform-sec-drilldown-head">
                  <strong>Recent Failed Sign-In Events (Last 10)</strong>
                  <Button size="sm" variant="ghost" onClick={() => navigate('/audit')}>Full Audit Log</Button>
                </div>
                {security.recentFailures?.length ? (
                  <div className="platform-sec-list">
                    {security.recentFailures.map((ev) => (
                      <div key={ev.id} className="platform-sec-row">
                        <div>
                          <strong>{ev.actorEmail}</strong>
                          <small>{ev.organizationName} · IP {ev.ip}</small>
                        </div>
                        <span className="mono">{formatShortDateTime(ev.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="dashboard-empty">No failed sign-in events recorded in the last 30 days.</p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* System Health & Adaptive Coverage */}
        <section className="dashboard-panel" aria-labelledby="platform-infra-title">
          <div className="dashboard-panel-header">
            <div>
              <h2 id="platform-infra-title">Platform Service Health</h2>
              <p>Verified runtime checks vs. unmonitored external services.</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            <div className="platform-health-rows">
              {[
                { name: 'Backend API', status: sys.backend?.status, detail: `Uptime ${formatUptime(sys.backend?.uptimeSeconds)}` },
                { name: 'Database Service', status: sys.database?.status, detail: sys.database?.latencyMs != null ? `${sys.database.latencyMs} ms response` : '—' },
                { name: 'Platform SMTP Relay', status: sys.platformSmtp?.status, detail: sys.platformSmtp?.status === 'UNKNOWN' ? 'Not configured' : 'Relay checked' },
                { name: 'Background Workers', status: sys.backgroundWorkers?.status, detail: 'Telemetry not verified' },
                { name: 'Automated Backups', status: sys.backups?.status, detail: 'Telemetry not verified' },
                { name: 'Object Storage', status: sys.storage?.status, detail: 'Telemetry not verified' },
              ].map((svc) => {
                const b = healthStatusBadge(svc.status);
                return (
                  <div key={svc.name} className="platform-health-row">
                    <div>
                      <strong>{svc.name}</strong>
                      <small>{svc.detail}</small>
                    </div>
                    <Badge variant={b.variant} size="sm">{b.label}</Badge>
                  </div>
                );
              })}
            </div>

            {/* Adaptive Bank-Class Coverage (compact representation) */}
            <div className="platform-class-compact">
              <div className="platform-class-compact-head">
                <strong>Bank Classification Coverage</strong>
                <span>{orgMatrix.length} total</span>
              </div>
              {classSummary.length === 1 ? (
                <p className="platform-class-single">
                  <strong>100%</strong> {classSummary[0].label} ({classSummary[0].count} / {orgMatrix.length})
                </p>
              ) : (
                <div className="platform-class-pills">
                  {classSummary.map((c) => (
                    <Badge key={c.label} variant="default" size="sm">{c.label}: {c.count}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Bottom Row: 7-Day Authentication Trend + Recent Platform Activity */}
      <div className="platform-two-col-grid">
        <section className="dashboard-panel" aria-labelledby="auth-trend-title">
          <div className="dashboard-panel-header">
            <div>
              <h2 id="auth-trend-title">Authentication Failures (7-Day Trend)</h2>
              <p>Daily failed sign-ins across all organisations and platform accounts.</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => navigate('/audit')}>Audit Log</Button>
          </div>
          <div className="dashboard-panel-body">
            <div style={{ width: '100%', height: '180px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={security.trend7d || []} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<TrendTooltip />} />
                  <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="dashboard-panel" aria-labelledby="recent-activity-title">
          <div className="dashboard-panel-header">
            <div>
              <h2 id="recent-activity-title">Recent Platform Activity</h2>
              <p>Latest Super Admin configuration and lifecycle changes.</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => navigate('/audit')}>View all</Button>
          </div>
          <div className="dashboard-panel-body">
            {recentActivity.length ? (
              <div className="platform-sec-list">
                {recentActivity.map((act) => (
                  <div key={act.id} className="platform-sec-row">
                    <div>
                      <strong className="mono" style={{ fontSize: '12px' }}>{act.action}</strong>
                      <small>{act.actorEmail}{act.targetType ? ` · ${act.targetType}${act.targetId ? ` #${act.targetId}` : ''}` : ''}</small>
                    </div>
                    <span className="mono">{formatShortDateTime(act.createdAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="dashboard-empty">No recent platform administrative actions recorded.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
