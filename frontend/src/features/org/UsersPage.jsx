import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, masterDataApi, fmt } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import { TempPasswordModal } from '../../components/TempPasswordModal';

const ROLES = ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'DEPARTMENT_HEAD', 'EMPLOYEE'];

export function UsersPage({ embedded = false }) {
  const { user, refreshMe } = useAuth();
  const orgId = user?.organizationId;
  const isOrgAdmin = user?.role === 'ORG_ADMIN';
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'HR_OFFICER', employeeId: '', sendEmail: true });
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', role: 'HR_OFFICER', employeeId: '' });
  const [linkTarget, setLinkTarget] = useState(null);
  const [linkEmployeeId, setLinkEmployeeId] = useState('');
  const [linkEmployeeSearch, setLinkEmployeeSearch] = useState('');
  const [resetTarget, setResetTarget] = useState(null);
  const [resetSendEmail, setResetSendEmail] = useState(true);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [removeStep1Target, setRemoveStep1Target] = useState(null);
  const [removeStep2Target, setRemoveStep2Target] = useState(null);
  const [removeConfirmEmail, setRemoveConfirmEmail] = useState('');
  const [actionError, setActionError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['users', orgId],
    queryFn: () => usersApi.list(orgId),
    enabled: !!orgId,
  });
  const { data: smtpStatus } = useQuery({
    queryKey: ['users-smtp-status', orgId],
    queryFn: () => usersApi.smtpStatus(orgId),
    enabled: !!orgId,
  });
  const { data: employees } = useQuery({ queryKey: ['employees'], queryFn: () => masterDataApi.employees(), enabled: !!orgId });

  const smtpConfigured = Boolean(smtpStatus?.smtpConfigured);

  useEffect(() => {
    if (smtpStatus) {
      setForm((prev) => ({ ...prev, sendEmail: Boolean(smtpStatus.smtpConfigured) }));
      setResetSendEmail(Boolean(smtpStatus.smtpConfigured));
    }
  }, [smtpStatus]);

  const availableEmployeesFor = (targetUserId) => (employees?.rows || []).filter(
    (employee) => employee.status === 'ACTIVE' && !(data?.rows || []).some((account) => account.status === 'ACTIVE' && account.employeeId === employee.id && account.id !== targetUserId)
  );

  const createEmployeeOptions = availableEmployeesFor(null);
  const editEmployeeOptions = availableEmployeesFor(editTarget?.id);
  const linkEmployeeOptions = useMemo(() => {
    const base = availableEmployeesFor(linkTarget?.id);
    const q = linkEmployeeSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter((e) => `${e.empCode} ${e.name} ${e.officeEmail || ''} ${e.personalEmail || ''}`.toLowerCase().includes(q));
  }, [employees, data, linkTarget, linkEmployeeSearch]);

  const employeeNameById = (employeeId) => {
    if (!employeeId) return 'Unlinked';
    const emp = (employees?.rows || []).find((e) => String(e.id) === String(employeeId));
    return emp ? `${emp.empCode} · ${emp.name}` : `#${employeeId}`;
  };

  const createMutation = useMutation({
    mutationFn: (payload) => usersApi.create(orgId, {
      ...payload,
      sendEmail: smtpConfigured ? Boolean(payload.sendEmail) : false,
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['users', orgId] });
      setModalOpen(false);
      setCredentials({
        mode: 'create',
        user: res.data,
        tempPassword: res.tempPassword,
        emailStatus: res.email,
        loginUrl: res.loginUrl || smtpStatus?.loginUrl,
      });
      setForm({ name: '', email: '', role: 'HR_OFFICER', employeeId: '', sendEmail: smtpConfigured });
      toast.add('User created.', 'success');
    },
    onError: (err) => setError(err.message || 'Could not create user.'),
  });

  const editMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: editForm.name,
        employeeId: editForm.employeeId || null,
      };
      if (editTarget?.id !== user?.id) {
        payload.role = editForm.role;
      }
      return usersApi.update(orgId, editTarget.id, payload);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['users', orgId] });
      if (editTarget?.id === user?.id && refreshMe) {
        await refreshMe().catch(() => {});
      }
      setEditTarget(null);
      toast.add('User updated.', 'success');
    },
    onError: (err) => setActionError(err.message || 'Could not update user.'),
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

  const removeMutation = useMutation({
    mutationFn: async (target) => {
      if (target.status === 'ACTIVE') {
        await usersApi.remove(orgId, target.id);
      }
      return usersApi.remove(orgId, target.id);
    },
    onSuccess: () => {
      setRemoveStep2Target(null);
      setRemoveConfirmEmail('');
      toast.add('User permanently removed from the organisation.', 'success');
    },
    onError: (err) => setActionError(err.message || 'Could not remove user.'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['users', orgId] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: ({ target, sendEmail }) => usersApi.resetPassword(orgId, target.id, {
      sendEmail: smtpConfigured ? Boolean(sendEmail) : false,
    }),
    onSuccess: (res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['users', orgId] });
      setResetTarget(null);
      setCredentials({
        mode: 'reset',
        user: res.data || vars.target,
        tempPassword: res.tempPassword,
        emailStatus: res.email,
        loginUrl: res.loginUrl || smtpStatus?.loginUrl,
      });
      toast.add('Temporary password issued.', 'success');
    },
    onError: (err) => setActionError(err.message || 'Could not reset password.'),
  });

  const linkMutation = useMutation({
    mutationFn: () => usersApi.update(orgId, linkTarget.id, { employeeId: linkEmployeeId || null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users', orgId] }); setLinkTarget(null); toast.add('Employee link updated.', 'success'); },
    onError: (err) => setActionError(err.message || 'Could not update employee link.'),
  });

  const handleEmployeePick = (employeeId) => {
    const selected = createEmployeeOptions.find((e) => String(e.id) === String(employeeId));
    setForm((prev) => {
      const prevSelected = createEmployeeOptions.find((e) => String(e.id) === String(prev.employeeId));
      const prevAutoEmail = prevSelected ? (prevSelected.officeEmail || prevSelected.personalEmail || '') : '';
      const nextAutoEmail = selected ? (selected.officeEmail || selected.personalEmail || '') : '';
      const shouldReplaceName = !prev.name || (prevSelected && prev.name === prevSelected.name);
      const shouldReplaceEmail = !prev.email || (prevSelected && prev.email === prevAutoEmail);
      return {
        ...prev,
        employeeId,
        name: selected && shouldReplaceName ? selected.name : prev.name,
        email: selected && shouldReplaceEmail && nextAutoEmail ? nextAutoEmail : prev.email,
      };
    });
  };

  const rows = useMemo(() => {
    const all = data?.rows || [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q));
  }, [data, search]);

  const removeEmailMatches = removeStep2Target
    ? removeConfirmEmail.trim().toLowerCase() === String(removeStep2Target.email || '').trim().toLowerCase()
    : false;

  const columns = [
    { field: 'name', label: 'Name' },
    { field: 'email', label: 'Email', mono: true },
    { field: 'role', label: 'Role', render: (row) => <Badge variant={row.role === 'ORG_ADMIN' ? 'info' : 'default'}>{row.role?.replace(/_/g, ' ')}</Badge> },
    { field: 'employeeId', label: 'Employee', render: (row) => employeeNameById(row.employeeId) },
    { field: 'mfaEnabled', label: '2FA', render: (row) => (row.mfaEnabled ? <Badge variant="success">On</Badge> : '—') },
    { field: 'status', label: 'Status', render: (row) => <Badge variant={row.status === 'ACTIVE' ? 'success' : 'default'}>{row.status}</Badge> },
    { field: 'lastLoginAt', label: 'Last Sign-in', mono: true, render: (row) => fmt.dateTime(row.lastLoginAt) },
    {
      field: 'actions', label: '', sortable: false,
      render: (row) => (
        <div className="row-actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setActionError('');
              setEditForm({
                name: row.name || '',
                role: row.role || 'HR_OFFICER',
                employeeId: row.employeeId ? String(row.employeeId) : '',
              });
              setEditTarget(row);
            }}
          >
            Edit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setLinkTarget(row);
              setLinkEmployeeId(row.employeeId ? String(row.employeeId) : '');
              setLinkEmployeeSearch('');
              setActionError('');
            }}
          >
            Link employee
          </Button>
          {row.id !== user?.id && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setActionError('');
                  setResetSendEmail(smtpConfigured);
                  setResetTarget(row);
                }}
              >
                Reset Password
              </Button>
              <Button
                variant="secondary" size="sm"
                onClick={() => {
                  setActionError('');
                  setStatusTarget(row);
                }}
              >
                {row.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
              </Button>
              {isOrgAdmin && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setActionError('');
                    setRemoveConfirmEmail('');
                    setRemoveStep1Target(row);
                  }}
                >
                  Remove
                </Button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className={embedded ? 'people-view' : 'page'}>
      {!embedded && <header className="page-header">
        <h1>Users</h1>
        <p>Manage bank users and their access</p>
      </header>}

      {smtpStatus && !smtpConfigured && (
        <div className="smtp-bypass-banner" role="status">
          <span>
            <strong>No SMTP service configured</strong> — temporary password bypass is active. Creating a user or resetting a password opens a popup with the temporary password to share directly with the employee for Employee Self-Service portal and Mobile app login.
          </span>
          {isOrgAdmin && (
            <Link to="/settings" className="btn btn-secondary btn-sm">Configure SMTP</Link>
          )}
        </div>
      )}

      <Card noPadding>
        <div className="table-toolbar">
          <input type="search" placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} className="input table-search" />
          <Button onClick={() => { setError(''); setForm({ name: '', email: '', role: 'HR_OFFICER', employeeId: '', sendEmail: smtpConfigured }); setModalOpen(true); }}>Add User</Button>
        </div>
        <Table columns={columns} data={rows} keyField="id" loading={isLoading} emptyMessage="No users found." />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add User"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={createMutation.isPending} onClick={() => { setError(''); createMutation.mutate(form); }}>Create</Button>
          </>
        }
      >
        <form noValidate onSubmit={(e) => { e.preventDefault(); setError(''); createMutation.mutate(form); }}>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="field">
            <label className="field-label" htmlFor="nu-role">Role</label>
            <select id="nu-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          {form.role === 'EMPLOYEE' && (
            <div className="field">
              <label className="field-label" htmlFor="nu-employee">Employee record</label>
              <select id="nu-employee" className="input" value={form.employeeId} onChange={(e) => handleEmployeePick(e.target.value)}>
                <option value="">Select an employee</option>
                {createEmployeeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.empCode} · {employee.name}</option>)}
              </select>
            </div>
          )}
          <Input id="nu-name" label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input id="nu-email" label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          {smtpConfigured ? (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(form.sendEmail)}
                onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })}
              />
              <span>Send temporary password by email (uncheck to bypass email and share manually)</span>
            </label>
          ) : (
            <p className="form-note">
              No SMTP service is configured — email delivery will be bypassed and the temporary password will be shown in a popup after creation.
            </p>
          )}
        </form>
      </Modal>

      <Modal
        open={editTarget != null}
        onClose={() => setEditTarget(null)}
        title={`Edit User · ${editTarget?.email || ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button
              loading={editMutation.isPending}
              disabled={!editForm.name.trim()}
              onClick={() => { setActionError(''); editMutation.mutate(); }}
            >
              Save Changes
            </Button>
          </>
        }
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!editForm.name.trim()) return;
            setActionError('');
            editMutation.mutate();
          }}
        >
          {actionError && <div className="auth-error" role="alert">{actionError}</div>}
          <Input
            id="eu-name"
            label="Full Name"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            required
          />
          <div className="field">
            <label className="field-label" htmlFor="eu-role">Role</label>
            <select
              id="eu-role"
              className="input"
              value={editForm.role}
              disabled={editTarget?.id === user?.id}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
            >
              {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
            {editTarget?.id === user?.id && (
              <p className="form-note">You cannot change your own role.</p>
            )}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="eu-employee">Linked Employee</label>
            <select
              id="eu-employee"
              className="input"
              value={editForm.employeeId}
              onChange={(e) => setEditForm({ ...editForm, employeeId: e.target.value })}
            >
              <option value="">Unlinked</option>
              {editEmployeeOptions.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.empCode} · {employee.name}</option>
              ))}
            </select>
          </div>
        </form>
      </Modal>

      <Modal
        open={resetTarget != null}
        onClose={() => setResetTarget(null)}
        title={`Reset Password · ${resetTarget?.name || ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button
              loading={resetMutation.isPending}
              onClick={() => {
                setActionError('');
                resetMutation.mutate({ target: resetTarget, sendEmail: resetSendEmail });
              }}
            >
              Issue Temporary Password
            </Button>
          </>
        }
      >
        {actionError && <div className="auth-error" role="alert">{actionError}</div>}
        <p>
          Issue a new temporary password for <strong>{resetTarget?.name}</strong> (<span className="mono">{resetTarget?.email}</span>).
          They will be required to choose a new password on their next sign-in, and any linked mobile devices will be signed out until re-linked.
        </p>
        {smtpConfigured ? (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={Boolean(resetSendEmail)}
              onChange={(e) => setResetSendEmail(e.target.checked)}
            />
            <span>Send temporary password by email (uncheck to bypass email and share manually)</span>
          </label>
        ) : (
          <p className="form-note">
            No SMTP service is configured — email delivery will be bypassed and the temporary password will appear in a popup so you can share it directly.
          </p>
        )}
      </Modal>

      <TempPasswordModal credentials={credentials} onClose={() => setCredentials(null)} />

      <Modal open={linkTarget != null} onClose={() => setLinkTarget(null)} title={`Link employee · ${linkTarget?.name || ''}`}
        footer={<><Button variant="secondary" onClick={() => setLinkTarget(null)}>Cancel</Button><Button loading={linkMutation.isPending} onClick={() => { setActionError(''); linkMutation.mutate(); }}>Save link</Button></>}>
        {actionError && <div className="auth-error" role="alert">{actionError}</div>}
        <p className="form-note">
          Account: <strong>{linkTarget?.name}</strong> (<span className="mono">{linkTarget?.email}</span>) · {linkTarget?.role?.replace(/_/g, ' ')}
        </p>
        <Input
          id="link-employee-search"
          label="Filter employees"
          placeholder="Search by code, name, or email…"
          value={linkEmployeeSearch}
          onChange={(e) => setLinkEmployeeSearch(e.target.value)}
        />
        <div className="field"><label className="field-label" htmlFor="link-employee">Employee record</label>
          <select id="link-employee" className="input" value={linkEmployeeId} onChange={(e) => setLinkEmployeeId(e.target.value)}>
            <option value="">Unlinked</option>
            {linkEmployeeOptions.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.empCode} · {employee.name}{employee.officeEmail || employee.personalEmail ? ` (${employee.officeEmail || employee.personalEmail})` : ''}
              </option>
            ))}
          </select>
        </div>
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

      <ConfirmationModal
        open={removeStep1Target != null}
        onClose={() => setRemoveStep1Target(null)}
        onConfirm={() => {
          const target = removeStep1Target;
          setActionError('');
          setRemoveConfirmEmail('');
          setRemoveStep1Target(null);
          setRemoveStep2Target(target);
        }}
        title="Remove User (Step 1 of 2)"
        itemName={removeStep1Target?.name}
        details={{
          'Email': removeStep1Target?.email,
          'Role': removeStep1Target?.role?.replace(/_/g, ' '),
          'Status': removeStep1Target?.status,
          'Employee': employeeNameById(removeStep1Target?.employeeId),
        }}
        warningMessage="You are about to remove this user account from the organisation. All active sessions and linked mobile devices will be revoked immediately. Any linked employee HR/payroll record will remain intact. You will be asked for a final confirmation next."
        confirmLabel="Continue to Final Confirmation"
        confirmVariant="danger"
      />

      <Modal
        open={removeStep2Target != null}
        onClose={() => { if (!removeMutation.isPending) { setRemoveStep2Target(null); setRemoveConfirmEmail(''); } }}
        title="Confirm Permanent User Removal (Step 2 of 2)"
        footer={
          <>
            <Button
              variant="secondary"
              disabled={removeMutation.isPending}
              onClick={() => { setRemoveStep2Target(null); setRemoveConfirmEmail(''); }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={removeMutation.isPending}
              disabled={!removeEmailMatches}
              onClick={() => {
                setActionError('');
                removeMutation.mutate(removeStep2Target);
              }}
            >
              Permanently Remove User
            </Button>
          </>
        }
      >
        <div className="confirm-modal-content">
          {actionError && <div className="auth-error" role="alert">{actionError}</div>}
          <div className="confirm-warning-banner banner-danger">
            <span className="confirm-warning-icon" aria-hidden="true">⚠️</span>
            <div>
              This permanently removes <strong>{removeStep2Target?.name}</strong> (<span className="mono">{removeStep2Target?.email}</span>) from the organisation and cannot be undone.
            </div>
          </div>
          <Input
            id="confirm-remove-email"
            label={`Type "${removeStep2Target?.email || ''}" to confirm`}
            value={removeConfirmEmail}
            onChange={(e) => setRemoveConfirmEmail(e.target.value)}
            placeholder={removeStep2Target?.email || ''}
            autoComplete="off"
          />
        </div>
      </Modal>
    </div>
  );
}
