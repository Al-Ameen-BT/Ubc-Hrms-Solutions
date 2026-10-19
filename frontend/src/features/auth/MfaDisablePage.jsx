import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export function MfaDisablePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.mfaDisable(password);
      toast.add('Two-factor authentication disabled.', 'success');
      navigate('/account');
    } catch (err) {
      setError(err.message || 'Could not disable 2FA.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Disable Two-Factor Authentication</h1>
        <p>Confirm your password to turn off 2FA. This reduces your account's security.</p>
      </header>

      <Card>
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <Input
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <div className="card-actions">
            <Button variant="secondary" onClick={() => navigate('/account')}>Cancel</Button>
            <Button type="submit" variant="danger" loading={loading} disabled={!password}>
              Disable 2FA
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
