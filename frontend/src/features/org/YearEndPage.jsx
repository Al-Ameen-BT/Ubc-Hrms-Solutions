import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { yearEndApi } from '../../api/extended';
import { fmt } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { StatLedger } from '../../components/ui/StatLedger';

export function YearEndPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [closeYear, setCloseYear] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [viewYear, setViewYear] = useState(null);

  const { data: years, isLoading } = useQuery({
    queryKey: ['year-end-years', orgId],
    queryFn: () => yearEndApi.years(orgId),
    enabled: !!orgId,
  });

  const { data: summary } = useQuery({
    queryKey: ['year-end-summary', orgId, viewYear],
    queryFn: () => yearEndApi.summary(orgId, viewYear),
    enabled: !!orgId && !!viewYear,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['year-end-years', orgId] });
    queryClient.invalidateQueries({ queryKey: ['year-end-summary', orgId, viewYear] });
  };

  const closeMutation = useMutation({
    mutationFn: ({ year, text }) => yearEndApi.close(orgId, year, text),
    onSuccess: () => { invalidate(); toast.add('Year closed.', 'success'); setCloseYear(null); setRemarks(''); },
    onError: (err) => toast.add(err.message || 'Could not close the year.', 'error'),
  });

  const reopenMutation = useMutation({
    mutationFn: (year) => yearEndApi.reopen(orgId, year),
    onSuccess: () => { invalidate(); toast.add('Year reopened.', 'success'); },
    onError: (err) => toast.add(err.message || 'Could not reopen the year.', 'error'),
  });

  const rows = years?.rows || [];
  const openYears = rows.filter((r) => r.status === 'OPEN').length;
  const closedYears = rows.filter((r) => r.status === 'CLOSED').length;

  const columns = [
    { field: 'year', label: 'Year', mono: true },
    { field: 'startDate', label: 'From', mono: true, render: (r) => fmt.date(r.startDate) },
    { field: 'endDate', label: 'To', mono: true, render: (r) => fmt.date(r.endDate) },
    { field: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'CLOSED' ? 'success' : 'warning'}>{r.status}</Badge> },
    { field: 'closedAt', label: 'Closed On', mono: true, render: (r) => fmt.dateTime(r.closedAt) },
    {
      field: 'actions', label: '', sortable: false,
      render: (r) => (
        <div className="row-actions">
          <Button variant="secondary" size="sm" onClick={() => setViewYear(r.year)}>Summary</Button>
          {r.status === 'OPEN'
            ? <Button size="sm" onClick={() => setCloseYear(r.year)}>Close Year</Button>
            : <Button size="sm" variant="secondary" onClick={() => reopenMutation.mutate(r.year)}>Reopen</Button>}
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Year-End Process</h1>
        <p>Close the year and lock its payroll, or reopen to correct it</p>
      </header>

      <div className="stat-grid">
        <StatLedger label="Years Touched" value={rows.length} />
        <StatLedger label="Open Years" value={openYears} />
        <StatLedger label="Closed Years" value={closedYears} />
      </div>

      {summary && (
        <Card title={`Summary — ${summary.closure?.year}`}>
          <div className="stat-grid">
            <StatLedger label="Payroll Runs Included" value={`${summary.payrollRunsIncluded} / ${summary.payrollRunsExpected}`} />
            <StatLedger label="Gross Earnings" value={fmt.money(summary.totals?.grossEarnings)} />
            <StatLedger label="Deductions" value={fmt.money(summary.totals?.deductions)} />
            <StatLedger label="Net Pay" value={fmt.money(summary.totals?.netPay)} />
          </div>
        </Card>
      )}

      <Card title="Year-End Register" noPadding>
        <Table columns={columns} data={rows} keyField="id" loading={isLoading} emptyMessage="No year-end records yet." />
      </Card>

      <Modal
        open={closeYear != null}
        onClose={() => setCloseYear(null)}
        title={`Close Year ${closeYear ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCloseYear(null)}>Cancel</Button>
            <Button loading={closeMutation.isPending} onClick={() => closeMutation.mutate({ year: closeYear, text: remarks })}>
              Confirm &amp; Close
            </Button>
          </>
        }
      >
        <p className="form-note">Closing snapshots this year's payroll totals and blocks further payroll runs for it until reopened. This is a governance action.</p>
        <Input id="ye-remarks" label="Remarks (optional)" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </Modal>
    </div>
  );
}
