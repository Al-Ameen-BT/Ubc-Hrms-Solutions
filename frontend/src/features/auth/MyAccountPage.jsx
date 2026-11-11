import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { employeeApi } from '../../api/employee';
import { fmt } from '../../api/client';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

export function MyAccountPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className="page">
      <header className="page-header">
        <h1>My Account</h1>
        <p>Profile, security, and two-factor authentication</p>
      </header>

      <div className="tabs">
        <button className={`tab ${activeTab === 'profile' ? 'tab-active' : ''}`} onClick={() => setActiveTab('profile')}>Profile</button>
        <button className={`tab ${activeTab === 'mfa' ? 'tab-active' : ''}`} onClick={() => setActiveTab('mfa')}>Two-Factor Auth</button>
        <button className={`tab ${activeTab === 'security' ? 'tab-active' : ''}`} onClick={() => setActiveTab('security')}>Security</button>
        {user?.role === 'EMPLOYEE' && <button className={`tab ${activeTab === 'devices' ? 'tab-active' : ''}`} onClick={() => setActiveTab('devices')}>Linked devices</button>}
      </div>

      {activeTab === 'profile' && (
        <Card title="Profile Details">
          <dl className="definition-list">
            <dt>Name</dt><dd>{user?.name}</dd>
            <dt>Email</dt><dd className="mono">{user?.email}</dd>
            <dt>Role</dt><dd><Badge variant="info">{user?.role?.replace(/_/g, ' ')}</Badge></dd>
            <dt>Status</dt><dd><Badge variant={user?.status === 'ACTIVE' ? 'success' : 'default'}>{user?.status}</Badge></dd>
          </dl>
        </Card>
      )}

      {activeTab === 'mfa' && (
        <Card title="Two-Factor Authentication">
          <div className="mfa-section">
            <p>Status: {user?.mfaEnabled ? <Badge variant="success">Enabled</Badge> : <Badge variant="default">Disabled</Badge>}</p>
            <p className="form-note">Add a second step to your sign-in using any authenticator app.</p>
            {!user?.mfaEnabled ? (
              <Button onClick={() => navigate('/account/mfa/setup')}>Set Up 2FA</Button>
            ) : (
              <Button variant="danger" onClick={() => navigate('/account/mfa/disable')}>Disable 2FA</Button>
            )}
          </div>
        </Card>
      )}

      {activeTab === 'security' && (
        <Card title="Security">
          <dl className="definition-list">
            <dt>Last Sign-in</dt><dd className="mono">{user?.lastLoginAt || '—'}</dd>
            <dt>Password</dt><dd><Button variant="secondary" size="sm" onClick={() => navigate('/change-password')}>Change Password</Button></dd>
          </dl>
        </Card>
      )}

      {activeTab === 'devices' && user?.role === 'EMPLOYEE' && <LinkedDevices />}
    </div>
  );
}

function LinkedDevices() {
  const { data, error: listError, refetch } = useQuery({ queryKey: ['me', 'devices'], queryFn: employeeApi.devices });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [link, setLink] = useState(null);
  const [status, setStatus] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activeLink = useRef(null);
  activeLink.current = link && ['PENDING', 'CLAIMED'].includes(status?.status || 'PENDING') ? link.id : null;

  useEffect(() => () => { if (activeLink.current) employeeApi.cancelDeviceLink(activeLink.current).catch(() => {}); }, []);
  useEffect(() => {
    if (!link) return undefined;
    let active = true;
    let timer;
    const tick = async () => {
      setNow(Date.now());
      let delay = 2000;
      try {
        const next = await employeeApi.deviceLink(link.id);
        if (active) {
          setError('');
          setStatus(next);
          if (next.status === 'ISSUED') { refetch(); return; }
          if (!['PENDING', 'CLAIMED'].includes(next.status) || Date.parse(next.expiresAt) <= Date.now()) return;
        }
      } catch (err) {
        if (active) setError(err.message);
        if (err?.status === 429) delay = 10000;
      }
      if (active) timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 2000);
    return () => { active = false; clearTimeout(timer); };
  }, [link?.id, refetch]);

  const start = async event => {
    event.preventDefault(); setError(''); setBusy(true);
    try { const next = await employeeApi.startDeviceLink(password); setLink(next); setStatus({ status: 'PENDING' }); setPassword(''); setCode(''); setNow(Date.now()); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const decide = async decision => {
    setError(''); setBusy(true);
    try {
      if (decision === 'approve') await employeeApi.approveDeviceLink(link.id, code);
      else if (decision === 'deny') await employeeApi.denyDeviceLink(link.id);
      else await employeeApi.cancelDeviceLink(link.id);
      setStatus(decision === 'approve' ? await employeeApi.deviceLink(link.id) : { status: 'CANCELLED' });
      if (decision !== 'approve') setLink(null);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const revoke = async id => {
    setError(''); setBusy(true);
    try { await employeeApi.revokeDevice(id); await refetch(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const remaining = link ? Math.max(0, Math.ceil((new Date(status?.expiresAt || link.expiresAt).getTime() - now) / 1000)) : 0;

  return <>
    <Card title="Link your phone">
      <p>Install the employee app, then scan this QR from its opening screen. The QR expires after two minutes. Keep it private.</p>
      {(error || listError) && <p className="auth-error" role="alert">{error || listError.message}</p>}
      {!link && <form onSubmit={start} className="ess-form"><Input id="device-link-password" label="Current password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /><Button type="submit" loading={busy}>Create QR code</Button></form>}
      {link && remaining === 0 && !['ISSUED', 'DENIED', 'CANCELLED'].includes(status?.status) && <><p role="status">This QR has expired. Create a new one to link your phone.</p><Button variant="secondary" onClick={() => setLink(null)}>Create new QR</Button></>}
      {link && remaining > 0 && status?.status === 'PENDING' && <div className="linked-device-qr"><img src={link.qrCodeDataUrl} alt="QR code to link the employee mobile app" width="240" height="240" /><p role="status">Expires in {remaining} seconds. Open the employee app and scan it.</p><Button variant="secondary" disabled={busy} onClick={() => decide('cancel')}>Cancel QR</Button></div>}
      {link && remaining > 0 && status?.status === 'CLAIMED' && <div className="ess-form"><p><strong>{status.deviceName}</strong> ({status.platform}) is requesting access. Enter the six-digit code displayed on that phone. Approve only if you started this link.</p><Input id="device-link-code" label="Code shown on phone" value={code} onChange={value => setCode(value.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} autoComplete="one-time-code" /><div className="row-actions"><Button disabled={busy || !/^\d{6}$/.test(code)} onClick={() => decide('approve')}>Approve this phone</Button><Button variant="secondary" disabled={busy} onClick={() => decide('deny')}>Deny</Button></div></div>}
      {link && status?.status === 'APPROVED' && <p role="status">Approved. Waiting for the phone to finish linking…</p>}
      {link && status?.status === 'ISSUED' && <><p role="status">Phone linked. It now has access to your employee features.</p><Button variant="secondary" onClick={() => setLink(null)}>Done</Button></>}
    </Card>
    <Card title="Your linked devices">
      {data?.rows?.length ? <div className="ess-scroll"><table className="table"><thead><tr><th>Device</th><th>Linked</th><th>Last used</th><th></th></tr></thead><tbody>{data.rows.map(device => <tr key={device.id}><td>{device.name} · {device.platform}</td><td>{fmt.dateTime(device.createdAt)}</td><td>{fmt.dateTime(device.lastUsedAt)}</td><td><Button variant="danger" size="sm" disabled={busy} onClick={() => revoke(device.id)}>Revoke</Button></td></tr>)}</tbody></table></div> : <p>No phones linked yet.</p>}
    </Card>
  </>;
}
