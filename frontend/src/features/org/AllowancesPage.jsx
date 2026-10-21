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
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';

export function AllowancesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', frequency: 'MONTHLY', amount: '', month: '', year: '', remarks: '' });
  const [error, setError] = useState('');
  const [statusTarget, setStatusTarget] = useState(null);
  const [actionError, setActionError] = useState('');

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
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['allowances'] });
      toast.add(`Allowance ${vars.status === 'ACTIVE' ? 'activated' : 'deactivated'}.`, 'success');
      setStatusTarget(null);
    },
    onError: (err) => setActionError(err.message || 'Could not change status.'),
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
          onClick={() => {
            setActionError('');
            setStatusTarget(r);
          }}
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

      <ConfirmationModal
        open={statusTarget != null}
        onClose={() => setStatusTarget(null)}
        onConfirm={() => statusMutation.mutate({
          id: statusTarget.id,
          status: statusTarget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
        })}
        title={statusTarget?.status === 'ACTIVE' ? 'Deactivate Allowance' : 'Activate Allowance'}
        itemName={statusTarget?.name}
        details={{
          'Frequency': statusTarget?.frequency?.replace(/_/g, ' '),
          'Amount': fmt.money(statusTarget?.amount),
          'Scheduled Period': statusTarget?.month ? `Month ${statusTarget.month}${statusTarget.year ? ` / ${statusTarget.year}` : ''}` : 'All Months',
        }}
        warningMessage={
          statusTarget?.status === 'ACTIVE'
            ? 'Deactivating this allowance will exclude it from upcoming monthly payroll runs and live payslip calculations across the bank.'
            : 'Activating this allowance will make it eligible for inclusion in upcoming payroll runs and live payslips.'
        }
        confirmLabel={statusTarget?.status === 'ACTIVE' ? 'Confirm Deactivation' : 'Confirm Activation'}
        confirmVariant={statusTarget?.status === 'ACTIVE' ? 'danger' : 'primary'}
        loading={statusMutation.isPending}
        error={actionError}
      />
    </div>
  );
}
