import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { arrearsApi } from '../../api/extended';
import { masterDataApi, fmt } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { StatLedger } from '../../components/ui/StatLedger';

const NEXT_STATUS = { DRAFT: 'APPROVED', APPROVED: 'ACTIVE', ACTIVE: 'CLOSED' };

export function ArrearsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ orderNumber: '', orderDate: '', effectiveFrom: '', effectiveTo: '', previousDaPercent: '', increasePercent: '' });
  const [error, setError] = useState('');

  const { data: revisions, isLoading } = useQuery({ queryKey: ['da-revisions'], queryFn: () => arrearsApi.revisions() });

  const { data: cases, isLoading: casesLoading } = useQuery({
    queryKey: ['arrears-cases', selected],
    queryFn: () => arrearsApi.casesForRevision(selected),
    enabled: !!selected,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['da-revisions'] });
    queryClient.invalidateQueries({ queryKey: ['arrears-cases', selected] });
  };

  const createMutation = useMutation({
    mutationFn: (payload) => arrearsApi.createRevision(payload),
    onSuccess: () => {
      invalidate();
      toast.add('DA revision created as draft.', 'success');
      setModalOpen(false);
      setForm({ orderNumber: '', orderDate: '', effectiveFrom: '', effectiveTo: '', previousDaPercent: '', increasePercent: '' });
    },
    onError: (err) => setError(err.message || 'Could not create revision.'),
  });

  const advanceMutation = useMutation({
    mutationFn: ({ id, status }) => arrearsApi.setRevisionStatus(id, status),
    onSuccess: () => { invalidate(); toast.add('Revision status updated.', 'success'); },
    onError: (err) => toast.add(err.message || 'Status change refused.', 'error'),
  });

  const calculateMutation = useMutation({
    mutationFn: (id) => arrearsApi.calculate(id),
    onSuccess: (res) => {
      invalidate();
      toast.add(`Calculated arrears for ${res.employeeCount} employee(s).`, 'success');
    },
    onError: (err) => toast.add(err.message || 'Calculation failed.', 'error'),
  });

  const rows = revisions?.rows || [];
  const caseRows = cases?.rows || [];
  const outstanding = caseRows.reduce((sum, c) => sum + Number(c.effectiveTotalAmount || 0), 0);

  const revisionColumns = [
    { field: 'orderNumber', label: 'Order Number', mono: true },
    { field: 'orderDate', label: 'Order Date', mono: true, render: (r) => fmt.date(r.orderDate) },
    { field: 'effectiveFrom', label: 'Effective From', mono: true, render: (r) => fmt.date(r.effectiveFrom) },
    { field: 'revisedDaPercent', label: 'Revised DA %', mono: true, align: 'right', render: (r) => `${Number(r.revisedDaPercent)}%` },
    { field: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'ACTIVE' ? 'success' : r.status === 'DRAFT' ? 'warning' : 'info'}>{r.status}</Badge> },
    {
      field: 'actions', label: '', sortable: false,
      render: (r) => (
        <div className="row-actions">
          <Button variant="secondary" size="sm" onClick={() => navigate(`/da-revisions/${r.id}`)}>Detail</Button>
          <Button variant="secondary" size="sm" onClick={() => setSelected(r.id)}>Cases</Button>
          <Button variant="secondary" size="sm" loading={calculateMutation.isPending} onClick={() => calculateMutation.mutate(r.id)}>Calculate</Button>
          {NEXT_STATUS[r.status] && (() => {
            const to = NEXT_STATUS[r.status];
            const needsApprover = to === 'APPROVED';
            const allowed = needsApprover ? can('ORG_ADMIN', 'APPROVING_AUTHORITY') : can('ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER');
            if (!allowed) return null;
            return (
              <Button size="sm" onClick={() => advanceMutation.mutate({ id: r.id, status: to })}>
                {to === 'APPROVED' ? 'Approve' : to === 'ACTIVE' ? 'Activate' : 'Close'}
              </Button>
            );
          })()}
        </div>
      ),
    },
  ];

  const caseColumns = [
    { field: 'empCode', label: 'Code', mono: true },
    { field: 'employeeName', label: 'Employee' },
    { field: 'monthsCount', label: 'Months', mono: true, align: 'right' },
    { field: 'totalCalculatedAmount', label: 'Calculated', mono: true, align: 'right', render: (r) => fmt.money(r.totalCalculatedAmount) },
    { field: 'effectiveTotalAmount', label: 'Effective', mono: true, align: 'right', render: (r) => fmt.money(r.effectiveTotalAmount) },
    { field: 'paymentMode', label: 'Payment', render: (r) => <Badge variant="info">{r.paymentMode?.replace(/_/g, ' ')}</Badge> },
    { field: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'FULLY_PAID' ? 'success' : r.status === 'CALCULATED' ? 'warning' : 'info'}>{r.status?.replace(/_/g, ' ')}</Badge> },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>DA Arrears</h1>
        <p>Dearness Allowance revisions and per-employee arrears</p>
      </header>

      <div className="stat-grid">
        <StatLedger label="DA Revisions" value={rows.length} />
        <StatLedger label="Arrears Cases" value={caseRows.length} subValue={selected ? 'For selected revision' : 'Select a revision'} />
        <StatLedger label="Outstanding Arrears" value={fmt.money(outstanding)} redInk={outstanding > 0} />
      </div>

      <Card title="DA Revisions" noPadding>
        <div className="table-toolbar">
          <div />
          <Button onClick={() => setModalOpen(true)}>Add DA Revision</Button>
        </div>
        <Table columns={revisionColumns} data={rows} keyField="id" loading={isLoading} emptyMessage="No DA revisions recorded." />
      </Card>

      <Card title={selected ? 'Arrears Cases' : 'Arrears Cases — select a revision above'} noPadding>
        <Table columns={caseColumns} data={caseRows} keyField="id" loading={casesLoading} emptyMessage="No arrears cases."
          onRowClick={(row) => navigate(`/arrears-cases/${row.id}`)} />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add DA Revision"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={createMutation.isPending} onClick={() => { setError(''); createMutation.mutate(form); }}>Create Draft</Button>
          </>
        }
      >
        <form noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="form-grid">
            <Input id="ar-num" label="Order Number" value={form.orderNumber} onChange={(e) => setForm({ ...form, orderNumber: e.target.value })} mono required />
            <Input id="ar-odate" label="Order Date" type="date" value={form.orderDate} onChange={(e) => setForm({ ...form, orderDate: e.target.value })} required />
            <Input id="ar-from" label="Effective From" type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} required />
            <Input id="ar-to" label="Effective To (optional)" type="date" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} />
            <Input id="ar-prev" label="Previous DA %" type="number" value={form.previousDaPercent} onChange={(e) => setForm({ ...form, previousDaPercent: e.target.value })} mono required />
            <Input id="ar-inc" label="Increase %" type="number" value={form.increasePercent} onChange={(e) => setForm({ ...form, increasePercent: e.target.value })} mono required />
          </div>
          <p className="form-note">Revised DA % is computed as previous + increase. A revision starts as DRAFT; approve, activate, then calculate arrears.</p>
        </form>
      </Modal>
    </div>
  );
}
