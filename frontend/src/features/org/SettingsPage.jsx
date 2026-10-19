import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orgApi, fmt } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';

/* GET /org/settings -> { organization, loginUrl, license, usage, logo, smtp, platformSmtpAvailable } */
export function SettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [smtp, setSmtp] = useState(null);
  const [orgForm, setOrgForm] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['org-settings'],
    queryFn: orgApi.settings,
  });

  useEffect(() => {
    if (data?.organization) {
      const o = data.organization;
      setOrgForm({
        shortName: o.shortName || '',
        contactEmail: o.contactEmail || '',
        contactPhone: o.contactPhone || '',
        website: o.website || '',
        address: o.address || '',
      });
    }
    if (data?.smtp) {
      const m = data.smtp;
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
  }, [data]);

  const saveSmtp = useMutation({
    mutationFn: (payload) => orgApi.updateSmtp(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-settings'] });
      toast.add('SMTP saved.', 'success');
    },
    onError: (err) => toast.add(err.message || 'Save failed.', 'error'),
  });

  const saveOrg = useMutation({
    mutationFn: (payload) => orgApi.updateSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-settings'] });
      toast.add('Organisation details saved.', 'success');
    },
    onError: (err) => toast.add(err.message || 'Save failed.', 'error'),
  });

  const testSmtp = useMutation({
    mutationFn: () => orgApi.testSmtp({}),
    onSuccess: () => toast.add('Test email sent.', 'success'),
    onError: (err) => toast.add(err.message || 'SMTP test failed.', 'error'),
  });

  const org = data?.organization;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <p>Organisation configuration and email</p>
      </header>

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

      <Card title="Custom Domain">
        <p className="form-note">You sign in at:</p>
        <div className="signin-address">
          <code className="mono">{data?.loginUrl}</code>
          <Button variant="secondary" size="sm" onClick={() => { navigator.clipboard.writeText(data?.loginUrl || ''); toast.add('Copied.', 'success'); }}>Copy</Button>
        </div>
        {data?.customDomain ? (
          <>
            <p className="form-note">To serve the console on your bank's own address, create this DNS record with your domain provider:</p>
            <dl className="domain-record-grid">
              <div><dt>Type</dt><dd className="mono">CNAME</dd></div>
              <div><dt>Name</dt><dd className="mono">{data.customDomain}</dd></div>
              <div><dt>Value</dt><dd className="mono">{data.cnameTarget}</dd></div>
            </dl>
            {data.customDomainVerifiedAt
              ? <div className="domain-status"><Badge variant="success">Verified {fmt.date(data.customDomainVerifiedAt)}</Badge></div>
              : <div className="domain-status"><Badge variant="default">Awaiting DNS verification</Badge></div>}
          </>
        ) : (
          <p className="form-note">Ask the platform to connect a custom domain to give your bank its own web address instead of the shared link above.</p>
        )}
      </Card>

      <Card title="Licence &amp; Usage">
        <div className="stat-grid">
          <div className="stat-ledger"><div className="stat-ledger-label">Plan</div><div className="stat-ledger-value">{data?.license?.plan || '—'}</div></div>
          <div className="stat-ledger"><div className="stat-ledger-label">Users</div><div className="stat-ledger-value mono">{data?.usage?.users || 0} / {data?.license?.maxUsers ?? '∞'}</div></div>
          <div className="stat-ledger"><div className="stat-ledger-label">Employees</div><div className="stat-ledger-value mono">{data?.usage?.employees || 0} / {data?.license?.maxEmployees ?? '∞'}</div></div>
        </div>
      </Card>

      <Card title="Email (SMTP)">
        {!smtp ? (
          <p>Loading…</p>
        ) : (
          <>
            {!data?.platformSmtpAvailable && (
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
    </div>
  );
}
