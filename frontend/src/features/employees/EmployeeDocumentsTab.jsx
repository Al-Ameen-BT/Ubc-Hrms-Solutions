import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { documentApi } from '../../api/extended';
import { openFile } from '../../api/client';
import { readFileAsDataUrl, assertUploadable, humanSize, ACCEPTED_UPLOAD_TYPES } from '../../lib/files';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';

const DOC_TYPES = [
  { value: 'PAN', label: 'PAN' },
  { value: 'AADHAR', label: 'Aadhaar' },
  { value: 'EDUCATION_CERTIFICATE', label: 'Education Certificate' },
  { value: 'PHOTO', label: 'Photograph' },
  { value: 'OTHER', label: 'Other' },
];

export function EmployeeDocumentsTab({ employeeId }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [docType, setDocType] = useState('PAN');
  const [label, setLabel] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['emp-documents', employeeId],
    queryFn: () => documentApi.list(employeeId),
  });
  const rows = data?.rows || [];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['emp-documents', employeeId] });

  const close = () => { setOpen(false); setDocType('PAN'); setLabel(''); setFile(null); setError(''); };

  const upload = useMutation({
    mutationFn: async () => {
      assertUploadable(file);
      const dataUrl = await readFileAsDataUrl(file);
      return documentApi.upload(employeeId, { docType, label: label || null, dataUrl });
    },
    onSuccess: () => { invalidate(); toast.add('Document uploaded.', 'success'); close(); },
    onError: (err) => setError(err.message || 'Upload failed.'),
  });

  const remove = useMutation({
    mutationFn: (row) => documentApi.remove(employeeId, row.id),
    onSuccess: () => { invalidate(); toast.add('Document removed.', 'success'); },
    onError: (err) => toast.add(err.message || 'Could not remove.', 'error'),
  });

  const columns = [
    { field: 'docType', label: 'Type', render: (r) => <Badge variant="info">{DOC_TYPES.find((t) => t.value === r.docType)?.label || r.docType}</Badge> },
    { field: 'label', label: 'Label', render: (r) => r.label || '—' },
    { field: 'mimeType', label: 'Format', mono: true },
    { field: 'sizeBytes', label: 'Size', mono: true, align: 'right', render: (r) => humanSize(r.sizeBytes) },
    { field: 'createdAt', label: 'Uploaded', mono: true, render: (r) => new Date(r.createdAt).toLocaleDateString('en-IN') },
    {
      field: '__actions', label: '', sortable: false,
      render: (r) => (
        <div className="row-actions">
          <Button variant="secondary" size="sm" onClick={() => openFile(documentApi.fileUrl(employeeId, r.id)).catch((e) => toast.add(e.message, 'error'))}>View</Button>
          <Button variant="secondary" size="sm" onClick={() => { if (window.confirm('Remove this document?')) remove.mutate(r); }}>Remove</Button>
        </div>
      ),
    },
  ];

  return (
    <Card title="Documents" noPadding>
      <div className="table-toolbar">
        <span className="form-note">PAN, Aadhaar, certificates and photograph — stored securely against the employee record.</span>
        <Button onClick={() => { setError(''); setOpen(true); }}>Upload Document</Button>
      </div>
      <Table columns={columns} data={rows} keyField="id" loading={isLoading} emptyMessage="No documents on file." />

      <Modal
        open={open}
        onClose={close}
        title="Upload Document"
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button loading={upload.isPending} onClick={() => { setError(''); upload.mutate(); }}>Upload</Button>
          </>
        }
      >
        <form noValidate onSubmit={(e) => { e.preventDefault(); setError(''); upload.mutate(); }}>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="field">
            <label className="field-label" htmlFor="doc-type">Document Type <span className="field-required">*</span></label>
            <select id="doc-type" className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
              {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="doc-label">Label</label>
            <input id="doc-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. PAN card" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="doc-file">File <span className="field-required">*</span></label>
            <input id="doc-file" className="input" type="file" accept={ACCEPTED_UPLOAD_TYPES} onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <p className="field-hint">PNG, JPEG, WebP or PDF · up to 5 MB.</p>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
