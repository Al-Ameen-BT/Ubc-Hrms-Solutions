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

  const { data: org, isLoading } = useQuery({
    queryKey: ['organization', id],
    queryFn: () => platformApi.organization(id),
  });

  const { data: users } = useQuery({
    queryKey: ['organization-users', id],
    queryFn: () => usersApi.list(id),
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

  if (isLoading || !form) return <div className="page"><p>Loading…</p></div>;

  const license = org?.license || {};
  const usage = org?.usage || {};
  const signInUrl = org.loginUrl || `${window.location.origin}/o/${org.code}`;
  const admins = (users?.rows || []).filter((u) => u.role === 'ORG_ADMIN');
  const domainSaved = !!org.customDomain && form.customDomain === org.customDomain;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleSuspend = () =>
    updateMutation.mutate({ status: org.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });

  return (
    <div className="page">
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

      <Card title="Organisation Admins" noPadding>
        <Table
          columns={[
            { field: 'name', label: 'Name' },
            { field: 'email', label: 'Email', mono: true },
            { field: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'ACTIVE' ? 'success' : 'default'}>{r.status}</Badge> },
          ]}
          data={admins}
          keyField="id"
          emptyMessage="No Organisation Admins yet."
        />
      </Card>

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
        loading={updateMutation.isPending}
        error={actionError}
      />
    </div>
  );
}
