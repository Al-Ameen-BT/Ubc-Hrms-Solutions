import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { platformApi, usersApi, fmt } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { StatLedger } from '../../components/ui/StatLedger';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Table } from '../../components/ui/Table';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import { Modal } from '../../components/ui/Modal';
import { TempPasswordModal } from '../../components/TempPasswordModal';

const BANK_CLASSES = ['SPECIAL_GRADE', 'CLASS_I', 'CLASS_II', 'CLASS_III', 'CLASS_IV', 'CLASS_V'];
const PLANS = ['TRIAL', 'STANDARD', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM'];

export function OrganisationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const [credentials, setCredentials] = useState(null);
  const [createAdminOpen, setCreateAdminOpen] = useState(false);
  const [adminForm, setAdminForm] = useState({ name: '', email: '' });
  const [adminFormError, setAdminFormError] = useState('');
  const [resetTargetUser, setResetTargetUser] = useState(null);
  const [mfaTargetUser, setMfaTargetUser] = useState(null);
  const [disableFeatureTarget, setDisableFeatureTarget] = useState(null);
  const [statusTargetUser, setStatusTargetUser] = useState(null);

  const { data: org, isLoading } = useQuery({
    queryKey: ['organization', id],
    queryFn: () => platformApi.organization(id),
  });

  const { data: users } = useQuery({
    queryKey: ['organization-users', id],
    queryFn: () => usersApi.list(id),
    enabled: !!id,
  });

  const { data: featuresData, refetch: refetchFeatures } = useQuery({
    queryKey: ['organization-features', id],
    queryFn: () => platformApi.organizationFeatures(id),
    enabled: !!id,
  });

  const { data: domain, refetch: refetchDomain } = useQuery({
    queryKey: ['organization-domain', id],
    queryFn: () => platformApi.organizationDomain(id),
    enabled: !!id,
  });

  useEffect(() => {
    if (org) {
      setForm({
        name: org.name || '',
        shortName: org.shortName || '',
        bankClass: org.bankClass || '',
        regulator: org.regulator || '',
        address: org.address || '',
        contactEmail: org.contactEmail || '',
        contactPhone: org.contactPhone || '',
        website: org.website || '',
        customDomain: org.customDomain || '',
        licensePlan: org.licensePlan || '',
        licenseStartsAt: org.licenseStartsAt?.slice(0, 10) || '',
        licenseExpiresAt: org.licenseExpiresAt?.slice(0, 10) || '',
        maxUsers: org.maxUsers ?? '',
        maxEmployees: org.maxEmployees ?? '',
        licenseNotes: org.licenseNotes || '',
      });
    }
  }, [org]);

  const updateMutation = useMutation({
    mutationFn: (payload) => platformApi.updateOrganization(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', id] });
      queryClient.invalidateQueries({ queryKey: ['organization-domain', id] });
      toast.add('Organisation updated.', 'success');
      setConfirmOpen(false);
    },
    onError: (err) => {
      setActionError(err.message || 'Update failed.');
      toast.add(err.message || 'Update failed.', 'error');
    },
  });

  const verifyDomain = useMutation({
    mutationFn: () => platformApi.verifyOrganizationDomain(id),
    onSuccess: (res) => {
      refetchDomain();
      queryClient.invalidateQueries({ queryKey: ['organization', id] });
      if (res?.ok) toast.add(res.message || 'Domain connected.', 'success');
      else toast.add(res?.message || 'Domain not connected yet.', 'error');
    },
    onError: (err) => toast.add(err.message || 'Verification failed.', 'error'),
  });

  const toggleFeatureMutation = useMutation({
    mutationFn: ({ featureCode, enabled }) => platformApi.updateOrganizationFeature(id, featureCode, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-features', id] });
      toast.add('Feature updated.', 'success');
    },
    onError: (err) => toast.add(err.message || 'Feature update failed.', 'error'),
  });

  const createAdminMutation = useMutation({
    mutationFn: (payload) => platformApi.createOrgAdmin(id, payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['organization-users', id] });
      toast.add('Organisation admin created.', 'success');
      setCreateAdminOpen(false);
      setAdminForm({ name: '', email: '' });
      setCredentials({
        mode: 'create',
        user: res.data,
        tempPassword: res.tempPassword,
        emailStatus: res.email,
        loginUrl: res.loginUrl,
      });
    },
    onError: (err) => setAdminFormError(err.message || 'Could not create admin.'),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (targetUser) => platformApi.resetOrgUserPassword(id, targetUser.id),
    onSuccess: (res, targetUser) => {
      queryClient.invalidateQueries({ queryKey: ['organization-users', id] });
      setResetTargetUser(null);
      setCredentials({
        mode: 'reset',
        user: res.data || targetUser,
        tempPassword: res.tempPassword,
        emailStatus: res.email,
        loginUrl: res.loginUrl,
      });
      toast.add('Temporary password issued.', 'success');
    },
    onError: (err) => toast.add(err.message || 'Password reset failed.', 'error'),
  });

  const resetMfaMutation = useMutation({
    mutationFn: (targetUser) => platformApi.resetOrgUserMfa(id, targetUser.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-users', id] });
      setMfaTargetUser(null);
      toast.add('MFA cleared for this user.', 'success');
    },
    onError: (err) => toast.add(err.message || 'MFA reset failed.', 'error'),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ userId, status }) => platformApi.updateOrgUserStatus(id, userId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-users', id] });
      toast.add('User status updated.', 'success');
    },
    onError: (err) => toast.add(err.message || 'Status update failed.', 'error'),
  });

  if (isLoading || !form) return <div className="page"><p>Loading…</p></div>;

  const license = org?.license || {};
  const usage = org?.usage || {};
  const signInUrl = org.loginUrl || `${window.location.origin}/o/${org.code}`;
  const admins = (users?.rows || []).filter((u) => u.role === 'ORG_ADMIN');
  const features = featuresData?.rows || [];
  const unresolvedAdminLinks = admins.filter(account => !account.employeeId);
  const domainSaved = !!org.customDomain && form.customDomain === org.customDomain;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleSuspend = () =>
    updateMutation.mutate({ status: org.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });

  return (
    <div className="page">
      {!!unresolvedAdminLinks.length && <p className="auth-notice">Bootstrap administrator employee link requires resolution before the bank activates permission mode. Manage bank role assignments from the bank’s Roles &amp; Permissions page.</p>}
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1>{org.name}</h1>
            <p className="mono">{org.code} · {org.bankClassLabel || org.bankClass?.replace(/_/g, ' ')}</p>
          </div>
          <div className="page-header-actions">
            <Badge variant={org.status === 'ACTIVE' ? 'success' : 'danger'}>{org.status}</Badge>
            <Button
              variant={org.status === 'ACTIVE' ? 'danger' : 'primary'}
              loading={updateMutation.isPending}
              onClick={() => {
                setActionError('');
                setConfirmOpen(true);
              }}
            >
              {org.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
            </Button>
          </div>
        </div>
      </header>

      <div className="stat-grid">
        <StatLedger label="Active Users" value={usage.users || 0} subValue={`Limit: ${license.maxUsers ?? '∞'}`} />
        <StatLedger label="Active Employees" value={usage.employees || 0} subValue={`Limit: ${license.maxEmployees ?? '∞'}`} />
        <StatLedger label="Licence Plan" value={license.plan || '—'} />
        <StatLedger label="Valid Until" value={fmt.date(license.expiresAt)} redInk={license.daysLeft != null && license.daysLeft < 0} subValue={license.daysLeft != null ? `${license.daysLeft} days left` : undefined} />
      </div>

      <Card title="Sign-in Address">
        <div className="signin-address">
          <code className="mono">{signInUrl}</code>
          <Button variant="secondary" size="sm" onClick={() => { navigator.clipboard.writeText(signInUrl); toast.add('Copied.', 'success'); }}>Copy</Button>
        </div>
      </Card>

      <Card title="Custom Domain">
        <p className="form-note">
          Give the bank its own web address by pointing a DNS CNAME from their subdomain to{' '}
          <span className="mono">{org.cnameTarget || 'this application'}</span>. Once it resolves,
          the console is served there instead of the shared sign-in address above.
        </p>
        <div className="form-grid">
          <Input id="odomain" label="Custom Domain" value={form.customDomain} onChange={(e) => set({ customDomain: e.target.value })} placeholder="hrms.yourbank.in" mono />
        </div>
        {domain?.domain && (
          <dl className="domain-record-grid">
            <div><dt>Type</dt><dd className="mono">{domain.recordType}</dd></div>
            <div><dt>Name</dt><dd className="mono">{domain.host}</dd></div>
            <div><dt>Value</dt><dd className="mono">{domain.value}</dd></div>
          </dl>
        )}
        <div className="card-actions">
          <Button variant="secondary" loading={updateMutation.isPending} onClick={() => updateMutation.mutate({ customDomain: form.customDomain })}>Save Domain</Button>
          <Button loading={verifyDomain.isPending} disabled={!domainSaved} onClick={() => verifyDomain.mutate()}>Verify Connection</Button>
          {org.customDomain && (
            org.customDomainVerifiedAt
              ? <Badge variant="success">Verified {fmt.date(org.customDomainVerifiedAt)}</Badge>
              : <Badge variant="default">Not verified yet</Badge>
          )}
        </div>
      </Card>

      <Card title="Licence &amp; Access">
        <div className="form-grid">
          <div className="field">
            <label className="field-label" htmlFor="plan">Plan</label>
            <select id="plan" className="input" value={form.licensePlan} onChange={(e) => set({ licensePlan: e.target.value })}>
              <option value="">No plan</option>
              {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="bclass">Bank Class</label>
            <select id="bclass" className="input" value={form.bankClass} onChange={(e) => set({ bankClass: e.target.value })}>
              {BANK_CLASSES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <Input id="vfrom" label="Valid From" type="date" value={form.licenseStartsAt} onChange={(e) => set({ licenseStartsAt: e.target.value })} />
          <Input id="vuntil" label="Valid Until" type="date" value={form.licenseExpiresAt} onChange={(e) => set({ licenseExpiresAt: e.target.value })} />
          <Input id="mu" label="Max Active Users" type="number" value={form.maxUsers} onChange={(e) => set({ maxUsers: e.target.value })} mono />
          <Input id="me" label="Max Active Employees" type="number" value={form.maxEmployees} onChange={(e) => set({ maxEmployees: e.target.value })} mono />
        </div>
        <div className="card-actions">
          <Button loading={updateMutation.isPending} onClick={() => updateMutation.mutate(form)}>Save Licence</Button>
        </div>
      </Card>

      <Card title="Bank Profile">
        <div className="form-grid">
          <Input id="oname" label="Registered Name" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          <Input id="oshort" label="Short Name" value={form.shortName} onChange={(e) => set({ shortName: e.target.value })} />
          <Input id="oreg" label="Regulator" value={form.regulator} onChange={(e) => set({ regulator: e.target.value })} />
          <Input id="oemail" label="Contact Email" type="email" value={form.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />
          <Input id="ophone" label="Contact Phone" value={form.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} />
          <Input id="oweb" label="Website" value={form.website} onChange={(e) => set({ website: e.target.value })} />
        </div>
        <div className="card-actions">
          <Button loading={updateMutation.isPending} onClick={() => updateMutation.mutate(form)}>Save Profile</Button>
        </div>
      </Card>

      {/* ── Feature Management Card ── */}
      <Card title="Module &amp; Feature Access" headerActions={<Badge variant="info">{features.filter(f => f.enabled).length} / {features.length} Enabled</Badge>}>
        <p className="form-note" style={{ marginBottom: 'var(--space-4)' }}>
          Enable or disable application modules for this bank. Changes take effect across web and mobile sessions immediately.
        </p>
        <div className="feature-toggle-grid">
          {features.map((feat) => (
            <div
              key={feat.code}
              className={`feature-toggle-card ${feat.enabled ? 'enabled' : 'disabled'}`}
            >
              <div className="feature-toggle-card-header">
                <h4 className="feature-toggle-title">{feat.name}</h4>
                <Badge variant={feat.enabled ? 'success' : 'default'} size="sm">
                  {feat.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              <p className="feature-toggle-desc">
                {feat.description}
              </p>
              <div className="feature-toggle-card-footer">
                <Button
                  size="sm"
                  variant={feat.enabled ? 'danger' : 'primary'}
                  className="feature-toggle-btn"
                  loading={toggleFeatureMutation.isPending && toggleFeatureMutation.variables?.featureCode === feat.code}
                  disabled={toggleFeatureMutation.isPending}
                  onClick={() => {
                    if (feat.enabled) {
                      setDisableFeatureTarget(feat);
                    } else {
                      toggleFeatureMutation.mutate({ featureCode: feat.code, enabled: true });
                    }
                  }}
                >
                  {feat.enabled ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Organisation Admins Card with Actions ── */}
      <Card
        title="Organisation Admins"
        headerActions={
          <Button size="sm" onClick={() => { setAdminFormError(''); setCreateAdminOpen(true); }}>
            Add Org Admin
          </Button>
        }
        noPadding
      >
        <Table
          columns={[
            { field: 'name', label: 'Name' },
            { field: 'email', label: 'Email', mono: true },
            { field: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'ACTIVE' ? 'success' : 'default'}>{r.status}</Badge> },
            { field: 'lastLoginAt', label: 'Last Sign-in', render: (r) => r.lastLoginAt ? fmt.dateTime(r.lastLoginAt) : 'Never' },
            {
              field: 'actions',
              label: 'Actions',
              render: (r) => (
                <div style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={resetPasswordMutation.isPending && resetTargetUser?.id === r.id}
                    onClick={() => { setResetTargetUser(r); resetPasswordMutation.mutate(r); }}
                  >
                    Reset Password
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={resetMfaMutation.isPending && mfaTargetUser?.id === r.id}
                    onClick={() => { setMfaTargetUser(r); resetMfaMutation.mutate(r); }}
                  >
                    Reset MFA
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (r.status === 'ACTIVE') {
                        setStatusTargetUser(r);
                      } else {
                        toggleStatusMutation.mutate({ userId: r.id, status: 'ACTIVE' });
                      }
                    }}
                  >
                    {r.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              ),
            },
          ]}
          data={admins}
          keyField="id"
          emptyMessage="No Organisation Admins yet."
        />
      </Card>

      {/* Create Org Admin Modal */}
      <Modal
        open={createAdminOpen}
        onClose={() => setCreateAdminOpen(false)}
        title={`Add Admin for ${org.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateAdminOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!adminForm.name.trim() || !adminForm.email.trim()) {
                  setAdminFormError('Name and email are required.');
                  return;
                }
                createAdminMutation.mutate(adminForm);
              }}
              loading={createAdminMutation.isPending}
            >
              Create Admin
            </Button>
          </>
        }
      >
        <div>
          {adminFormError && <div className="auth-error" role="alert">{adminFormError}</div>}
          <Input
            id="oa-name"
            label="Full Name"
            value={adminForm.name}
            onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
            required
          />
          <Input
            id="oa-email"
            label="Email Address"
            type="email"
            value={adminForm.email}
            onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
            required
          />
        </div>
      </Modal>

      {/* Ephemeral Temporary Password Modal */}
      <TempPasswordModal credentials={credentials} onClose={() => setCredentials(null)} />

      {/* Feature Disable Double Verification Modal */}
      <ConfirmationModal
        open={disableFeatureTarget != null}
        onClose={() => setDisableFeatureTarget(null)}
        onConfirm={() => {
          const target = disableFeatureTarget;
          setDisableFeatureTarget(null);
          toggleFeatureMutation.mutate({ featureCode: target.code, enabled: false });
        }}
        title="Disable Application Feature"
        itemName={disableFeatureTarget?.name}
        details={{
          'Feature Code': disableFeatureTarget?.code,
          'Bank / Organisation': org.name,
          'Description': disableFeatureTarget?.description,
        }}
        warningMessage="Disabling this feature takes effect immediately across all active tenant sessions. Navigation links will be hidden from the sidebar and matching API endpoints will be blocked."
        confirmLabel="Confirm Disable"
        confirmVariant="danger"
        requireVerification={true}
        verificationText="DISABLE"
        verificationLabel={`Type "DISABLE" to confirm disabling ${disableFeatureTarget?.name || 'this feature'}:`}
        loading={toggleFeatureMutation.isPending}
      />

      {/* Org Admin Deactivation Double Verification Modal */}
      <ConfirmationModal
        open={statusTargetUser != null}
        onClose={() => setStatusTargetUser(null)}
        onConfirm={() => {
          const target = statusTargetUser;
          setStatusTargetUser(null);
          toggleStatusMutation.mutate({ userId: target.id, status: 'INACTIVE' });
        }}
        title="Deactivate Organisation Admin"
        itemName={statusTargetUser?.name}
        details={{
          'Email': statusTargetUser?.email,
          'Role': statusTargetUser?.role?.replace(/_/g, ' '),
          'Bank / Organisation': org.name,
        }}
        warningMessage="Deactivating this organisation administrator immediately terminates active login sessions and prevents future access until reactivated."
        confirmLabel="Confirm Deactivation"
        confirmVariant="danger"
        requireVerification={true}
        verificationText="DEACTIVATE"
        verificationLabel={`Type "DEACTIVATE" to confirm deactivating ${statusTargetUser?.name || 'this admin'}:`}
        loading={toggleStatusMutation.isPending}
      />

      {/* Organisation Suspension Double Verification Modal */}
      <ConfirmationModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => toggleSuspend()}
        title={org.status === 'ACTIVE' ? 'Suspend Organisation' : 'Reactivate Organisation'}
        itemName={org.name}
        details={{
          'Org Code': org.code,
          'Bank Class': org.bankClassLabel || org.bankClass?.replace(/_/g, ' '),
          'Active Users': usage.users || 0,
          'Active Employees': usage.employees || 0,
          'Licence Plan': license.plan || '—',
        }}
        warningMessage={
          org.status === 'ACTIVE'
            ? 'Suspending this organisation will immediately block all staff, HR administrators, and users from signing into this tenant.'
            : 'Reactivating this organisation will restore access for all staff and administrators immediately.'
        }
        confirmLabel={org.status === 'ACTIVE' ? 'Confirm Suspension' : 'Confirm Reactivation'}
        confirmVariant={org.status === 'ACTIVE' ? 'danger' : 'primary'}
        requireVerification={org.status === 'ACTIVE'}
        verificationText={org.code || 'SUSPEND'}
        verificationLabel={org.status === 'ACTIVE' ? `Type organisation code "${org.code}" to confirm suspension:` : ''}
        loading={updateMutation.isPending}
        error={actionError}
      />
    </div>
  );
}
