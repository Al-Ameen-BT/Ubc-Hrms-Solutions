import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { platformApi, fmt } from '../../api/client';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Table } from '../../components/ui/Table';
import {
  AttentionList,
  DashboardError,
  DashboardSkeleton,
  DashboardSummary,
} from '../dashboard/DashboardPrimitives';
import { countByLabel, platformHealth, prioritisePlatformAttention } from '../dashboard/dashboardModel';

const HEALTH_COLOURS = { success: '#15803d', warning: '#d97706', danger: '#c2413b', neutral: '#64748b' };
const CHART_COLOURS = ['#1d4ed8', '#0f766e', '#7c3aed', '#b45309', '#475569', '#0369a1'];

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="platform-chart-tooltip"><strong>{label || payload[0]?.payload?.label}</strong><span>{payload[0]?.value || 0} organisations</span></div>;
}

function PortfolioHealthChart({ items }) {
  const visible = items.filter((item) => Number(item.value) > 0);
  const total = visible.reduce((sum, item) => sum + Number(item.value), 0);
  const needsAction = visible.some((item) => item.tone === 'danger');
  return (
    <article className="platform-insight platform-health-chart">
      <header><div><h3>Portfolio health</h3><p>Current operating and licence state</p></div><Badge variant={needsAction ? 'danger' : 'success'}>{needsAction ? 'Action needed' : 'Healthy'}</Badge></header>
      {!total ? <p className="dashboard-empty">No organisation health data is available.</p> : <div className="platform-donut-layout">
        <div className="platform-donut" role="img" aria-label={`${total} organisations by operating and licence state`}>
          <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={visible} dataKey="value" nameKey="label" innerRadius="68%" outerRadius="94%" paddingAngle={2} stroke="none" isAnimationActive={false}>{visible.map((item) => <Cell key={item.label} fill={HEALTH_COLOURS[item.tone] || HEALTH_COLOURS.neutral} />)}</Pie><Tooltip content={<ChartTooltip />} /></PieChart></ResponsiveContainer>
          <div className="platform-donut-total"><strong>{total}</strong><span>organisations</span></div>
        </div>
        <ul className="platform-chart-legend">{visible.map((item) => <li key={item.label}><i style={{ background: HEALTH_COLOURS[item.tone] || HEALTH_COLOURS.neutral }} aria-hidden="true" /><span>{item.label}</span><strong>{item.value}</strong></li>)}</ul>
      </div>}
    </article>
  );
}

function BankClassChart({ items, loading, error, onView }) {
  const data = [...items].filter((item) => item.value > 0).sort((a, b) => b.value - a.value).slice(0, 6);
  return (
    <article className="platform-insight platform-class-chart">
      <header><div><h3>Bank-class coverage</h3><p>Organisations by catalogue classification</p></div><Button variant="ghost" size="sm" onClick={onView}>View all</Button></header>
      {loading ? <p className="dashboard-empty">Loading bank-class coverage…</p> : error ? <p className="dashboard-empty">Bank-class coverage is unavailable.</p> : !data.length ? <p className="dashboard-empty">No bank-class data is available.</p> : <div className="platform-horizontal-chart" role="img" aria-label="Organisation count by bank class">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ top: 4, right: 22, bottom: 4, left: 4 }}><XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: 'var(--dashboard-text-soft)', fontSize: 11 }} /><YAxis type="category" dataKey="label" width={105} axisLine={false} tickLine={false} tick={{ fill: 'var(--text-primary)', fontSize: 11 }} /><Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--dashboard-panel-muted)' }} /><Bar dataKey="value" radius={[0, 5, 5, 0]} barSize={18} isAnimationActive={false}>{data.map((item, index) => <Cell key={item.label} fill={CHART_COLOURS[index % CHART_COLOURS.length]} />)}</Bar></BarChart></ResponsiveContainer>
      </div>}
    </article>
  );
}

function UserFootprint({ organisationUsers, platformUsers }) {
  const items = [{ label: 'Organisation users', value: Number(organisationUsers) || 0, colour: '#1d4ed8' }, { label: 'Platform administrators', value: Number(platformUsers) || 0, colour: '#0f766e' }];
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return (
    <article className="platform-insight platform-user-chart">
      <header><div><h3>Active user footprint</h3><p>Enabled accounts across both platform layers</p></div><strong>{total}</strong></header>
      <div className="platform-user-bars" aria-label={`${total} active users`}>{items.map((item) => <div key={item.label}><span><i style={{ background: item.colour }} aria-hidden="true" />{item.label}</span><strong>{item.value}</strong><b><i style={{ width: `${total ? Math.max(4, (item.value / total) * 100) : 0}%`, background: item.colour }} /></b></div>)}</div>
    </article>
  );
}

export function PlatformDashboard() {
  const navigate = useNavigate();
  const dashboardQuery = useQuery({ queryKey: ['platform-dashboard'], queryFn: platformApi.dashboard });
  const organisationsQuery = useQuery({ queryKey: ['organisations'], queryFn: () => platformApi.organizations() });
  const data = dashboardQuery.data;
  const summary = data?.organisations || {};
  const rows = organisationsQuery.data?.rows || [];
  const health = platformHealth(summary);
  const inactive = health.suspended + health.expired;

  const attention = prioritisePlatformAttention(rows.map((organisation) => {
    const state = organisation.license?.state;
    const daysLeft = organisation.license?.daysLeft;
    if (organisation.status !== 'ACTIVE') return { ...organisation, issue: 'Suspended', severity: 'danger' };
    if (state === 'ORG_LICENSE_EXPIRED') return { ...organisation, issue: 'Licence expired', severity: 'danger' };
    if (daysLeft != null && daysLeft <= 30) {
      return { ...organisation, issue: `Licence expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, severity: 'warning' };
    }
    return null;
  }).filter(Boolean));
  const summaryAvailable = Boolean(data);

  const summaryItems = [
    {
      id: 'organisations', label: 'Total organisations', value: summaryAvailable ? summary.total || 0 : '—',
      detail: summaryAvailable ? `${summary.active || 0} active` : 'Platform summary unavailable', tone: 'neutral',
    },
    {
      id: 'expiring', label: 'Expiring within 30 days', value: summaryAvailable ? summary.expiringSoon || 0 : '—',
      detail: summaryAvailable ? 'Licence renewal window' : 'Platform summary unavailable', tone: summaryAvailable && Number(summary.expiringSoon) > 0 ? 'warning' : 'neutral',
    },
    {
      id: 'inactive', label: 'Inactive organisations', value: summaryAvailable ? inactive : '—',
      detail: summaryAvailable ? 'Expired or suspended' : 'Platform summary unavailable', tone: summaryAvailable && inactive > 0 ? 'danger' : 'neutral',
    },
    {
      id: 'sign-ins', label: 'Failed sign-ins', value: summaryAvailable ? data?.failedLogins24h || 0 : '—',
      detail: summaryAvailable ? 'During the last 24 hours' : 'Platform summary unavailable', tone: summaryAvailable && Number(data?.failedLogins24h) > 0 ? 'danger' : 'neutral',
    },
  ];
  const healthPie = [
    { label: 'Healthy active', value: health.active, tone: 'success' },
    { label: 'Expiring soon', value: health.expiring, tone: 'warning' },
    { label: 'Suspended', value: health.suspended, tone: 'danger' },
    { label: 'Expired', value: health.expired, tone: 'danger' },
  ];
  const bankClassDistribution = countByLabel(rows, 'bankClassLabel');
  const attentionItems = [
    ...attention.slice(0, 5).map((organisation) => ({
      id: `org-${organisation.id}`,
      title: organisation.name,
      detail: organisation.issue,
      tone: organisation.severity,
      actionLabel: 'Open',
      onAction: () => navigate(`/organisations/${organisation.id}`),
    })),
    Number(data?.failedLogins24h) > 0 && {
      id: 'failed-sign-ins',
      title: `${data.failedLogins24h} failed sign-in ${Number(data.failedLogins24h) === 1 ? 'attempt' : 'attempts'}`,
      detail: 'Recorded across the platform during the last 24 hours.',
      tone: 'danger',
    },
  ].filter(Boolean);

  if (dashboardQuery.isLoading && !data) return <DashboardSkeleton />;

  return (
    <div className="page dashboard-page platform-dashboard">
      <header className="dashboard-header platform-dashboard-header">
        <div className="dashboard-header-copy">
          <h1>Platform overview</h1>
          <p>Monitor organisation health, licence exposure, and access activity across UCB-HRMS.</p>
        </div>
        <div className="dashboard-actions">
          <Button variant="secondary" onClick={() => navigate('/platform-users')}>Manage platform users</Button>
          <Button onClick={() => navigate('/organisations/new')}>Add organisation</Button>
        </div>
      </header>

      {dashboardQuery.isError ? <DashboardError message="Platform summary data could not be loaded." onRetry={() => dashboardQuery.refetch()} /> : null}
      <DashboardSummary items={summaryItems} />

      <div className="platform-overview-grid">
        <section className="dashboard-panel platform-portfolio" aria-labelledby="platform-health-title">
          <div className="dashboard-panel-header"><div><h2 id="platform-health-title">Platform portfolio</h2><p>A concise view of coverage, operational state, and active users.</p></div><Button variant="ghost" size="sm" onClick={() => navigate('/organisations')}>Open organisations</Button></div>
          <div className="platform-insight-grid">
            <PortfolioHealthChart items={dashboardQuery.isError ? [] : healthPie} />
            <BankClassChart items={bankClassDistribution} loading={organisationsQuery.isLoading} error={organisationsQuery.isError} onView={() => navigate('/organisations')} />
            <UserFootprint organisationUsers={data?.orgUsers} platformUsers={data?.platformUsers} />
          </div>
        </section>

        <aside className="dashboard-panel platform-attention" aria-labelledby="platform-attention-title">
          <div className="dashboard-panel-header"><div><h2 id="platform-attention-title">Needs attention</h2><p>Prioritised licence and access exceptions.</p></div></div>
          <div className="dashboard-panel-body">
            {organisationsQuery.isLoading && !organisationsQuery.data ? <p className="dashboard-empty">Loading organisation exceptions…</p> : null}
            {organisationsQuery.isError ? <DashboardError message="Organisation attention details could not be loaded." onRetry={() => organisationsQuery.refetch()} /> : null}
            {(!organisationsQuery.isLoading && !organisationsQuery.isError) || Number(data?.failedLogins24h) > 0 ? (
              <AttentionList
                items={organisationsQuery.isError ? attentionItems.filter((item) => item.id === 'failed-sign-ins') : attentionItems}
                emptyTitle={summaryAvailable ? 'No immediate action required' : 'No organisation exceptions found'}
                emptyDetail={summaryAvailable ? 'Organisation licences and access activity are clear.' : 'Sign-in activity is unavailable until the platform summary reloads.'}
              />
            ) : null}
          </div>
        </aside>
      </div>

      <section className="dashboard-panel dashboard-workspace" aria-labelledby="attention-table-title">
        <div className="dashboard-panel-header"><div><h2 id="attention-table-title">Organisation attention register</h2><p>Licence and operating exceptions requiring platform follow-up.</p></div><Badge variant={attention.length ? 'warning' : 'success'}>{attention.length ? `${attention.length} open` : 'Clear'}</Badge></div>
        {organisationsQuery.isError ? <div className="dashboard-panel-body"><DashboardError message="The organisation attention register could not be loaded." onRetry={() => organisationsQuery.refetch()} /></div> : <Table
          columns={[
            { field: 'name', label: 'Organisation' },
            { field: 'code', label: 'Code', mono: true },
            { field: 'issue', label: 'Issue' },
            {
              field: 'severity', label: 'Severity', render: (row) => (
                <Badge variant={row.severity === 'danger' ? 'danger' : 'warning'}>{row.severity === 'danger' ? 'Critical' : 'Watch'}</Badge>
              ),
            },
            { field: 'license', label: 'Valid until', mono: true, render: (row) => fmt.date(row.license?.expiresAt) },
          ]}
          data={attention}
          keyField="id"
          loading={organisationsQuery.isLoading}
          emptyMessage="No organisations need attention."
        />}
      </section>
    </div>
  );
}
