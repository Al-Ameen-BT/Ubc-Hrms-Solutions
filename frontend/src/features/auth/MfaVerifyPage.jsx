import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export function MfaVerifyPage() {
  const { verifyMfa } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const challengeToken = sessionStorage.getItem('mfaChallengeToken');
      await verifyMfa(challengeToken, code);
      sessionStorage.removeItem('mfaChallengeToken');
      navigate('/');
    } catch (err) {
      setError(err.message || 'Invalid code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Two-Factor Verification</h1>
          <p className="auth-subtitle">Enter the 6-digit code from your authenticator app.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}

          <Input
            id="mfa-code"
            label="Code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            maxLength={6}
            pattern="[0-9]*"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            mono
          />

          <Button type="submit" loading={loading} className="auth-submit">
            Verify
          </Button>
        </form>
      </div>
    </div>
  );
}
