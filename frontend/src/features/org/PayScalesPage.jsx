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
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';

export function PayScalesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [stageScale, setStageScale] = useState(null);
  const [activateTarget, setActivateTarget] = useState(null);
  const [suppressTarget, setSuppressTarget] = useState(null);
  const [actionError, setActionError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ code: '', name: '', payRevisionId: '', effectiveFrom: '', status: 'ACTIVE' });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['pay-scales'],
    queryFn: () => masterDataApi.payScales(),
  });

  const { data: revisions } = useQuery({
    queryKey: ['pay-revisions'],
    queryFn: () => masterDataApi.payRevisions(),
  });

  const revisionName = (id) => (revisions?.rows || []).find((r) => String(r.id) === String(id))?.name || '—';

  const createMutation = useMutation({
    mutationFn: (payload) => masterDataApi.createPayScale(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pay-scales'] });
      toast.add('Pay scale created.', 'success');
      setModalOpen(false);
      setForm({ code: '', name: '', payRevisionId: '', effectiveFrom: '', status: 'ACTIVE' });
    },
    onError: (err) => setError(err.message || 'Could not create pay scale.'),
  });

  const activateMutation = useMutation({
    mutationFn: (id) => masterDataApi.updatePayScale(id, { status: 'ACTIVE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pay-scales'] });
      toast.add('Pay scale activated.', 'success');
      setActivateTarget(null);
    },
    onError: (err) => setActionError(err.message || 'Could not activate pay scale.'),
  });

  const suppressMutation = useMutation({
    mutationFn: (id) => masterDataApi.deletePayScale(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pay-scales'] });
      toast.add('Pay scale suppressed (superseded).', 'success');
      setSuppressTarget(null);
    },
    onError: (err) => setActionError(err.message || 'Could not suppress pay scale.'),
  });

  const allRows = data?.rows || [];
  const filteredRows = allRows.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const codeMatch = r.code?.toLowerCase().includes(q);
      const nameMatch = r.name?.toLowerCase().includes(q);
      const exprMatch = r.scaleExpression?.toLowerCase().includes(q);
      if (!codeMatch && !nameMatch && !exprMatch) return false;
    }
    return true;
  });

  const columns = [
    { field: 'code', label: 'Code', mono: true },
    { field: 'name', label: 'Name' },
    { field: 'payRevisionId', label: 'Pay Revision', render: (r) => revisionName(r.payRevisionId) },
    { field: 'scaleExpression', label: 'Expression', mono: true },
    { field: 'effectiveFrom', label: 'Effective From', mono: true, render: (r) => fmt.date(r.effectiveFrom) },
    { field: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'ACTIVE' ? 'success' : 'default'}>{r.status}</Badge> },
    {
      field: 'actions',
      label: '',
      sortable: false,
      render: (r) => (
        <div className="row-actions">
          <Button variant="secondary" size="sm" onClick={() => setStageScale(r)}>Stages</Button>
          {r.status === 'SUPERSEDED' ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setActionError('');
                setActivateTarget(r);
              }}
            >
              Activate
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setActionError('');
                setSuppressTarget(r);
              }}
            >
              Suppress
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Pay Scales</h1>
        <p>Stage ladders — stages can be added but never removed</p>
      </header>

      <Card noPadding>
        <div className="table-toolbar">
          <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1, maxWidth: '500px' }}>
            <input
              type="search"
              placeholder="Search pay scales…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input table-search"
            />
            <select
              className="input"
              style={{ width: 'auto' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active only</option>
              <option value="SUPERSEDED">Suppressed only</option>
            </select>
          </div>
          <Button onClick={() => setModalOpen(true)}>Add Pay Scale</Button>
        </div>
        <Table columns={columns} data={filteredRows} keyField="id" loading={isLoading} emptyMessage="No pay scales found." />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Pay Scale"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={createMutation.isPending} onClick={() => { setError(''); createMutation.mutate(form); }}>Create</Button>
          </>
        }
      >
        <form noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="form-grid">
            <Input id="ps-code" label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} mono required />
            <Input id="ps-name" label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ps-rev">Pay Revision</label>
            <select id="ps-rev" className="input" value={form.payRevisionId} onChange={(e) => setForm({ ...form, payRevisionId: e.target.value })}>
              <option value="">Select a pay revision…</option>
              {(revisions?.rows || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <Input id="ps-eff" label="Effective From" type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
        </form>
      </Modal>

      <ConfirmationModal
        open={activateTarget != null}
        onClose={() => setActivateTarget(null)}
        onConfirm={() => activateMutation.mutate(activateTarget.id)}
        title="Activate Pay Scale"
        itemName={activateTarget?.name}
        details={{
          'Pay Scale Code': activateTarget?.code,
          'Pay Revision': revisionName(activateTarget?.payRevisionId),
          'Expression': activateTarget?.scaleExpression || '—',
          'Effective From': fmt.date(activateTarget?.effectiveFrom),
          'Current Status': 'SUPERSEDED',
        }}
        warningMessage="Activating this suppressed pay scale will make it immediately active and available for new employee appointments, promotions, and payroll fixations."
        confirmLabel="Confirm Activation"
        confirmVariant="primary"
        loading={activateMutation.isPending}
        error={actionError}
      />

      <ConfirmationModal
        open={suppressTarget != null}
        onClose={() => setSuppressTarget(null)}
        onConfirm={() => suppressMutation.mutate(suppressTarget.id)}
        title="Suppress Pay Scale"
        itemName={suppressTarget?.name}
        details={{
          'Pay Scale Code': suppressTarget?.code,
          'Pay Revision': revisionName(suppressTarget?.payRevisionId),
          'Expression': suppressTarget?.scaleExpression || '—',
          'Effective From': fmt.date(suppressTarget?.effectiveFrom),
          'Current Status': 'ACTIVE',
        }}
        warningMessage="Suppressing this pay scale will mark it as superseded. It will no longer be available for new employee assignments or promotions. Existing employee service records and pay history remain intact."
        confirmLabel="Confirm Suppression"
        confirmVariant="danger"
        loading={suppressMutation.isPending}
        error={actionError}
      />

      {stageScale && <StageLadderModal scale={stageScale} onClose={() => setStageScale(null)} />}
    </div>
  );
}

function StageLadderModal({ scale, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [stages, setStages] = useState(null);
  const [newAmount, setNewAmount] = useState('');

  const { data: loaded } = useQuery({
    queryKey: ['pay-stages', scale.id],
    queryFn: () => masterDataApi.payScaleStages(scale.id),
  });

  React.useEffect(() => {
    if (loaded) setStages(loaded.rows || []);
  }, [loaded]);

  const saveMutation = useMutation({
    mutationFn: (payload) => masterDataApi.updatePayScaleStages(scale.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pay-scales'] });
      queryClient.invalidateQueries({ queryKey: ['pay-stages', scale.id] });
      toast.add('Stages saved.', 'success');
      onClose();
    },
    onError: (err) => toast.add(err.message || 'Save failed.', 'error'),
  });

  const list = stages || [];

  return (
    <Modal
      open
      onClose={onClose}
      title={`Stage Ladder — ${scale.name}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate(list.map((s) => ({ stageNo: s.stageNo, amount: s.amount })))}
          >
            Save Stages
          </Button>
        </>
      }
    >
      <table className="table">
        <thead>
          <tr>
            <th className="table-th">Stage</th>
            <th className="table-th table-th-right">Amount</th>
            <th className="table-th">In Use</th>
          </tr>
        </thead>
        <tbody>
          {list.map((s, i) => (
            <tr key={s.id || i} className="table-row">
              <td className="table-td mono">{s.stageNo}</td>
              <td className="table-td table-td-right mono">{fmt.money(s.amount)}</td>
              <td className="table-td">{s.inUse ? <Badge variant="warning">Yes</Badge> : '—'}</td>
            </tr>
          ))}
          {!list.length && <tr><td colSpan={3} className="table-td">No stages yet.</td></tr>}
        </tbody>
      </table>
      <div className="stage-add">
        <Input
          id="new-stage"
          label="Add a new stage amount (₹)"
          type="number"
          value={newAmount}
          onChange={(e) => setNewAmount(e.target.value)}
          mono
        />
        <Button
          variant="secondary"
          onClick={() => {
            if (!newAmount) return;
            const nextNo = (list[list.length - 1]?.stageNo || list.length) + 1;
            setStages([...list, { stageNo: nextNo, amount: Number(newAmount) }]);
            setNewAmount('');
          }}
        >
          Add Stage
        </Button>
      </div>
      <p className="form-note">A stage already used in an employee's pay record can't have its amount changed — introduce a new pay revision instead.</p>
    </Modal>
  );
}
