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

export function PostsCadresPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', cadre: '', cadreLevel: '', status: 'ACTIVE' });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['post-cadres'],
    queryFn: () => masterDataApi.postCadres(),
  });

  const { data: scales } = useQuery({
    queryKey: ['pay-scales-lite'],
    queryFn: () => masterDataApi.payScales(),
  });

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

  const deactivate = useMutation({
    mutationFn: (id) => masterDataApi.deletePostCadre(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-cadres'] });
      toast.add('Post deactivated.', 'success');
    },
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
        row.status === 'ACTIVE'
          ? <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); deactivate.mutate(row.id); }}>Deactivate</Button>
          : null
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
    </div>
  );
}
