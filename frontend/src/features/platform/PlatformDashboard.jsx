import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { platformApi, fmt } from '../../api/client';
import { Card } from '../../components/ui/Card';
import { StatLedger } from '../../components/ui/StatLedger';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';

/* The dashboard summary is { organisations: { total, active, suspended,
   expired, expiringSoon }, orgUsers, platformUsers, failedLogins24h } and the
   organisations list is an array of orgView rows carrying license + usage. */
export function PlatformDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-dashboard'],
    queryFn: platformApi.dashboard,
  });

  const { data: orgs, isLoading: orgsLoading } = useQuery({
    queryKey: ['organisations'],
    queryFn: () => platformApi.organizations(),
  });

  const summary = data?.organisations || {};
  const rows = orgs?.rows || [];

  const attention = rows
    .map((org) => {
      const state = org.license?.state;
      const daysLeft = org.license?.daysLeft;
      if (org.status !== 'ACTIVE') return { ...org, issue: 'Suspended', severity: 'danger' };
      if (state === 'ORG_LICENSE_EXPIRED') return { ...org, issue: 'Licence expired', severity: 'danger' };
      if (daysLeft != null && daysLeft <= 30) return { ...org, issue: `Licence expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, severity: 'warning' };
      return null;
    })
    .filter(Boolean);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Platform Overview</h1>
        <p>Platform health, organisations, and activity</p>
      </header>

      <div className="stat-grid">
        <StatLedger label="Organisations" value={summary.total || 0} subValue={`${summary.active || 0} active`} />
        <StatLedger label="Expiring Soon" value={summary.expiringSoon || 0} subValue="Next 30 days" redInk={(summary.expiringSoon || 0) > 0} />
        <StatLedger label="Inactive" value={(summary.expired || 0) + (summary.suspended || 0)} subValue="Expired or suspended" />
        <StatLedger label="Bank Users" value={summary.orgUsers || 0} />
        <StatLedger label="Platform Users" value={summary.platformUsers || 0} />
        <StatLedger label="Failed Sign-ins" value={summary.failedLogins24h || 0} subValue="Last 24 hours" redInk={(summary.failedLogins24h || 0) > 0} />
      </div>

      <Card title="Needs Attention" noPadding>
        <Table
          columns={[
            { field: 'name', label: 'Organisation' },
            { field: 'code', label: 'Code', mono: true },
            { field: 'issue', label: 'Issue' },
            {
              field: 'severity',
              label: 'Severity',
              render: (row) => (
                <Badge variant={row.severity === 'danger' ? 'danger' : 'warning'}>
                  {row.severity === 'danger' ? 'Critical' : 'Watch'}
                </Badge>
              ),
            },
            {
              field: 'license',
              label: 'Valid Until',
              mono: true,
              render: (row) => fmt.date(row.license?.expiresAt),
            },
          ]}
          data={attention}
          keyField="id"
          loading={isLoading || orgsLoading}
          emptyMessage="No organisations need attention."
        />
      </Card>
    </div>
  );
}
