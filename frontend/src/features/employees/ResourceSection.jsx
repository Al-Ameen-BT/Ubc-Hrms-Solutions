import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';

/* A generic list-with-add/edit/remove card, used by the employee sub-resource
   tabs (bank accounts, loans, LIC, …). Every one of those is the same shape:
   a query, a create, an optional update, a delete. Keeps the six loan types
   from being six near-identical files. */

function blank(fields) {
  const o = {};
  fields.forEach((f) => { o[f.name] = f.default ?? ''; });
  return o;
}

function FieldInput({ f, value, onChange }) {
  if (f.options) {
    return (
      <div className="field">
        <label className="field-label" htmlFor={f.name}>
          {f.label}{f.required && <span className="field-required"> *</span>}
        </label>
        <select id={f.name} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {!f.noEmpty && <option value="">Select…</option>}
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {f.hint && <p className="field-hint">{f.hint}</p>}
      </div>
    );
  }
  return (
    <Input
      id={f.name}
      label={f.label}
      type={f.type || 'text'}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      required={f.required}
      mono={f.mono}
      hint={f.hint}
      step={f.step}
      min={f.min}
    />
  );
}

export function ResourceSection({
  title, description, queryKey, listFn, createFn, updateFn, deleteFn,
  columns, fields, updateFields, initial, emptyMessage, addLabel = 'Add', meta,
  editLabel = 'Edit', toPayload,
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(() => initial || blank(fields));
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionError, setActionError] = useState('');

  const { data, isLoading } = useQuery({ queryKey, queryFn: listFn });
  const rows = data?.rows || data?.data || [];
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const close = () => { setOpen(false); setEditing(null); setForm(initial || blank(fields)); setError(''); };

  const save = useMutation({
    mutationFn: (payload) => (editing ? updateFn(editing.id, payload) : createFn(payload)),
    onSuccess: () => { invalidate(); toast.add(editing ? 'Changes saved.' : 'Added.', 'success'); close(); },
    onError: (err) => setError(err.message || 'Could not save.'),
  });

  const remove = useMutation({
    mutationFn: (row) => deleteFn(row.id),
    onSuccess: () => {
      invalidate();
      toast.add('Removed.', 'success');
      setDeleteTarget(null);
    },
    onError: (err) => setActionError(err.message || 'Could not remove.'),
  });

  const shownFields = editing && updateFields ? updateFields : fields;

  const cols = [
    ...columns,
    {
      field: '__actions', label: '', sortable: false,
      render: (row) => (
        <div className="row-actions">
          {updateFields && updateFn && (
            <Button
              variant="secondary" size="sm"
              onClick={() => {
                setEditing(row);
                setForm(Object.fromEntries(shownFields.map((f) => [f.name, f.editValue ? f.editValue(row) : (row[f.name] ?? '')])));
                setError(''); setOpen(true);
              }}
            >{editLabel}</Button>
          )}
          {deleteFn && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setActionError('');
                setDeleteTarget(row);
              }}
            >
              Remove
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <Card title={title} noPadding>
      <div className="table-toolbar">
        <span className="form-note">{description}</span>
        <Button onClick={() => { setEditing(null); setForm(initial || blank(fields)); setError(''); setOpen(true); }}>{addLabel}</Button>
      </div>
      {meta && meta(data)}
      <Table columns={cols} data={rows} keyField="id" loading={isLoading} emptyMessage={emptyMessage} />

      <Modal
        open={open}
        onClose={close}
        title={`${editing ? editLabel : 'Add'} — ${title}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button loading={save.isPending} onClick={() => { setError(''); save.mutate(toPayload ? toPayload(form) : form); }}>Save</Button>
          </>
        }
      >
        <form noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="form-grid">
            {shownFields.map((f) => (
              <FieldInput key={f.name} f={f} value={form[f.name]} onChange={(v) => setForm((s) => ({ ...s, [f.name]: v }))} />
            ))}
          </div>
        </form>
      </Modal>

      <ConfirmationModal
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => remove.mutate(deleteTarget)}
        title={`Remove ${title}`}
        itemName={deleteTarget?.policyNumber || deleteTarget?.loanAccountNo || deleteTarget?.accountNumber || deleteTarget?.name || `${title} Record`}
        details={{
          'Record ID': deleteTarget?.id ? `#${deleteTarget.id}` : undefined,
          'Amount': deleteTarget?.amount != null ? String(deleteTarget.amount) : undefined,
          'Availed Date': deleteTarget?.availedDate || deleteTarget?.startDate || undefined,
        }}
        warningMessage={`Are you sure you want to remove this ${title.toLowerCase()} record? This action cannot be undone.`}
        confirmLabel="Confirm Deletion"
        confirmVariant="danger"
        loading={remove.isPending}
        error={actionError}
      />
    </Card>
  );
}
