import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { platformApi, fmt } from '../../api/client';
import { Badge } from '../../components/ui/Badge';
import { Table } from '../../components/ui/Table';
import {
  AttentionList,
  DashboardError,
  DashboardSkeleton,
  DashboardSummary,
  WorkplacePieChart,
} from '../dashboard/DashboardPrimitives';
import { countByLabel, platformHealth, prioritisePlatformAttention } from '../dashboard/dashboardModel';

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
  const bankClassPie = countByLabel(rows, 'bankClassLabel');
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
    <div className="page dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-header-copy">
          <h1>Platform Overview</h1>
          <p>Organisation health, licence exceptions, and access activity across the HRMS platform.</p>
        </div>
      </header>

      {dashboardQuery.isError ? <DashboardError message="Platform summary data could not be loaded." onRetry={() => dashboardQuery.refetch()} /> : null}
      <DashboardSummary items={summaryItems} />

      <div className="dashboard-control-grid">
        <section className="dashboard-panel" aria-labelledby="platform-health-title">
          <div className="dashboard-panel-header"><div><h2 id="platform-health-title">Platform portfolio</h2><p>Organisation health and bank-class coverage.</p></div></div>
          <div className="dashboard-pie-grid">
            <WorkplacePieChart title="How healthy is the organisation portfolio?" detail="Current licence and operating state." items={dashboardQuery.isError ? [] : healthPie} emptyMessage={dashboardQuery.isError ? 'Organisation health is unavailable.' : 'No organisation health data is available.'} unit="organisations" />
            <WorkplacePieChart title="Which bank classes are represented?" detail="Current organisation catalogue classification." items={bankClassPie} emptyMessage={organisationsQuery.isLoading ? 'Bank-class distribution is loading.' : organisationsQuery.isError ? 'Bank-class distribution is unavailable.' : 'No bank-class data is available.'} unit="organisations" />
          </div>
          <div className="dashboard-portfolio-totals" aria-label="Platform user totals">
            <span>Bank users <strong>{data?.orgUsers || 0}</strong></span>
            <span>Platform users <strong>{data?.platformUsers || 0}</strong></span>
          </div>
        </section>

        <aside className="dashboard-panel" aria-labelledby="platform-attention-title">
          <div className="dashboard-panel-header"><div><h2 id="platform-attention-title">Needs attention</h2><p>Highest-priority platform exceptions.</p></div></div>
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
        <div className="dashboard-panel-header"><div><h2 id="attention-table-title">Organisation attention register</h2><p>Complete list of organisations with licence or operating exceptions.</p></div></div>
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
