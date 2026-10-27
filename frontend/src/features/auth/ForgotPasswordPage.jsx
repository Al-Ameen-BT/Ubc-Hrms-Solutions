import React, { useState } from 'react';
import { authApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/ui/Button';
import { AuthShell } from './AuthShell';

const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;

function AlertIcon() {
  return (
    <svg
      className="login-alert-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </svg>
  );
}

export function ForgotPasswordPage() {
  const { orgCode } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setSent(false);
    setEmail('');
    setFieldError('');
    setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    const trimmed = email.trim();
    setFormError('');
    if (!trimmed) {
      setFieldError('Enter your work email.');
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      setFieldError('Enter a valid work email, like name@bank.in.');
      return;
    }
    setFieldError('');
    setLoading(true);
    try {
      /* orgCode scopes the reset to this bank. Without it the backend only
         serves Super Admins, so a bank user's request would silently send
         nothing. */
      await authApi.forgotPassword(trimmed, orgCode);
      setEmail(trimmed);
      setSent(true);
    } catch (err) {
      if (err?.status === 0) {
        setFormError('We can’t reach the server. Check your connection, then try again.');
      } else {
        setFormError('We couldn’t send the reset email. Please try again in a moment.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle="Password recovery">
      {sent ? (
        <div className="login-success" role="status">
          <span className="login-success-icon"><CheckIcon /></span>
          <h2 className="login-step-title">Check your email</h2>
          <p className="login-step-text">
            If an account exists for <strong>{email}</strong>, we’ve sent a reset link.
            Open it within 30 minutes to choose a new password.
          </p>
          <p className="login-success-hint">
            The link can only be used once. If it doesn’t arrive, check your spam
            folder or ask your HR administrator.
          </p>
          <div className="login-success-actions">
            <a className="login-submit login-submit-link" href="#/login">Back to sign in</a>
            <button type="button" className="login-text-btn" onClick={reset}>
              Use a different email
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="login-step">
            <h2 className="login-step-title">Reset your password</h2>
            <p className="login-step-text">
              Enter your work email. If it matches an account, we’ll send a reset
              link that stays valid for 30 minutes.
            </p>
          </div>

          {formError && (
            <div className="login-alert" role="alert">
              <AlertIcon />
              <div>
                <p className="login-alert-title">Couldn’t send the email</p>
                <p className="login-alert-body">{formError}</p>
              </div>
            </div>
          )}

          <form className="login-form" onSubmit={handleSubmit} aria-busy={loading} noValidate>
            <div className="login-field">
              <div className="login-label-row">
                <label className="login-label" htmlFor="email">Work email</label>
              </div>
              <input
                id="email"
                name="email"
                type="email"
                className={`login-input ${fieldError ? 'is-invalid' : ''}`}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldError) setFieldError('');
                  if (formError) setFormError('');
                }}
                placeholder="name@bank.in"
                autoComplete="username"
                autoCapitalize="none"
                inputMode="email"
                enterKeyHint="send"
                aria-invalid={Boolean(fieldError)}
                aria-describedby={fieldError ? 'email-error' : undefined}
                required
                autoFocus
              />
              {fieldError && (
                <p className="login-field-error" id="email-error">{fieldError}</p>
              )}
            </div>

            <Button type="submit" loading={loading} className="login-submit">
              {loading ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>

          <a className="login-back" href="#/login">
            <BackIcon />
            Back to sign in
          </a>
        </>
      )}
    </AuthShell>
  );
}
