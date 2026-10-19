import React, { useState } from 'react';
import { authApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export function ForgotPasswordPage() {
  const { orgCode } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Enter your email address.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      /* orgCode scopes the reset to this bank. Without it the backend only
         serves Super Admins, so a bank user's request would silently send
         nothing. */
      await authApi.forgotPassword(email.trim(), orgCode);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Reset Password</h1>
          <p className="auth-subtitle">Enter your email to receive a reset link.</p>
        </div>

        {sent ? (
          <div className="auth-success" role="status">
            <p>If an account exists for <strong>{email}</strong>, a reset link has been sent. It is valid for 30 minutes.</p>
            <p className="form-note">If no email arrives, ask your administrator to reset your password and give you a temporary one.</p>
            <a href="#/login" className="auth-back-link">Back to sign in</a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            {error && <div className="auth-error" role="alert">{error}</div>}

            <Input
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@bank.in"
            />

            <Button type="submit" loading={loading} className="auth-submit">
              Send Reset Link
            </Button>

            <div className="auth-links">
              <a href="#/login">Back to sign in</a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
