import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orgApi, openFile, fmt } from '../../api/client';
import { profileApi } from '../../api/extended';
import { readFileAsDataUrl, assertUploadable, humanSize, ACCEPTED_UPLOAD_TYPES } from '../../lib/files';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Table } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import { BrandAssetUpload } from '../../components/BrandAssetUpload';

const BOARD_ROLES = ['CHAIRMAN', 'VICE_CHAIRMAN', 'MEMBER', 'MANAGING_DIRECTOR', 'GENERAL_MANAGER', 'ASSISTANT_GENERAL_MANAGER', 'OTHER'];
const DOC_TYPES = ['RBI_LICENSE', 'INCORPORATION_CERTIFICATE', 'PAN', 'GSTN', 'TAN', 'OTHER'];
const BLANK_BOARD = { name: '', role: 'MEMBER', roleOther: '', displayOrder: '' };

const SETTINGS_TABS = [
  ['details', 'Details & Identity'],
  ['board', 'Board Members'],
  ['documents', 'Statutory Documents'],
  ['branding', 'Branding & Domain'],
  ['email', 'Email (SMTP)'],
];

/* Combined Organisation Settings Page — includes identity, governance, documents, branding, domain, and email */
export function SettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const activeTabParam = params.get('tab');
  const [tab, setTabState] = useState(
    SETTINGS_TABS.some(([id]) => id === activeTabParam) ? activeTabParam : 'details'
  );

  const setTab = (newTab) => {
    setTabState(newTab);
    setParams({ tab: newTab });
  };

  useEffect(() => {
    if (activeTabParam && SETTINGS_TABS.some(([id]) => id === activeTabParam) && activeTabParam !== tab) {
      setTabState(activeTabParam);
    }
  }, [activeTabParam]);

  // Settings Queries & State
  const [smtp, setSmtp] = useState(null);
  const [orgForm, setOrgForm] = useState(null);

  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ['org-settings'],
    queryFn: orgApi.settings,
  });

  // Profile Queries & State
  const [profileForm, setProfileForm] = useState(null);
  const [deleteBoardTarget, setDeleteBoardTarget] = useState(null);
  const [deleteDocTarget, setDeleteDocTarget] = useState(null);
  const [actionError, setActionError] = useState('');

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

  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ['org-profile'],
    queryFn: profileApi.get,
  });

  useEffect(() => {
    if (settingsData?.organization) {
      const o = settingsData.organization;
      setOrgForm({
        shortName: o.shortName || '',
        contactEmail: o.contactEmail || '',
        contactPhone: o.contactPhone || '',
        website: o.website || '',
        address: o.address || '',
      });
    }
    if (settingsData?.smtp) {
      const m = settingsData.smtp;
      setSmtp({
        enabled: m.enabled || false,
        host: m.host || '',
        port: m.port || 587,
        security: m.security || 'STARTTLS',
        username: m.username || '',
        password: '',
        fromName: m.fromName || '',
        fromEmail: m.fromEmail || '',
        replyTo: m.replyTo || '',
        hasPassword: m.hasPassword,
      });
    }
  }, [settingsData]);

  useEffect(() => {
    if (profileData?.organization) {
      const p = profileData.organization;
      setProfileForm({
        establishedYear: p.establishedYear || '',
        registrationNumber: p.registrationNumber || '',
        rbiLicenseNumber: p.rbiLicenseNumber || '',
        rbiLicenseDate: p.rbiLicenseDate?.slice(0, 10) || '',
        gstn: p.gstn || '',
        panNumber: p.panNumber || '',
        address: p.address || '',
      });
    }
  }, [profileData]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['org-settings'] });
    queryClient.invalidateQueries({ queryKey: ['org-profile'] });
  };

  const saveOrg = useMutation({
    mutationFn: (payload) => orgApi.updateSettings(payload),
    onSuccess: () => {
      invalidate();
      toast.add('Organisation details saved.', 'success');
    },
    onError: (err) => toast.add(err.message || 'Save failed.', 'error'),
  });

  const saveProfile = useMutation({
    mutationFn: (payload) => profileApi.update(payload),
    onSuccess: () => {
      invalidate();
      toast.add('Bank identity & statutory profile saved.', 'success');
    },
    onError: (err) => toast.add(err.message || 'Save failed.', 'error'),
  });

  const saveSmtp = useMutation({
    mutationFn: (payload) => orgApi.updateSmtp(payload),
    onSuccess: () => {
      invalidate();
      toast.add('SMTP saved.', 'success');
    },
    onError: (err) => toast.add(err.message || 'Save failed.', 'error'),
  });

  const testSmtp = useMutation({
    mutationFn: () => orgApi.testSmtp({}),
    onSuccess: () => toast.add('Test email sent.', 'success'),
    onError: (err) => toast.add(err.message || 'SMTP test failed.', 'error'),
  });

  const refreshBranding = () => {
    invalidate();
    window.dispatchEvent(new Event('ucb:branding-changed'));
    toast.add('Branding updated.', 'success');
  };

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
      setBoardOpen(false);
      setBoardEditing(null);
      setBoardForm(BLANK_BOARD);
      setBoardPhoto(null);
      setBoardError('');
      toast.add(boardEditing ? 'Board member updated.' : 'Board member added.', 'success');
    },
    onError: (err) => setBoardError(err.message || 'Could not save board member.'),
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
      setDocOpen(false);
      setDocType('RBI_LICENSE');
      setDocLabel('');
      setDocFile(null);
      setDocError('');
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

  const org = settingsData?.organization;
  const board = profileData?.board || [];
  const documents = profileData?.documents || [];

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
        <div className="org-structure-heading">
          <div>
            <h1>Organisation Settings</h1>
            <p>Organisation configuration, bank identity, governance records, branding, and email</p>
          </div>
          <Link className="org-profile-link" to="/organisation-structure">
            Go to Organisation Structure &amp; Chart
          </Link>
        </div>
      </header>

      <nav className="tabs" aria-label="Organisation settings sections">
        {SETTINGS_TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tab ${tab === id ? 'tab-active' : ''}`}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ── Tab 1: Details & Identity ── */}
      {tab === 'details' && (
        <section aria-labelledby="details-heading">
          <Card title="Organisation Details">
            <div className="form-grid">
              <Input id="os-name" label="Organisation Name" defaultValue={org?.name} disabled />
              <Input id="os-code" label="Code" defaultValue={org?.code} disabled mono />
              <Input id="os-reg" label="Regulator" defaultValue={org?.regulator} disabled />
            </div>
            <div className="form-grid">
              <Input id="os-short" label="Short Name" value={orgForm?.shortName || ''} onChange={(e) => setOrgForm({ ...orgForm, shortName: e.target.value })} />
              <Input id="os-email" label="Contact Email" type="email" value={orgForm?.contactEmail || ''} onChange={(e) => setOrgForm({ ...orgForm, contactEmail: e.target.value })} />
              <Input id="os-phone" label="Contact Phone" value={orgForm?.contactPhone || ''} onChange={(e) => setOrgForm({ ...orgForm, contactPhone: e.target.value })} />
              <Input id="os-website" label="Website" value={orgForm?.website || ''} onChange={(e) => setOrgForm({ ...orgForm, website: e.target.value })} />
              <Input id="os-address" label="Address" value={orgForm?.address || ''} onChange={(e) => setOrgForm({ ...orgForm, address: e.target.value })} />
            </div>
            <p className="form-note">Registered name and code are set by the platform. You can edit your bank's contact details here.</p>
            <div className="card-actions">
              <Button loading={saveOrg.isPending} onClick={() => saveOrg.mutate(orgForm)}>Save Details</Button>
            </div>
          </Card>

          <Card title="Bank Identity &amp; Statutory Registration">
            <p className="form-note">Official regulatory numbers, licensing dates, and tax identities used across regulatory reports and document footers.</p>
            <div className="form-grid">
              <Input id="op-est" label="Established Year" value={profileForm?.establishedYear || ''} onChange={(e) => setProfileForm({ ...profileForm, establishedYear: e.target.value })} mono />
              <Input id="op-reg" label="Registration Number" value={profileForm?.registrationNumber || ''} onChange={(e) => setProfileForm({ ...profileForm, registrationNumber: e.target.value })} mono />
              <Input id="op-rbi" label="RBI Licence Number" value={profileForm?.rbiLicenseNumber || ''} onChange={(e) => setProfileForm({ ...profileForm, rbiLicenseNumber: e.target.value })} mono />
              <Input id="op-rbidate" label="RBI Licence Date" type="date" value={profileForm?.rbiLicenseDate || ''} onChange={(e) => setProfileForm({ ...profileForm, rbiLicenseDate: e.target.value })} />
              <Input id="op-gstn" label="GSTN" value={profileForm?.gstn || ''} onChange={(e) => setProfileForm({ ...profileForm, gstn: e.target.value })} mono />
              <Input id="op-pan" label="PAN" value={profileForm?.panNumber || ''} onChange={(e) => setProfileForm({ ...profileForm, panNumber: e.target.value })} mono />
            </div>
            <div className="card-actions">
              <Button loading={saveProfile.isPending} onClick={() => saveProfile.mutate(profileForm)}>Save Statutory Profile</Button>
            </div>
          </Card>

          <Card title="Licence &amp; Usage">
            <div className="stat-grid">
              <div className="stat-ledger"><div className="stat-ledger-label">Plan</div><div className="stat-ledger-value">{settingsData?.license?.plan || '—'}</div></div>
              <div className="stat-ledger"><div className="stat-ledger-label">Users</div><div className="stat-ledger-value mono">{settingsData?.usage?.users || 0} / {settingsData?.license?.maxUsers ?? '∞'}</div></div>
              <div className="stat-ledger"><div className="stat-ledger-label">Employees</div><div className="stat-ledger-value mono">{settingsData?.usage?.employees || 0} / {settingsData?.license?.maxEmployees ?? '∞'}</div></div>
            </div>
          </Card>
        </section>
      )}

      {/* ── Tab 2: Board Members ── */}
      {tab === 'board' && (
        <section aria-labelledby="board-heading">
          <Card
            title="Board Members"
            noPadding
            actions={
              <Button onClick={() => {
                setBoardEditing(null);
                setBoardForm({ ...BLANK_BOARD, displayOrder: String(board.length + 1) });
                setBoardPhoto(null);
                setBoardError('');
                setBoardOpen(true);
              }}>
                Add Board Member
              </Button>
            }
          >
            {profileLoading ? (
              <p className="org-section-state" style={{ padding: 'var(--space-4)' }}>Loading board members…</p>
            ) : (
              <Table columns={boardColumns} data={board} keyField="id" emptyMessage="No board members recorded." />
            )}
          </Card>
        </section>
      )}

      {/* ── Tab 3: Statutory Documents ── */}
      {tab === 'documents' && (
        <section aria-labelledby="documents-heading">
          <Card
            title="Statutory Documents"
            noPadding
            actions={
              <Button onClick={() => {
                setDocType('RBI_LICENSE');
                setDocLabel('');
                setDocFile(null);
                setDocError('');
                setDocOpen(true);
              }}>
                Upload Document
              </Button>
            }
          >
            <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-subtle)' }}>
              <span className="form-note">RBI licence, incorporation certificate, PAN, GSTN, and TAN document records.</span>
            </div>
            {profileLoading ? (
              <p className="org-section-state" style={{ padding: 'var(--space-4)' }}>Loading documents…</p>
            ) : (
              <Table columns={docColumns} data={documents} keyField="id" emptyMessage="No documents uploaded." />
            )}
          </Card>
        </section>
      )}

      {/* ── Tab 4: Branding & Domain ── */}
      {tab === 'branding' && (
        <section aria-labelledby="branding-heading">
          <Card title="Branding">
            <div className="form-grid">
              <BrandAssetUpload
                id="org-banner"
                label="Banner logo"
                hint="Wide logo for sign-in, navigation and documents."
                asset={settingsData?.logo}
                limitBytes={settingsData?.logoLimitBytes || 512 * 1024}
                src={org?.code ? `/assets/org/${encodeURIComponent(org.code)}/logo?v=${settingsData?.logo?.version}` : ''}
                accept=".png,.jpg,.jpeg,.webp"
                onUpload={orgApi.uploadLogo}
                onDelete={orgApi.deleteLogo}
                onChanged={refreshBranding}
              />
              <BrandAssetUpload
                id="org-icon"
                label="Icon logo"
                hint="Square mark used as this organisation's browser favicon."
                asset={settingsData?.favicon}
                limitBytes={settingsData?.faviconLimitBytes || 128 * 1024}
                src={org?.code ? `/assets/org/${encodeURIComponent(org.code)}/favicon?v=${settingsData?.favicon?.version}` : ''}
                accept=".png,.jpg,.jpeg,.webp,.ico"
                onUpload={orgApi.uploadFavicon}
                onDelete={orgApi.deleteFavicon}
                onChanged={refreshBranding}
              />
            </div>
          </Card>

          <Card title="Custom Domain">
            <p className="form-note">You sign in at:</p>
            <div className="signin-address">
              <code className="mono">{settingsData?.loginUrl}</code>
              <Button variant="secondary" size="sm" onClick={() => { navigator.clipboard.writeText(settingsData?.loginUrl || ''); toast.add('Copied.', 'success'); }}>Copy</Button>
            </div>
            {settingsData?.customDomain ? (
              <>
                <p className="form-note">To serve the console on your bank's own address, create this DNS record with your domain provider:</p>
                <dl className="domain-record-grid">
                  <div><dt>Type</dt><dd className="mono">CNAME</dd></div>
                  <div><dt>Name</dt><dd className="mono">{settingsData.customDomain}</dd></div>
                  <div><dt>Value</dt><dd className="mono">{settingsData.cnameTarget}</dd></div>
                </dl>
                {settingsData.customDomainVerifiedAt
                  ? <div className="domain-status"><Badge variant="success">Verified {fmt.date(settingsData.customDomainVerifiedAt)}</Badge></div>
                  : <div className="domain-status"><Badge variant="default">Awaiting DNS verification</Badge></div>}
              </>
            ) : (
              <p className="form-note">Ask the platform to connect a custom domain to give your bank its own web address instead of the shared link above.</p>
            )}
          </Card>
        </section>
      )}

      {/* ── Tab 5: Email (SMTP) ── */}
      {tab === 'email' && (
        <section aria-labelledby="email-heading">
          <Card title="Email (SMTP)">
            {!smtp ? (
              <p>Loading…</p>
            ) : (
              <>
                {!settingsData?.platformSmtpAvailable && (
                  <p className="form-note">No platform-wide SMTP relay is configured — this bank must configure its own to send email.</p>
                )}
                <div className="form-grid">
                  <div className="field">
                    <label className="field-label" htmlFor="s-enabled">Enabled</label>
                    <select id="s-enabled" className="input" value={smtp.enabled ? 'yes' : 'no'} onChange={(e) => setSmtp({ ...smtp, enabled: e.target.value === 'yes' })}>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                  <Input id="s-host" label="SMTP Host" value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} />
                  <Input id="s-port" label="Port" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: e.target.value })} mono />
                  <div className="field">
                    <label className="field-label" htmlFor="s-sec">Security</label>
                    <select id="s-sec" className="input" value={smtp.security} onChange={(e) => setSmtp({ ...smtp, security: e.target.value })}>
                      <option value="STARTTLS">STARTTLS</option>
                      <option value="SSL">SSL</option>
                      <option value="NONE">None</option>
                    </select>
                  </div>
                  <Input id="s-user" label="Username" value={smtp.username} onChange={(e) => setSmtp({ ...smtp, username: e.target.value })} />
                  <Input id="s-pass" label="Password" type="password" value={smtp.password} onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} placeholder={smtp.hasPassword ? '•••••••• (unchanged)' : ''} />
                  <Input id="s-from" label="From Name" value={smtp.fromName} onChange={(e) => setSmtp({ ...smtp, fromName: e.target.value })} />
                  <Input id="s-email" label="From Email" type="email" value={smtp.fromEmail} onChange={(e) => setSmtp({ ...smtp, fromEmail: e.target.value })} />
                </div>
                <div className="card-actions">
                  <Button variant="secondary" loading={testSmtp.isPending} onClick={() => testSmtp.mutate()}>Test SMTP</Button>
                  <Button loading={saveSmtp.isPending} onClick={() => saveSmtp.mutate(smtp)}>Save SMTP Settings</Button>
                </div>
              </>
            )}
          </Card>
        </section>
      )}

      {/* Board Member Modal */}
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

      {/* Statutory Document Modal */}
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

      {/* Confirmation Modal for Board Member Removal */}
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

      {/* Confirmation Modal for Document Removal */}
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
    </div>
  );
}
