import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceBookApi } from '../../api/extended';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';

const ACCOUNT_TYPES = [
  { value: 'SB', label: 'Savings (SB)' },
  { value: 'OD', label: 'Overdraft (OD)' },
  { value: 'RD', label: 'Recurring Deposit (RD)' },
  { value: 'OTHER', label: 'Other' },
];

const BLANK = { accountType: 'SB', accountNumber: '', bankName: '', ifsc: '', branchName: '', remarks: '', status: 'ACTIVE' };

export function EmployeeBankAccountsTab({ employeeId }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionError, setActionError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['emp-bank-accounts', employeeId],
    queryFn: () => serviceBookApi.bankAccounts(employeeId),
  });
  const rows = data?.data || [];
  const salaryCreditAccountId = data?.salaryCreditAccountId;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['emp-bank-accounts', employeeId] });

  const close = () => { setOpen(false); setEditing(null); setForm(BLANK); setError(''); };

  const save = useMutation({
    mutationFn: (payload) => (editing
      ? serviceBookApi.updateBankAccount(employeeId, editing.id, {
        bankName: payload.bankName, ifsc: payload.ifsc, branchName: payload.branchName, remarks: payload.remarks, status: payload.status,
      })
      : serviceBookApi.addBankAccount(employeeId, {
        accountType: payload.accountType, accountNumber: payload.accountNumber, bankName: payload.bankName,
        ifsc: payload.ifsc, branchName: payload.branchName, remarks: payload.remarks,
      })),
    onSuccess: () => { invalidate(); toast.add(editing ? 'Account updated.' : 'Account added.', 'success'); close(); },
    onError: (err) => setError(err.message || 'Could not save.'),
  });

  const remove = useMutation({
    mutationFn: (row) => serviceBookApi.deleteBankAccount(employeeId, row.id),
    onSuccess: () => {
      invalidate();
      toast.add('Account removed.', 'success');
      setDeleteTarget(null);
    },
    onError: (err) => setActionError(err.message || 'Could not remove account.'),
  });

  const setCredit = useMutation({
    mutationFn: (accountId) => serviceBookApi.setSalaryCreditAccount(employeeId, accountId),
    onSuccess: () => { invalidate(); toast.add('Salary credit account updated.', 'success'); },
    onError: (err) => toast.add(err.message || 'Could not set.', 'error'),
  });

  const columns = [
    {
      field: 'accountType', label: 'Type',
      render: (r) => <Badge variant="info">{r.accountType}</Badge>,
    },
    { field: 'accountNumber', label: 'Account Number', mono: true },
    { field: 'bankName', label: 'Bank', render: (r) => r.bankName || '—' },
    { field: 'ifsc', label: 'IFSC', mono: true, render: (r) => r.ifsc || '—' },
    { field: 'branchName', label: 'Branch', render: (r) => r.branchName || '—' },
    {
      field: 'status', label: 'Status',
      render: (r) => <Badge variant={r.status === 'ACTIVE' ? 'success' : 'default'}>{r.status}</Badge>,
    },
    {
      field: 'credit', label: 'Salary Credit',
      render: (r) => (salaryCreditAccountId === r.id
        ? <Badge variant="success">Net pay</Badge>
        : <Button variant="secondary" size="sm" onClick={() => setCredit.mutate(r.id)}>Use for net pay</Button>),
    },
    {
      field: '__actions', label: '', sortable: false,
      render: (r) => (
        <div className="row-actions">
          <Button variant="secondary" size="sm" onClick={() => {
            setEditing(r);
            setForm({ accountType: r.accountType, accountNumber: r.accountNumber, bankName: r.bankName || '', ifsc: r.ifsc || '', branchName: r.branchName || '', remarks: r.remarks || '', status: r.status });
            setError(''); setOpen(true);
          }}>Edit</Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setActionError('');
              setDeleteTarget(r);
            }}
          >
            Remove
          </Button>
        </div>
      ),
    },
  ];

  const f = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  return (
    <Card title="Bank Accounts" noPadding>
      <div className="table-toolbar">
        <span className="form-note">
          Net pay is credited to the account marked “Net pay”, or to the account number on the employee master if none is chosen.
        </span>
        <Button onClick={() => { setEditing(null); setForm(BLANK); setError(''); setOpen(true); }}>Add Account</Button>
      </div>
      <Table columns={columns} data={rows} keyField="id" loading={isLoading} emptyMessage="No bank accounts on record." />

      <Modal
        open={open}
        onClose={close}
        title={editing ? 'Edit Bank Account' : 'Add Bank Account'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button loading={save.isPending} onClick={() => { setError(''); save.mutate(form); }}>Save</Button>
          </>
        }
      >
        <form noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="ba-type">Account Type <span className="field-required">*</span></label>
              <select id="ba-type" className="input" value={form.accountType} disabled={!!editing} onChange={f('accountType')}>
                {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <Input id="ba-number" label="Account Number" value={form.accountNumber} onChange={f('accountNumber')} required readOnly={!!editing} mono
              hint={editing ? 'Account number cannot be changed.' : undefined} />
            <Input id="ba-bank" label="Bank Name" value={form.bankName} onChange={f('bankName')} />
            <Input id="ba-ifsc" label="IFSC" value={form.ifsc} onChange={f('ifsc')} mono />
            <Input id="ba-branch" label="Branch" value={form.branchName} onChange={f('branchName')} />
            {editing && (
              <div className="field">
                <label className="field-label" htmlFor="ba-status">Status</label>
                <select id="ba-status" className="input" value={form.status} onChange={f('status')}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
            )}
            <Input id="ba-remarks" label="Remarks" value={form.remarks} onChange={f('remarks')} />
          </div>
        </form>
      </Modal>

      <ConfirmationModal
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => remove.mutate(deleteTarget)}
        title="Remove Bank Account"
        itemName={`${deleteTarget?.bankName || 'Bank'} — ${deleteTarget?.accountNumber}`}
        details={{
          'Account Number': deleteTarget?.accountNumber,
          'Bank Name': deleteTarget?.bankName || '—',
          'IFSC Code': deleteTarget?.ifsc || '—',
          'Account Type': deleteTarget?.accountType,
          'Salary Credit': salaryCreditAccountId === deleteTarget?.id ? 'Primary Net Pay Account' : 'Standard',
        }}
        warningMessage="Removing this bank account will detach it from this employee record. If this account was designated for net pay credits, please ensure another account is chosen."
        confirmLabel="Confirm Deletion"
        confirmVariant="danger"
        loading={remove.isPending}
        error={actionError}
      />
    </Card>
  );
}
