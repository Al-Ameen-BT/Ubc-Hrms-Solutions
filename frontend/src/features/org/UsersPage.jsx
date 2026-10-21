import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, fmt } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';

const ROLES = ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'DEPARTMENT_HEAD', 'EMPLOYEE'];

export function UsersPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'HR_OFFICER' });
  const [error, setError] = useState('');
  const [tempPassword, setTempPassword] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [actionError, setActionError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['users', orgId],
    queryFn: () => usersApi.list(orgId),
    enabled: !!orgId,
  });

  const createMutation = useMutation({
    mutationFn: (payload) => usersApi.create(orgId, payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['users', orgId] });
      setTempPassword(res.tempPassword || 'Sent by email');
      setForm({ name: '', email: '', role: 'HR_OFFICER' });
      toast.add('User created.', 'success');
    },
    onError: (err) => setError(err.message || 'Could not create user.'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => usersApi.update(orgId, id, { status }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['users', orgId] });
      toast.add(`User ${vars.status === 'ACTIVE' ? 'activated' : 'deactivated'}.`, 'success');
      setStatusTarget(null);
    },
    onError: (err) => setActionError(err.message || 'Could not update user status.'),
  });

  const resetMutation = useMutation({
    mutationFn: (id) => usersApi.resetPassword(orgId, id, {}),
    onSuccess: (res) => { setTempPassword(res.tempPassword || 'Sent by email'); toast.add('Password reset.', 'success'); },
    onError: (err) => toast.add(err.message || 'Could not reset password.', 'error'),
  });

  const rows = useMemo(() => {
    const all = data?.rows || [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q));
  }, [data, search]);

  const columns = [
    { field: 'name', label: 'Name' },
    { field: 'email', label: 'Email', mono: true },
    { field: 'role', label: 'Role', render: (row) => <Badge variant={row.role === 'ORG_ADMIN' ? 'info' : 'default'}>{row.role?.replace(/_/g, ' ')}</Badge> },
    { field: 'mfaEnabled', label: '2FA', render: (row) => (row.mfaEnabled ? <Badge variant="success">On</Badge> : '—') },
    { field: 'status', label: 'Status', render: (row) => <Badge variant={row.status === 'ACTIVE' ? 'success' : 'default'}>{row.status}</Badge> },
    { field: 'lastLoginAt', label: 'Last Sign-in', mono: true, render: (row) => fmt.dateTime(row.lastLoginAt) },
    {
      field: 'actions', label: '', sortable: false,
      render: (row) => (
        <div className="row-actions">
          <Button variant="secondary" size="sm" onClick={() => resetMutation.mutate(row.id)}>Reset Password</Button>
          {row.id !== user?.id && (
            <Button
              variant="secondary" size="sm"
              onClick={() => {
                setActionError('');
                setStatusTarget(row);
              }}
            >
              {row.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Users</h1>
        <p>Manage bank users and their access</p>
      </header>

      <Card noPadding>
        <div className="table-toolbar">
          <input type="search" placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} className="input table-search" />
          <Button onClick={() => { setError(''); setTempPassword(null); setModalOpen(true); }}>Add User</Button>
        </div>
        <Table columns={columns} data={rows} keyField="id" loading={isLoading} emptyMessage="No users found." />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add User"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{tempPassword ? 'Close' : 'Cancel'}</Button>
            {!tempPassword && (
              <Button loading={createMutation.isPending} onClick={() => { setError(''); createMutation.mutate(form); }}>Create</Button>
            )}
          </>
        }
      >
        {tempPassword ? (
          <div className="mfa-section">
            <p>The account was created. Share this temporary password securely:</p>
            <code className="manual-key mono">{tempPassword}</code>
          </div>
        ) : (
          <form noValidate>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <Input id="nu-name" label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input id="nu-email" label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <div className="field">
              <label className="field-label" htmlFor="nu-role">Role</label>
              <select id="nu-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmationModal
        open={statusTarget != null}
        onClose={() => setStatusTarget(null)}
        onConfirm={() => statusMutation.mutate({
          id: statusTarget.id,
          status: statusTarget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
        })}
        title={statusTarget?.status === 'ACTIVE' ? 'Deactivate User' : 'Reactivate User'}
        itemName={statusTarget?.name}
        details={{
          'Email': statusTarget?.email,
          'Role': statusTarget?.role?.replace(/_/g, ' '),
          '2FA': statusTarget?.mfaEnabled ? 'Enabled' : 'Disabled',
        }}
        warningMessage={
          statusTarget?.status === 'ACTIVE'
            ? 'Deactivating this user will revoke their session and prevent them from logging into the portal immediately.'
            : 'Reactivating this user will restore their access to the bank portal with their assigned permissions.'
        }
        confirmLabel={statusTarget?.status === 'ACTIVE' ? 'Confirm Deactivation' : 'Confirm Reactivation'}
        confirmVariant={statusTarget?.status === 'ACTIVE' ? 'danger' : 'primary'}
        loading={statusMutation.isPending}
        error={actionError}
      />
    </div>
  );
}
