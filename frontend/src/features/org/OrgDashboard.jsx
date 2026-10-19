import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { orgApi, fmt } from '../../api/client';
import { Card } from '../../components/ui/Card';
import { StatLedger } from '../../components/ui/StatLedger';

/* Shape from routes/orgSettings.js GET /org/settings:
   { organization, loginUrl, license, usage, logo, smtp, platformSmtpAvailable } */
export function OrgDashboard() {
  const { data: settings } = useQuery({
    queryKey: ['org-settings'],
    queryFn: orgApi.settings,
  });

  const license = settings?.license || {};
  const usage = settings?.usage || {};
  const expired = license.expiresAt && new Date(license.expiresAt) < new Date();

  return (
    <div className="page">
      <header className="page-header">
        <h1>Bank Overview</h1>
        <p>Licence, seats, and establishment summary</p>
      </header>

      <div className="stat-grid">
        <StatLedger label="Licence Plan" value={license.plan || '—'} />
        <StatLedger label="Valid Until" value={fmt.date(license.expiresAt)} redInk={expired} subValue={license.daysLeft != null ? `${license.daysLeft} days left` : undefined} />
        <StatLedger label="Users" value={`${usage.users || 0} / ${license.maxUsers ?? '∞'}`} />
        <StatLedger label="Employees" value={`${usage.employees || 0} / ${license.maxEmployees ?? '∞'}`} />
        <StatLedger label="Email Status" value={settings?.smtp?.enabled ? 'Configured' : 'Not Set'} />
      </div>

      <Card title="Getting Started">
        <div className="checklist">
          <ChecklistItem done={!!settings?.organization?.name} label="Organisation details set" />
          <ChecklistItem done={!!settings?.smtp?.enabled} label="Email (SMTP) configured" />
          <ChecklistItem done={(usage.users || 0) > 0} label="Users created" />
          <ChecklistItem done={(usage.employees || 0) > 0} label="Employees added" />
        </div>
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
