import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profileApi } from '../../api/extended';
import { orgApi } from '../../api/client';
import { openFile } from '../../api/client';
import { readFileAsDataUrl, assertUploadable, humanSize, ACCEPTED_UPLOAD_TYPES } from '../../lib/files';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import { ImageCropModal } from '../../components/ui/ImageCropModal';

const BOARD_ROLES = ['CHAIRMAN', 'VICE_CHAIRMAN', 'MEMBER', 'MANAGING_DIRECTOR', 'GENERAL_MANAGER', 'ASSISTANT_GENERAL_MANAGER', 'OTHER'];
const DOC_TYPES = ['RBI_LICENSE', 'INCORPORATION_CERTIFICATE', 'PAN', 'GSTN', 'TAN', 'OTHER'];

const BLANK_BRANCH = { name: '', branchCode: '', address: '', phone: '', isHeadOffice: false };
const BLANK_BOARD = { name: '', role: 'MEMBER', roleOther: '', displayOrder: '' };

/* Bank identity, board, branches and statutory documents — one page
   (routes/orgSettings.js /org/profile* and routes/serviceBook for scans). */
export function OrgProfilePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [deleteBranchTarget, setDeleteBranchTarget] = useState(null);
  const [deleteBoardTarget, setDeleteBoardTarget] = useState(null);
  const [deleteDocTarget, setDeleteDocTarget] = useState(null);
  const [actionError, setActionError] = useState('');
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [rawLogoSrc, setRawLogoSrc] = useState(null);
  const [logoPreviewSrc, setLogoPreviewSrc] = useState(null);

  const [branchOpen, setBranchOpen] = useState(false);
  const [branchEditing, setBranchEditing] = useState(null);
  const [branchForm, setBranchForm] = useState(BLANK_BRANCH);
  const [branchError, setBranchError] = useState('');

  const [boardOpen, setBoardOpen] = useState(false);
  const [boardEditing, setBoardEditing] = useState(null);
  const [boardForm, setBoardForm] = useState(BLANK_BOARD);
  const [boardPhoto, setBoardPhoto] = useState(null);
  const [boardError, setBoardError] = useState('');

  const [docOpen, setDocOpen] = useState(false);
  const [docType, setDocType] = useState('RBI_LICENSE');
  const [docLabel, setDocLabel] = useState('');
  const [docFile, setDocFile] = useState(null);
  const [docError, setDocError] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['org-profile'], queryFn: profileApi.get });

  useEffect(() => { if (data?.organization) setForm({ ...data.organization }); }, [data]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['org-profile'] });

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const saveProfile = useMutation({
    mutationFn: (payload) => profileApi.update(payload),
    onSuccess: () => { invalidate(); toast.add('Profile saved.', 'success'); },
    onError: (err) => toast.add(err.message || 'Save failed.', 'error'),
  });

  const uploadLogo = useMutation({
    mutationFn: (dataUrl) => orgApi.uploadLogo(dataUrl),
    onSuccess: (_, variables) => {
      invalidate();
      setLogoPreviewSrc(variables);
      setCropModalOpen(false);
      setRawLogoSrc(null);
      toast.add('Logo updated successfully.', 'success');
    },
    onError: (err) => toast.add(err.message || 'Logo upload failed.', 'error'),
  });

  const saveBranch = useMutation({
    mutationFn: (payload) => (branchEditing
      ? profileApi.updateBranch(branchEditing.id, payload)
      : profileApi.createBranch(payload)),
    onSuccess: () => {
      invalidate();
      setBranchOpen(false); setBranchEditing(null); setBranchForm(BLANK_BRANCH); setBranchError('');
      toast.add(branchEditing ? 'Branch updated.' : 'Branch added.', 'success');
    },
    onError: (err) => setBranchError(err.message || 'Could not save.'),
  });

  const removeBranch = useMutation({
    mutationFn: (row) => profileApi.deleteBranch(row.id),
    onSuccess: () => {
      invalidate();
      toast.add('Branch removed.', 'success');
      setDeleteBranchTarget(null);
    },
    onError: (err) => setActionError(err.message || 'Could not remove branch.'),
  });

  const saveBoard = useMutation({
    mutationFn: async (payload) => {
      let photoDataUrl = null;
      if (boardPhoto) {
        assertUploadable(boardPhoto);
        photoDataUrl = await readFileAsDataUrl(boardPhoto);
      }
      return (boardEditing
        ? profileApi.updateBoardMember(boardEditing.id, { ...payload, ...(photoDataUrl ? { photoDataUrl } : {}) })
        : profileApi.createBoardMember({ ...payload, ...(photoDataUrl ? { photoDataUrl } : {}) }));
    },
    onSuccess: () => {
      invalidate();
      setBoardOpen(false); setBoardEditing(null); setBoardForm(BLANK_BOARD); setBoardPhoto(null); setBoardError('');
      toast.add(boardEditing ? 'Board member updated.' : 'Board member added.', 'success');
    },
    onError: (err) => setBoardError(err.message || 'Could not save.'),
  });

  const removeBoard = useMutation({
    mutationFn: (row) => profileApi.deleteBoardMember(row.id),
    onSuccess: () => {
      invalidate();
      toast.add('Board member removed.', 'success');
      setDeleteBoardTarget(null);
    },
    onError: (err) => setActionError(err.message || 'Could not remove board member.'),
  });

  const uploadDoc = useMutation({
    mutationFn: async () => {
      assertUploadable(docFile);
      const fileDataUrl = await readFileAsDataUrl(docFile);
      return orgApi.createDocument({ docType, label: docLabel || null, fileName: docFile.name, fileDataUrl });
    },
    onSuccess: () => {
      invalidate();
      setDocOpen(false); setDocType('RBI_LICENSE'); setDocLabel(''); setDocFile(null); setDocError('');
      toast.add('Document uploaded.', 'success');
    },
    onError: (err) => setDocError(err.message || 'Upload failed.'),
  });

  const removeDoc = useMutation({
    mutationFn: (row) => orgApi.deleteDocument(row.id),
    onSuccess: () => {
      invalidate();
      toast.add('Document removed.', 'success');
      setDeleteDocTarget(null);
    },
    onError: (err) => setActionError(err.message || 'Could not remove document.'),
  });

  if (isLoading || !form) return <div className="page"><p>Loading…</p></div>;

  const o = data.organization;
  const board = data.board || [];
  const branches = data.branches || [];
  const documents = data.documents || [];

  const branchColumns = [
    { field: 'name', label: 'Branch' },
    { field: 'code', label: 'Code', mono: true, render: (r) => r.code || '—' },
    { field: 'address', label: 'Address', render: (r) => r.address || '—' },
    { field: 'phone', label: 'Phone', mono: true, render: (r) => r.phone || '—' },
    { field: 'isHeadOffice', label: 'Type', render: (r) => (r.isHeadOffice ? <Badge variant="success">Head Office</Badge> : 'Branch') },
    {
      field: 'actions', label: '', sortable: false,
      render: (r) => (
        <div className="row-actions">
          <Button variant="secondary" size="sm" onClick={() => {
            setBranchEditing(r);
            setBranchForm({ name: r.name || '', branchCode: r.code || '', address: r.address || '', phone: r.phone || '', isHeadOffice: !!r.isHeadOffice });
            setBranchError(''); setBranchOpen(true);
          }}>Edit</Button>
          <Button variant="secondary" size="sm" onClick={() => {
            setActionError('');
            setDeleteBranchTarget(r);
          }}>Remove</Button>
        </div>
      ),
    },
  ];

  const boardColumns = [
    { field: 'displayOrder', label: '#', mono: true, align: 'right' },
    { field: 'name', label: 'Name' },
    { field: 'role', label: 'Role', render: (r) => <Badge variant="info">{r.roleOther || r.role}</Badge> },
    { field: 'hasPhoto', label: 'Photo', render: (r) => (r.hasPhoto ? <Badge variant="success">On file</Badge> : '—') },
    {
      field: 'actions', label: '', sortable: false,
      render: (r) => (
        <div className="row-actions">
          <Button variant="secondary" size="sm" onClick={() => {
            setBoardEditing(r);
            setBoardForm({ name: r.name || '', role: r.role || 'MEMBER', roleOther: r.roleOther || '', displayOrder: r.displayOrder ?? '' });
            setBoardPhoto(null); setBoardError(''); setBoardOpen(true);
          }}>Edit</Button>
          <Button variant="secondary" size="sm" onClick={() => {
            setActionError('');
            setDeleteBoardTarget(r);
          }}>Remove</Button>
        </div>
      ),
    },
  ];

  const docColumns = [
    { field: 'docType', label: 'Type', render: (r) => <Badge variant="info">{r.docType}</Badge> },
    { field: 'label', label: 'Label', render: (r) => r.label || '—' },
    { field: 'fileName', label: 'File', render: (r) => r.fileName || '—' },
    { field: 'sizeBytes', label: 'Size', mono: true, align: 'right', render: (r) => humanSize(r.sizeBytes) },
    { field: 'mimeType', label: 'Format', mono: true },
    {
      field: 'actions', label: '', sortable: false,
      render: (r) => (
        <div className="row-actions">
          <Button variant="secondary" size="sm" onClick={() => openFile(orgApi.documentFileUrl(r.id)).catch((e) => toast.add(e.message, 'error'))}>View</Button>
          <Button variant="secondary" size="sm" onClick={() => {
            setActionError('');
            setDeleteDocTarget(r);
          }}>Remove</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Organisation Profile</h1>
        <p>Bank identity, board, branches, and statutory documents</p>
      </header>

      <Card title="Bank Identity">
        <div className="profile-grid">
          <div className="profile-logo">
            <div className="profile-logo-preview">
              {logoPreviewSrc ? (
                <img
                  src={logoPreviewSrc}
                  alt="Bank Logo Preview"
                />
              ) : data?.logo && o?.code ? (
                <img
                  src={`/assets/org/${encodeURIComponent(o.code)}/logo?v=${data.logo.version || '1'}`}
                  alt="Bank Logo"
                  onError={(e) => {
                    // Fallback to placeholder if asset endpoint is unreachable
                    e.currentTarget.style.display = 'none';
                    if (e.currentTarget.nextSibling) {
                      e.currentTarget.nextSibling.style.display = 'flex';
                    }
                  }}
                />
              ) : (
                <div className="logo-placeholder">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  <span>Bank Logo</span>
                </div>
              )}
            </div>
            <label className="file-upload-btn-wrap" htmlFor="op-logo">
              <span className="file-upload-btn">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M3 13v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3M10 3v10M6 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {uploadLogo.isPending ? 'Uploading…' : data?.logo || logoPreviewSrc ? 'Change / Crop Logo' : 'Upload Logo'}
              </span>
              <input
                id="op-logo"
                type="file"
                accept=".png,.jpg,.jpeg,.webp"
                disabled={uploadLogo.isPending}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    assertUploadable(f);
                    const dataUrl = await readFileAsDataUrl(f);
                    setRawLogoSrc(dataUrl);
                    setCropModalOpen(true);
                  } catch (err) {
                    toast.add(err.message || 'Could not read logo.', 'error');
                  }
                  e.target.value = '';
                }}
              />
            </label>
            <span className="field-hint" style={{ fontSize: '0.7rem' }}>PNG, JPG or WebP (crop & align)</span>
          </div>
          <div className="form-grid">
            <Input id="op-name" label="Registered Name" value={form.name || ''} readOnly disabled />
            <Input id="op-short" label="Short Name" value={form.shortName || ''} readOnly disabled />
            <Input id="op-est" label="Established Year" value={form.establishedYear || ''} onChange={(e) => set({ establishedYear: e.target.value })} mono />
            <Input id="op-reg" label="Registration Number" value={form.registrationNumber || ''} onChange={(e) => set({ registrationNumber: e.target.value })} mono />
            <Input id="op-rbi" label="RBI Licence Number" value={form.rbiLicenseNumber || ''} onChange={(e) => set({ rbiLicenseNumber: e.target.value })} mono />
            <Input id="op-rbidate" label="RBI Licence Date" type="date" value={form.rbiLicenseDate?.slice(0, 10) || ''} onChange={(e) => set({ rbiLicenseDate: e.target.value })} />
            <Input id="op-gstn" label="GSTN" value={form.gstn || ''} onChange={(e) => set({ gstn: e.target.value })} mono />
            <Input id="op-pan" label="PAN" value={form.panNumber || ''} onChange={(e) => set({ panNumber: e.target.value })} mono />
            <div style={{ gridColumn: '1 / -1' }}>
              <Input id="op-addr" label="Registered Address" value={form.address || ''} onChange={(e) => set({ address: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="card-actions">
          <Button loading={saveProfile.isPending} onClick={() => saveProfile.mutate(form)}>Save Profile</Button>
        </div>
      </Card>

      <Card title="Board Members" noPadding>
        <div className="table-toolbar">
          <div />
          <Button onClick={() => {
            setBoardEditing(null); setBoardForm({ ...BLANK_BOARD, displayOrder: String(board.length + 1) });
            setBoardPhoto(null); setBoardError(''); setBoardOpen(true);
          }}>Add Board Member</Button>
        </div>
        <Table columns={boardColumns} data={board} keyField="id" emptyMessage="No board members recorded." />
      </Card>

      <Card title="Branches" noPadding>
        <div className="table-toolbar">
          <div />
          <Button onClick={() => {
            setBranchEditing(null); setBranchForm(BLANK_BRANCH);
            setBranchError(''); setBranchOpen(true);
          }}>Add Branch</Button>
        </div>
        <Table columns={branchColumns} data={branches} keyField="id" emptyMessage="No branches recorded." />
      </Card>

      <Card title="Statutory Documents" noPadding>
        <div className="table-toolbar">
          <span className="form-note">RBI licence, incorporation certificate, PAN, GSTN and TAN scans.</span>
          <Button onClick={() => { setDocType('RBI_LICENSE'); setDocLabel(''); setDocFile(null); setDocError(''); setDocOpen(true); }}>Upload Document</Button>
        </div>
        <Table columns={docColumns} data={documents} keyField="id" emptyMessage="No documents uploaded." />
      </Card>

      <Modal
        open={branchOpen}
        onClose={() => setBranchOpen(false)}
        title={branchEditing ? 'Edit Branch' : 'Add Branch'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBranchOpen(false)}>Cancel</Button>
            <Button loading={saveBranch.isPending} onClick={() => { setBranchError(''); saveBranch.mutate(branchForm); }}>Save</Button>
          </>
        }
      >
        <form noValidate>
          {branchError && <div className="auth-error" role="alert">{branchError}</div>}
          <div className="form-grid">
            <Input id="br-name" label="Branch Name" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} required />
            <Input id="br-code" label="Branch Code" value={branchForm.branchCode} onChange={(e) => setBranchForm({ ...branchForm, branchCode: e.target.value })} mono />
            <Input id="br-phone" label="Phone" value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} mono />
            <Input id="br-addr" label="Address" value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} />
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={!!branchForm.isHeadOffice} onChange={(e) => setBranchForm({ ...branchForm, isHeadOffice: e.target.checked })} />
            <span>This is the head office</span>
          </label>
        </form>
      </Modal>

      <Modal
        open={boardOpen}
        onClose={() => setBoardOpen(false)}
        title={boardEditing ? 'Edit Board Member' : 'Add Board Member'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBoardOpen(false)}>Cancel</Button>
            <Button loading={saveBoard.isPending} onClick={() => { setBoardError(''); saveBoard.mutate(boardForm); }}>Save</Button>
          </>
        }
      >
        <form noValidate>
          {boardError && <div className="auth-error" role="alert">{boardError}</div>}
          <div className="form-grid">
            <Input id="bm-name" label="Name" value={boardForm.name} onChange={(e) => setBoardForm({ ...boardForm, name: e.target.value })} required />
            <div className="field">
              <label className="field-label" htmlFor="bm-role">Role</label>
              <select id="bm-role" className="input" value={boardForm.role} onChange={(e) => setBoardForm({ ...boardForm, role: e.target.value })}>
                {BOARD_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <Input id="bm-other" label="Designation (for “Other”)" value={boardForm.roleOther} onChange={(e) => setBoardForm({ ...boardForm, roleOther: e.target.value })} />
            <Input id="bm-order" label="Display Order" type="number" value={boardForm.displayOrder} onChange={(e) => setBoardForm({ ...boardForm, displayOrder: e.target.value })} mono />
            <div className="field">
              <label className="field-label" htmlFor="bm-photo">Photo (optional)</label>
              <input id="bm-photo" className="input" type="file" accept={ACCEPTED_UPLOAD_TYPES} onChange={(e) => setBoardPhoto(e.target.files?.[0] || null)} />
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={docOpen}
        onClose={() => setDocOpen(false)}
        title="Upload Statutory Document"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDocOpen(false)}>Cancel</Button>
            <Button loading={uploadDoc.isPending} disabled={!docFile} onClick={() => { setDocError(''); uploadDoc.mutate(); }}>Upload</Button>
          </>
        }
      >
        <form noValidate>
          {docError && <div className="auth-error" role="alert">{docError}</div>}
          <div className="field">
            <label className="field-label" htmlFor="doc-type">Type</label>
            <select id="doc-type" className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          {docType === 'OTHER' && (
            <Input id="doc-label" label="Label" value={docLabel} onChange={(e) => setDocLabel(e.target.value)} required hint="Required for “Other”." />
          )}
          <div className="field">
            <label className="field-label" htmlFor="doc-file">File</label>
            <input id="doc-file" className="input" type="file" accept={ACCEPTED_UPLOAD_TYPES} onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
            <p className="field-hint">PDF, PNG, JPEG or WebP · up to 5 MB.</p>
          </div>
        </form>
      </Modal>

      <ConfirmationModal
        open={deleteBranchTarget != null}
        onClose={() => setDeleteBranchTarget(null)}
        onConfirm={() => removeBranch.mutate(deleteBranchTarget)}
        title="Remove Branch"
        itemName={deleteBranchTarget?.name}
        details={{
          'Branch Code': deleteBranchTarget?.code || '—',
          'Address': deleteBranchTarget?.address || '—',
          'Phone': deleteBranchTarget?.phone || '—',
          'Type': deleteBranchTarget?.isHeadOffice ? 'Head Office' : 'Branch',
        }}
        warningMessage="Removing this branch will detach it from the bank profile. Existing employees assigned to this branch remain in the database."
        confirmLabel="Confirm Deletion"
        confirmVariant="danger"
        loading={removeBranch.isPending}
        error={actionError}
      />

      <ConfirmationModal
        open={deleteBoardTarget != null}
        onClose={() => setDeleteBoardTarget(null)}
        onConfirm={() => removeBoard.mutate(deleteBoardTarget)}
        title="Remove Board Member"
        itemName={deleteBoardTarget?.name}
        details={{
          'Role': deleteBoardTarget?.roleOther || deleteBoardTarget?.role,
          'Display Order': deleteBoardTarget?.displayOrder ?? '—',
        }}
        warningMessage="Removing this board member will remove them from the official bank organisation profile."
        confirmLabel="Confirm Deletion"
        confirmVariant="danger"
        loading={removeBoard.isPending}
        error={actionError}
      />

      <ConfirmationModal
        open={deleteDocTarget != null}
        onClose={() => setDeleteDocTarget(null)}
        onConfirm={() => removeDoc.mutate(deleteDocTarget)}
        title="Remove Document"
        itemName={deleteDocTarget?.label || deleteDocTarget?.fileName}
        details={{
          'Document Type': deleteDocTarget?.docType,
          'File Name': deleteDocTarget?.fileName,
          'Size': humanSize(deleteDocTarget?.sizeBytes),
          'Format': deleteDocTarget?.mimeType,
        }}
        warningMessage="Removing this statutory document will permanently remove the uploaded file from the bank profile. This cannot be undone."
        confirmLabel="Confirm Deletion"
        confirmVariant="danger"
        loading={removeDoc.isPending}
        error={actionError}
      />

      <ImageCropModal
        open={cropModalOpen}
        imageSrc={rawLogoSrc}
        onClose={() => {
          setCropModalOpen(false);
          setRawLogoSrc(null);
        }}
        onCropComplete={(croppedDataUrl) => {
          uploadLogo.mutate(croppedDataUrl);
        }}
        title="Crop & Align Bank Logo"
        aspectRatio={1}
        outputWidth={400}
        outputHeight={400}
      />
    </div>
  );
}
