import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { masterDataApi, fmt, openFile } from '../../api/client';
import { readFileAsDataUrl, assertUploadable, humanSize, ACCEPTED_UPLOAD_TYPES } from '../../lib/files';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';

/* Government Order register with the scanned order attached
   (routes/governmentOrderDocuments.js). */
export function GovernmentOrdersPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ goNumber: '', goDate: '', issuingAuthority: '', subject: '', description: '' });
  const [error, setError] = useState('');

  const [selected, setSelected] = useState(null);
  const [docFile, setDocFile] = useState(null);
  const [docLabel, setDocLabel] = useState('');
  const [docError, setDocError] = useState('');
  const [confirmDocDelete, setConfirmDocDelete] = useState(false);
  const [actionError, setActionError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['government-orders', { search }],
    queryFn: () => masterDataApi.governmentOrders({ search, limit: 100 }),
  });

  const { data: doc } = useQuery({
    queryKey: ['go-doc', selected?.id],
    queryFn: () => masterDataApi.goDocument(selected.id),
    enabled: !!selected,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['government-orders'] });
    queryClient.invalidateQueries({ queryKey: ['go-doc', selected?.id] });
  };

  const createMutation = useMutation({
    mutationFn: (payload) => masterDataApi.createGovernmentOrder(payload),
    onSuccess: () => {
      invalidate();
      toast.add('Government Order registered.', 'success');
      setModalOpen(false);
      setForm({ goNumber: '', goDate: '', issuingAuthority: '', subject: '', description: '' });
    },
    onError: (err) => setError(err.message || 'Could not register GO.'),
  });

  const uploadDoc = useMutation({
    mutationFn: async () => {
      assertUploadable(docFile);
      const dataUrl = await readFileAsDataUrl(docFile);
      return masterDataApi.uploadGoDocument(selected.id, { label: docLabel || docFile.name, dataUrl });
    },
    onSuccess: () => { invalidate(); setDocFile(null); setDocLabel(''); setDocError(''); toast.add('Scan uploaded.', 'success'); },
    onError: (err) => setDocError(err.message || 'Upload failed.'),
  });

  const removeDoc = useMutation({
    mutationFn: () => masterDataApi.deleteGoDocument(selected.id),
    onSuccess: () => {
      invalidate();
      toast.add('Scan removed.', 'success');
      setConfirmDocDelete(false);
    },
    onError: (err) => setActionError(err.message || 'Could not remove scan.'),
  });

  const openDetail = async (row) => {
    setSelected(row);
    setDocFile(null); setDocLabel(''); setDocError('');
    try {
      const meta = await masterDataApi.goDocument(row.id);
      if (meta?.label) setDocLabel(meta.label);
    } catch { /* no document yet */ }
  };

  const viewDoc = () => openFile(masterDataApi.goDocumentFileUrl(selected.id)).catch((e) => toast.add(e.message, 'error'));

  const columns = [
    { field: 'goNumber', label: 'GO Number', mono: true },
    { field: 'goDate', label: 'Date', mono: true, render: (r) => fmt.date(r.goDate) },
    { field: 'issuingAuthority', label: 'Authority' },
    { field: 'subject', label: 'Subject' },
    { field: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'ACTIVE' ? 'success' : 'default'}>{r.status}</Badge> },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Government Order Register</h1>
            <p>Every policy cites the GO that authorises it. Click a row to attach the scanned order.</p>
          </div>
          <div className="page-header-actions">
            <Button onClick={() => { setError(''); setForm({ goNumber: '', goDate: '', issuingAuthority: '', subject: '', description: '' }); setModalOpen(true); }}>
              Add Government Order
            </Button>
          </div>
        </div>
      </header>

      <Card noPadding>
        <div className="table-toolbar">
          <input type="search" placeholder="Search GOs…" value={search} onChange={(e) => setSearch(e.target.value)} className="input table-search" />
        </div>
        <Table columns={columns} data={data?.rows || []} keyField="id" loading={isLoading} emptyMessage="No government orders registered."
          onRowClick={(row) => openDetail(row)} />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Register a Government Order"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={createMutation.isPending} onClick={() => { setError(''); createMutation.mutate(form); }}>Register</Button>
          </>
        }
      >
        <form noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="form-grid">
            <Input id="go-num" label="GO Number" value={form.goNumber} onChange={(e) => setForm({ ...form, goNumber: e.target.value })} mono required />
            <Input id="go-date" label="GO Date" type="date" value={form.goDate} onChange={(e) => setForm({ ...form, goDate: e.target.value })} required />
            <Input id="go-auth" label="Issuing Authority" value={form.issuingAuthority} onChange={(e) => setForm({ ...form, issuingAuthority: e.target.value })} />
          </div>
          <Input id="go-subject" label="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
          <Input id="go-desc" label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </form>
      </Modal>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.goNumber} — Scan` : 'GO Scan'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
            {doc?.id && (
              <Button
                variant="secondary"
                onClick={() => {
                  setActionError('');
                  setConfirmDocDelete(true);
                }}
              >
                Remove
              </Button>
            )}
          </>
        }
      >
        {selected && (
          <>
            <p className="form-note">
              {selected.subject} · {selected.issuingAuthority || '—'} · {fmt.date(selected.goDate)}
            </p>

            {doc?.id ? (
              <div className="row-actions" style={{ justifyContent: 'space-between' }}>
                <span className="form-note">{doc.label} · {humanSize(doc.sizeBytes)} · {doc.mimeType}</span>
                <Button variant="secondary" size="sm" onClick={viewDoc}>View</Button>
              </div>
            ) : (
              <div className="stack">
                {docError && <div className="auth-error" role="alert">{docError}</div>}
                <div className="field">
                  <label className="field-label" htmlFor="godoc-label">Label</label>
                  <input id="godoc-label" className="input" value={docLabel} onChange={(e) => setDocLabel(e.target.value)} placeholder="e.g. DA GO scan" />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="godoc-file">Scan</label>
                  <input id="godoc-file" className="input" type="file" accept={ACCEPTED_UPLOAD_TYPES} onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
                  <p className="field-hint">PDF, PNG, JPEG or WebP · up to 5 MB. One scan per order.</p>
                </div>
                <div className="card-actions">
                  <Button loading={uploadDoc.isPending} disabled={!docFile} onClick={() => uploadDoc.mutate()}>Upload Scan</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Modal>

      <ConfirmationModal
        open={confirmDocDelete}
        onClose={() => setConfirmDocDelete(false)}
        onConfirm={() => removeDoc.mutate()}
        title="Remove GO Scan Document"
        itemName={doc?.label || selected?.goNumber}
        details={{
          'GO Number': selected?.goNumber,
          'Subject': selected?.subject,
          'Size': humanSize(doc?.sizeBytes),
          'Format': doc?.mimeType,
        }}
        warningMessage="Removing this attached scan document will permanently remove the uploaded file from this Government Order record."
        confirmLabel="Confirm Deletion"
        confirmVariant="danger"
        loading={removeDoc.isPending}
        error={actionError}
      />
    </div>
  );
}
