import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orgApi, platformApi, fmt } from '../../api/client';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../auth/AuthContext';

const PAGE_SIZE = 50;

/* Friendly labels for the most common actions; anything else falls back to a
   de-slugged form of the raw action code. */
const ACTION_LABELS = {
  'auth.login': 'Sign in',
  'auth.login.failed': 'Failed sign in',
  'auth.logout': 'Sign out',
  'auth.password.change': 'Password changed',
  'auth.reset.requested': 'Password reset requested',
  'auth.reset.completed': 'Password reset completed',
  'auth.mfa.enabled': 'MFA enabled',
  'auth.mfa.disabled': 'MFA disabled',
  'auth.mfa.reset': 'MFA reset',
  'org.create': 'Organisation created',
  'org.update': 'Organisation updated',
  'org.profile.update': 'Org profile updated',
  'org.logo.update': 'Org logo updated',
  'user.create': 'User created',
  'user.update': 'User updated',
  'user.reset_password': 'Password reset',
  'payroll.run.processed': 'Payroll processed',
  'payroll.run.approved': 'Payroll approved',
  'payroll.run.rejected': 'Payroll rejected',
  'payroll.run.marked_paid': 'Payroll marked paid',
};

function actionLabel(action) {
  if (!action) return '—';
  return ACTION_LABELS[action] || action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* The most likely reason an entry is "failed"/denied, used for row styling. */
function isFailed(row) {
  const a = row.action || '';
  return /failed|denied|unknown|rejected/.test(a);
}

export function AuditPage() {
  const { isSuperAdmin } = useAuth();
  const api = isSuperAdmin ? platformApi : orgApi;
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [orgFilter, setOrgFilter] = useState('');

  const { data: orgs } = useQuery({
    queryKey: ['audit-orgs'],
    queryFn: () => platformApi.organizations({ limit: 500 }),
    enabled: isSuperAdmin,
  });

  const params = { page, pageSize: PAGE_SIZE };
  if (action.trim()) params.action = action.trim();
  if (isSuperAdmin && orgFilter) params.organizationId = orgFilter;

  const { data, isLoading } = useQuery({
    queryKey: ['audit', params],
    queryFn: () => api.audit(params),
    keepPreviousData: true,
  });

  const purge = useMutation({
    mutationFn: () => platformApi.purgeAudit(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      toast.add(`Purged ${res?.deleted ?? 0} expired entries.`, 'success');
    },
    onError: (err) => toast.add(err.message || 'Purge failed.', 'error'),
  });

  const rows = data?.data || data?.rows || [];
  const totalPages = data?.totalPages || 1;
  const total = data?.total ?? rows.length;
  const retention = data?.auditRetentionDays;

  const columns = [
    { field: 'createdAt', label: 'Time', mono: true, render: (row) => fmt.dateTime(row.createdAt) },
    { field: 'actorEmail', label: 'Actor', render: (row) => row.actorEmail || '—' },
    { field: 'action', label: 'Activity', render: (row) => actionLabel(row.action) },
    { field: 'target', label: 'Target', render: (row) => (row.targetType ? `${row.targetType}${row.targetId ? ` #${row.targetId}` : ''}` : '—') },
    { field: 'ip', label: 'IP', mono: true, render: (row) => row.ip || '—' },
  ];

  const onFilterChange = (fn) => { fn(); setPage(1); };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Audit Log</h1>
        <p>Security-relevant and administrative activity{retention ? ` · older than ${retention} days is removed automatically` : ''}</p>
      </header>

      <Card noPadding>
        <div className="table-toolbar">
          <Input
            id="audit-action"
            placeholder="Filter by activity (e.g. auth.login)"
            value={action}
            onChange={(e) => onFilterChange(() => setAction(e.target.value))}
            className="table-search"
          />
          {isSuperAdmin && (
            <select className="input" aria-label="Filter by organisation" value={orgFilter} onChange={(e) => onFilterChange(() => setOrgFilter(e.target.value))}>
              <option value="">All organisations</option>
              <option value="platform">Platform only</option>
              {(orgs?.organizations || orgs?.rows || []).map((o) => (
                <option key={o.id} value={o.id}>{o.code} — {o.name}</option>
              ))}
            </select>
          )}
          {isSuperAdmin && (
            <Button
              variant="secondary"
              loading={purge.isPending}
              onClick={() => { if (window.confirm('Run the audit retention purge now? Expired entries are deleted permanently.')) purge.mutate(); }}
            >
              Purge expired
            </Button>
          )}
        </div>

        <Table
          columns={columns}
          data={rows}
          keyField="id"
          loading={isLoading}
          emptyMessage="No audit entries."
          rowClassName={(row) => (isFailed(row) ? 'row-muted' : '')}
        />

        <div className="table-pagination">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Newer</Button>
          <span className="form-note">Page {data?.page || page} of {totalPages} ({total} {total === 1 ? 'entry' : 'entries'})</span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Older</Button>
        </div>
      </Card>
    </div>
  );
}
