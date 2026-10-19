import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { allowanceApi } from '../../api/extended';
import { fmt } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

export function AllowancesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', frequency: 'MONTHLY', amount: '', month: '', year: '', remarks: '' });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['allowances'], queryFn: () => allowanceApi.list() });

  const createMutation = useMutation({
    mutationFn: (payload) => allowanceApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allowances'] });
      toast.add('Allowance type created.', 'success');
      setModalOpen(false);
      setForm({ name: '', frequency: 'MONTHLY', amount: '', month: '', year: '', remarks: '' });
    },
    onError: (err) => setError(err.message || 'Could not create allowance.'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => allowanceApi.setStatus(id, status),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['allowances'] }); toast.add('Allowance updated.', 'success'); },
    onError: (err) => toast.add(err.message || 'Could not change status.', 'error'),
  });

  const columns = [
    { field: 'name', label: 'Allowance' },
    { field: 'frequency', label: 'Frequency', render: (r) => <Badge variant="info">{r.frequency?.replace(/_/g, ' ')}</Badge> },
    { field: 'amount', label: 'Amount', mono: true, align: 'right', render: (r) => fmt.money(r.amount) },
    { field: 'month', label: 'Month', mono: true, render: (r) => (r.month ? `${r.month}${r.year ? ` / ${r.year}` : ''}` : '—') },
    { field: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'ACTIVE' ? 'success' : 'default'}>{r.status}</Badge> },
    {
      field: 'actions', label: '', sortable: false,
      render: (r) => (
        <Button
          variant="secondary" size="sm"
          onClick={() => statusMutation.mutate({ id: r.id, status: r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}
        >
          {r.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        </Button>
      ),
    },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Allowances</h1>
        <p>Allowance types available in payroll</p>
      </header>

      <Card noPadding>
        <div className="table-toolbar">
          <div />
          <Button onClick={() => setModalOpen(true)}>Add Allowance</Button>
        </div>
        <Table columns={columns} data={data?.rows || []} keyField="id" loading={isLoading} emptyMessage="No allowance types configured." />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Allowance Type"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={createMutation.isPending} onClick={() => { setError(''); createMutation.mutate(form); }}>Create</Button>
          </>
        }
      >
        <form noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <Input id="al-name" label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="al-freq">Frequency</label>
              <select id="al-freq" className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
                <option value="ONE_TIME">One Time</option>
              </select>
            </div>
            <Input id="al-amt" label="Amount (₹)" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} mono required />
          </div>
          {form.frequency !== 'MONTHLY' && (
            <div className="form-grid">
              <Input id="al-month" label="Month (1-12)" type="number" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} mono />
              {form.frequency === 'ONE_TIME' && (
                <Input id="al-year" label="Year" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} mono />
              )}
            </div>
          )}
          <Input id="al-remarks" label="Remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </form>
      </Modal>
    </div>
  );
}
