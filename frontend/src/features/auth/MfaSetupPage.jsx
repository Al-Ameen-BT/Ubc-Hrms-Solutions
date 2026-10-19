import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';

export function MfaSetupPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const { data: setup, isLoading } = useQuery({
    queryKey: ['mfa-setup'],
    queryFn: authApi.mfaSetup,
    enabled: !user?.mfaEnabled,
  });

  const handleConfirm = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.mfaConfirm(setup.secret, code);
      setDone(true);
      toast.add('Two-factor authentication enabled.', 'success');
    } catch (err) {
      setError(err.message || 'Invalid code. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (user?.mfaEnabled) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>Two-Factor Authentication</h1>
        </header>
        <Card>
          <div className="mfa-section">
            <p>Two-factor authentication is <Badge variant="success">Enabled</Badge></p>
            <Button variant="secondary" onClick={() => navigate('/account')}>Back to My Account</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Set Up Two-Factor Authentication</h1>
        <p>Scan the QR code with any authenticator app, then enter the 6-digit code.</p>
      </header>

      <Card title="Scan QR Code">
        {isLoading ? (
          <p>Generating your secret…</p>
        ) : done ? (
          <div className="mfa-section">
            <p>Two-factor authentication is now <Badge variant="success">Enabled</Badge></p>
            <Button onClick={() => navigate('/account')}>Done</Button>
          </div>
        ) : (
          <div className="mfa-setup-grid">
            <div className="qr-placeholder" aria-label="QR code">
              {setup?.qrCodeDataUrl ? (
                <img src={setup.qrCodeDataUrl} alt="Scan this QR code" />
              ) : (
                <div className="qr-frame">
                  <span className="mono">{setup?.otpauthUrl ? 'QR CODE' : '••••••'}</span>
                </div>
              )}
            </div>
            <div className="mfa-manual">
              <p className="mfa-hint">Can't scan? Enter this key manually:</p>
              <code className="manual-key mono">{setup?.secret || '—'}</code>
              <form onSubmit={handleConfirm} className="auth-form" noValidate>
                {error && <div className="auth-error" role="alert">{error}</div>}
                <Input
                  id="mfa-code"
                  label="Verification Code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  mono
                  required
                />
                <Button type="submit" loading={loading} disabled={code.length !== 6}>
                  Confirm & Enable
                </Button>
              </form>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
