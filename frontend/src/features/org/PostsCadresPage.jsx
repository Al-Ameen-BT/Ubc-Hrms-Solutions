import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { masterDataApi } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';

export function PostsCadresPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', cadre: '', cadreLevel: '', status: 'ACTIVE' });
  const [error, setError] = useState('');
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [activateTarget, setActivateTarget] = useState(null);
  const [actionError, setActionError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['post-cadres'],
    queryFn: () => masterDataApi.postCadres(),
  });

  const { data: scales } = useQuery({
    queryKey: ['pay-scales-lite'],
    queryFn: () => masterDataApi.payScales(),
  });

  const { data: employeesData } = useQuery({
    queryKey: ['employees-count'],
    queryFn: () => masterDataApi.employees(),
  });

  const getAssignedEmployeeCount = (postId) => {
    const list = employeesData?.rows || [];
    return list.filter((emp) => String(emp.postCadreId) === String(postId)).length;
  };

  const scaleName = (id) => (scales?.rows || []).find((s) => String(s.id) === String(id))?.name || '—';

  const rows = useMemo(() => {
    const all = data?.rows || [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) => `${p.name} ${p.code} ${p.cadre || ''}`.toLowerCase().includes(q));
  }, [data, search]);

  const createMutation = useMutation({
    mutationFn: (payload) => masterDataApi.createPostCadre(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-cadres'] });
      toast.add('Post created.', 'success');
      setModalOpen(false);
      setForm({ code: '', name: '', cadre: '', cadreLevel: '', status: 'ACTIVE' });
    },
    onError: (err) => setError(err.message || 'Could not create post.'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => masterDataApi.deletePostCadre(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-cadres'] });
      toast.add('Post deactivated.', 'success');
      setDeactivateTarget(null);
    },
    onError: (err) => setActionError(err.message || 'Could not deactivate post.'),
  });

  const activateMutation = useMutation({
    mutationFn: (id) => masterDataApi.updatePostCadre(id, { status: 'ACTIVE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-cadres'] });
      toast.add('Post activated.', 'success');
      setActivateTarget(null);
    },
    onError: (err) => setActionError(err.message || 'Could not activate post.'),
  });

  const columns = [
    { field: 'code', label: 'Code', mono: true },
    { field: 'name', label: 'Name' },
    { field: 'cadre', label: 'Cadre' },
    { field: 'cadreLevel', label: 'Level', mono: true },
    { field: 'defaultPayScaleId', label: 'Default Scale', render: (row) => scaleName(row.defaultPayScaleId) },
    {
      field: 'status',
      label: 'Status',
      render: (row) => <Badge variant={row.status === 'ACTIVE' ? 'success' : 'default'}>{row.status}</Badge>,
    },
    {
      field: 'actions',
      label: '',
      sortable: false,
      render: (row) => (
        <div className="row-actions">
          {row.status === 'ACTIVE' ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setActionError('');
                setDeactivateTarget(row);
              }}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setActionError('');
                setActivateTarget(row);
              }}
            >
              Activate
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Posts &amp; Cadres</h1>
        <p>The establishment ladder — each post maps to a cadre and pay scale</p>
      </header>

      <Card noPadding>
        <div className="table-toolbar">
          <input type="search" placeholder="Search posts…" value={search} onChange={(e) => setSearch(e.target.value)} className="input table-search" />
          <Button onClick={() => setModalOpen(true)}>Add Post</Button>
        </div>
        <Table columns={columns} data={rows} keyField="id" loading={isLoading} emptyMessage="No posts configured yet." />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Post / Cadre"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={createMutation.isPending} onClick={() => { setError(''); createMutation.mutate(form); }}>Create</Button>
          </>
        }
      >
        <form noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <Input id="pc-code" label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} mono required />
          <Input id="pc-name" label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input id="pc-cadre" label="Cadre" value={form.cadre} onChange={(e) => setForm({ ...form, cadre: e.target.value })} />
          <Input id="pc-level" label="Cadre Level" type="number" value={form.cadreLevel} onChange={(e) => setForm({ ...form, cadreLevel: e.target.value })} mono />
        </form>
      </Modal>

      <ConfirmationModal
        open={deactivateTarget != null}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={() => deactivateMutation.mutate(deactivateTarget.id)}
        title="Deactivate Post Cadre"
        itemName={deactivateTarget?.name}
        details={{
          'Post Code': deactivateTarget?.code,
          'Cadre': deactivateTarget?.cadre || '—',
          'Cadre Level': deactivateTarget?.cadreLevel != null ? `Level ${deactivateTarget.cadreLevel}` : '—',
          'Default Scale': scaleName(deactivateTarget?.defaultPayScaleId),
          'Assigned Employees': `${getAssignedEmployeeCount(deactivateTarget?.id)} active employee(s)`,
        }}
        warningMessage="Deactivating this post cadre will disable it for new employee appointments and pay fixations. Existing employee records associated with this post remain intact."
        confirmLabel="Confirm Deactivation"
        confirmVariant="danger"
        loading={deactivateMutation.isPending}
        error={actionError}
      />

      <ConfirmationModal
        open={activateTarget != null}
        onClose={() => setActivateTarget(null)}
        onConfirm={() => activateMutation.mutate(activateTarget.id)}
        title="Activate Post Cadre"
        itemName={activateTarget?.name}
        details={{
          'Post Code': activateTarget?.code,
          'Cadre': activateTarget?.cadre || '—',
          'Cadre Level': activateTarget?.cadreLevel != null ? `Level ${activateTarget.cadreLevel}` : '—',
          'Default Scale': scaleName(activateTarget?.defaultPayScaleId),
        }}
        warningMessage="Activating this post cadre will make it immediately available for new employee appointments, promotions, and payroll fixations."
        confirmLabel="Confirm Activation"
        confirmVariant="primary"
        loading={activateMutation.isPending}
        error={actionError}
      />
    </div>
  );
}
