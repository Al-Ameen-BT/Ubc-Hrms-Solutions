import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { platformApi } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

/* GET /admin/settings -> { settings, logo, favicon, smtp, limits } */
export function PlatformSettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [general, setGeneral] = useState(null);
  const [smtp, setSmtp] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: platformApi.settings,
  });

  useEffect(() => {
    if (data?.settings) {
      const s = data.settings;
      setGeneral({
        platformName: s.platformName || '',
        companyName: s.companyName || '',
        supportEmail: s.supportEmail || '',
        supportPhone: s.supportPhone || '',
        appBaseUrl: s.appBaseUrl || '',
        loginMessage: s.loginMessage || '',
        auditRetentionDays: s.auditRetentionDays ?? 365,
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

  const saveGeneral = useMutation({
    mutationFn: (payload) => platformApi.updateSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
      toast.add('Settings saved.', 'success');
    },
    onError: (err) => toast.add(err.message || 'Save failed.', 'error'),
  });

  const saveSmtp = useMutation({
    mutationFn: (payload) => platformApi.updateSmtp(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
      toast.add('SMTP saved.', 'success');
    },
    onError: (err) => toast.add(err.message || 'Save failed.', 'error'),
  });

  const testSmtp = useMutation({
    mutationFn: () => platformApi.testSmtp({}),
    onSuccess: () => toast.add('Test email sent.', 'success'),
    onError: (err) => toast.add(err.message || 'SMTP test failed.', 'error'),
  });

  if (isLoading || !general || !smtp) {
    return <div className="page"><p>Loading settings…</p></div>;
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Platform Settings</h1>
        <p>General configuration, branding, and email</p>
      </header>

      <Card title="General">
        <div className="form-grid">
          <Input id="pname" label="Platform Name" value={general.platformName} onChange={(e) => setGeneral({ ...general, platformName: e.target.value })} />
          <Input id="cname" label="Company Name (Powered by)" value={general.companyName} onChange={(e) => setGeneral({ ...general, companyName: e.target.value })} />
          <Input id="sem" label="Support Email" type="email" value={general.supportEmail} onChange={(e) => setGeneral({ ...general, supportEmail: e.target.value })} />
          <Input id="sph" label="Support Phone" value={general.supportPhone} onChange={(e) => setGeneral({ ...general, supportPhone: e.target.value })} />
          <Input id="url" label="Application URL" value={general.appBaseUrl} onChange={(e) => setGeneral({ ...general, appBaseUrl: e.target.value })} />
          <Input id="msg" label="Sign-in Page Message" value={general.loginMessage} onChange={(e) => setGeneral({ ...general, loginMessage: e.target.value })} />
          <Input id="ret" label="Audit Retention (days)" type="number" value={general.auditRetentionDays} onChange={(e) => setGeneral({ ...general, auditRetentionDays: e.target.value })} mono />
        </div>
        <div className="card-actions">
          <Button loading={saveGeneral.isPending} onClick={() => saveGeneral.mutate(general)}>Save General</Button>
        </div>
      </Card>

      <Card title="Branding">
        <div className="form-grid">
          <div className="field">
            <label className="field-label">Main Logo</label>
            <div className="upload-placeholder">{data?.logo ? `Uploaded (v${data.logo.version ?? '—'})` : 'PNG, JPEG, or WebP · upload from the backend'}</div>
          </div>
          <div className="field">
            <label className="field-label">Favicon</label>
            <div className="upload-placeholder">{data?.favicon ? 'Uploaded' : 'PNG or ICO · browser tab icon'}</div>
          </div>
        </div>
      </Card>

      <Card title="Email (SMTP)">
        <div className="form-grid">
          <div className="field">
            <label className="field-label" htmlFor="s-enabled">Enabled</label>
            <select id="s-enabled" className="input" value={smtp.enabled ? 'yes' : 'no'} onChange={(e) => setSmtp({ ...smtp, enabled: e.target.value === 'yes' })}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
          <Input id="shost" label="SMTP Host" value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} />
          <Input id="sport" label="Port" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: e.target.value })} mono />
          <div className="field">
            <label className="field-label" htmlFor="ssec">Security</label>
            <select id="ssec" className="input" value={smtp.security} onChange={(e) => setSmtp({ ...smtp, security: e.target.value })}>
              <option value="STARTTLS">STARTTLS</option>
              <option value="SSL">SSL</option>
              <option value="NONE">None</option>
            </select>
          </div>
          <Input id="suser" label="Username" value={smtp.username} onChange={(e) => setSmtp({ ...smtp, username: e.target.value })} />
          <Input id="spass" label="Password" type="password" value={smtp.password} onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} placeholder={smtp.hasPassword ? '•••••••• (unchanged)' : ''} />
          <Input id="sfrom" label="From Name" value={smtp.fromName} onChange={(e) => setSmtp({ ...smtp, fromName: e.target.value })} />
          <Input id="sfromemail" label="From Email" type="email" value={smtp.fromEmail} onChange={(e) => setSmtp({ ...smtp, fromEmail: e.target.value })} />
          <Input id="sreply" label="Reply-To" type="email" value={smtp.replyTo} onChange={(e) => setSmtp({ ...smtp, replyTo: e.target.value })} />
        </div>
        <div className="card-actions">
          <Button variant="secondary" loading={testSmtp.isPending} onClick={() => testSmtp.mutate()}>Test SMTP</Button>
          <Button loading={saveSmtp.isPending} onClick={() => saveSmtp.mutate(smtp)}>Save SMTP</Button>
        </div>
      </Card>
    </div>
  );
}
