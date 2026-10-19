import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { platformApi, fmt } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

export function PlatformUsersPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '' });
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['platform-users', { page, search }],
    queryFn: () => platformApi.platformUsers({ page, limit: 20, search }),
  });

  const createMutation = useMutation({
    mutationFn: (payload) => platformApi.createPlatformUser(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      toast.add('Platform user created. Temporary password shown in the response.', 'success');
      setModalOpen(false);
      setForm({ name: '', email: '' });
    },
    onError: (err) => setFormError(err.message || 'Could not create user.'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');
    createMutation.mutate(form);
  };

  const columns = [
    { field: 'name', label: 'Name' },
    { field: 'email', label: 'Email', mono: true },
    { field: 'role', label: 'Role', render: (row) => <Badge variant="info">{row.role?.replace(/_/g, ' ')}</Badge> },
    {
      field: 'status',
      label: 'Status',
      render: (row) => <Badge variant={row.status === 'ACTIVE' ? 'success' : 'default'}>{row.status}</Badge>,
    },
    { field: 'lastLoginAt', label: 'Last Sign-in', mono: true, render: (row) => fmt.dateTime(row.lastLoginAt) },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Platform Users</h1>
        <p>Super Admin accounts for the Banihal platform team</p>
      </header>

      <Card noPadding>
        <div className="table-toolbar">
          <input
            type="search"
            placeholder="Search users…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input table-search"
          />
          <Button onClick={() => setModalOpen(true)}>Add Platform User</Button>
        </div>
        <Table
          columns={columns}
          data={data?.rows || []}
          keyField="id"
          loading={isLoading}
          emptyMessage="No platform users yet."
        />
        <div className="table-pagination">
          <span className="mono">{(data?.rows || []).length} platform user{(data?.rows || []).length === 1 ? '' : 's'}</span>
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Platform User"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={createMutation.isPending}>Create</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} noValidate>
          {formError && <div className="auth-error" role="alert">{formError}</div>}
          <Input
            id="pu-name"
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            id="pu-email"
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </form>
      </Modal>
    </div>
  );
}
