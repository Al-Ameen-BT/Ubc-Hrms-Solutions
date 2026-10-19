import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { masterDataApi, fmt } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

/* Pay Revisions (routes/payScales.js — a plain crudFactory CRUD).
   A revision is the umbrella record that a new set of pay scales is built
   under; the scales themselves live in Pay Scales. */
export function PayRevisionsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', effectiveDate: '', ruleReferenceId: '', description: '', status: 'DRAFT' });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['pay-revisions'], queryFn: () => masterDataApi.payRevisions() });
  const { data: rules } = useQuery({ queryKey: ['ksr-rules-lite'], queryFn: () => masterDataApi.ksrRules() });

  const rows = data?.rows || [];
  const ruleRows = rules?.rows || [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pay-revisions'] });

  const save = useMutation({
    mutationFn: (payload) => (editing ? masterDataApi.updatePayRevision(editing.id, payload) : masterDataApi.createPayRevision(payload)),
    onSuccess: () => { invalidate(); setModalOpen(false); toast.add(editing ? 'Pay revision updated.' : 'Pay revision created.', 'success'); },
    onError: (err) => setError(err.message || 'Could not save.'),
  });

  const remove = useMutation({
    mutationFn: (row) => masterDataApi.deletePayRevision(row.id),
    onSuccess: () => { invalidate(); toast.add('Pay revision superseded.', 'success'); },
    onError: (err) => toast.add(err.message || 'Could not remove.', 'error'),
  });

  const openAdd = () => { setEditing(null); setForm({ name: '', effectiveDate: '', ruleReferenceId: '', description: '', status: 'DRAFT' }); setError(''); setModalOpen(true); };
  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name, effectiveDate: (row.effectiveDate || '').slice(0, 10), ruleReferenceId: row.ruleReferenceId ? String(row.ruleReferenceId) : '',
      description: row.description || '', status: row.status || 'DRAFT',
    });
    setError(''); setModalOpen(true);
  };

  const columns = [
    { field: 'name', label: 'Revision' },
    { field: 'effectiveDate', label: 'Effective', mono: true, render: (r) => fmt.date(r.effectiveDate) },
    {
      field: 'rule', label: 'Rule',
      render: (r) => {
        const rule = ruleRows.find((x) => String(x.id) === String(r.ruleReferenceId));
        return rule ? (rule.ruleNumber || rule.title) : '—';
      },
    },
    { field: 'description', label: 'Description', render: (r) => r.description || '—' },
    { field: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'ACTIVE' ? 'success' : r.status === 'SUPERSEDED' ? 'default' : 'warning'}>{r.status}</Badge> },
    {
      field: 'actions', label: '', sortable: false,
      render: (r) => (
        <div className="row-actions">
          <Button variant="secondary" size="sm" onClick={() => openEdit(r)}>Edit</Button>
          <Button variant="secondary" size="sm" onClick={() => { if (window.confirm('Supersede this pay revision?')) remove.mutate(r); }}>Supersede</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Pay Revisions</h1>
            <p>Umbrella records under which new pay scales are built. Superseding keeps history intact.</p>
          </div>
          <div className="page-header-actions">
            <Button onClick={openAdd}>New Pay Revision</Button>
          </div>
        </div>
      </header>

      <Card title="Pay Revisions" noPadding>
        <Table columns={columns} data={rows} keyField="id" loading={isLoading} emptyMessage="No pay revisions yet." />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Pay Revision' : 'New Pay Revision'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={save.isPending} onClick={() => { setError(''); save.mutate(form); }}>Save</Button>
          </>
        }
      >
        <form noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="form-grid">
            <Input id="pr-name" label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input id="pr-date" label="Effective Date" type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} required />
            <Input id="pr-desc" label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="field">
              <label className="field-label" htmlFor="pr-rule">Linked KSR Rule</label>
              <select id="pr-rule" className="input" value={form.ruleReferenceId} onChange={(e) => setForm({ ...form, ruleReferenceId: e.target.value })}>
                <option value="">None</option>
                {ruleRows.map((r) => <option key={r.id} value={r.id}>{r.ruleNumber || r.title}</option>)}
              </select>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
