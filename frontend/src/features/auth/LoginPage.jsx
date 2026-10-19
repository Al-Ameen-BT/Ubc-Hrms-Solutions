import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export function LoginPage() {
  const { login, branding, orgCode, flash, clearFlash } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [errorLink, setErrorLink] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (clearFlash) clearFlash();
    setError('');
    setErrorLink(null);
    if (!email.trim() || !password) {
      setError('Enter your email address and password.');
      return;
    }
    setLoading(true);
    try {
      const result = await login(email.trim(), password, orgCode);
      if (result.mfaRequired) {
        sessionStorage.setItem('mfaChallengeToken', result.challengeToken);
        navigate('/mfa-verify');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message || 'Sign in failed.');
      /* A bank user who lands on the platform sign-in gets ORG_LOGIN_REQUIRED
         with the address of the bank's own sign-in page. */
      if (err?.body?.loginPath) setErrorLink(err.body.loginPath);
    } finally {
      setLoading(false);
    }
  };

  // Platform branding is flat; the org surface nests the platform brand and
  // names the bank simply `name`.
  const platformName =
    branding?.platformName || branding?.platform?.platformName || 'UCB HRMS & Payroll';
  const orgName = branding?.shortName || branding?.name || branding?.organizationName;
  const logoUrl = branding?.logoUrl || branding?.platform?.logoUrl;
  const orgMissing = orgCode && branding?.missing;
  const signInMessage = branding?.loginMessage || branding?.platform?.loginMessage;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          {logoUrl && <img src={logoUrl} alt="" className="auth-logo" />}
          <h1 className="auth-title">
            {orgCode ? orgName || platformName : platformName}
          </h1>
          <p className="auth-subtitle">
            {orgCode ? 'Sign in to your bank\'s console' : 'Platform Administration'}
          </p>
        </div>

        {signInMessage && (
          <div className="auth-notice" role="status">{signInMessage}</div>
        )}

        {orgMissing && (
          <div className="auth-error" role="alert">
            Unknown organisation “{orgCode}”. Check the address, or ask your administrator.
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {flash?.message && !error && (
            <div className={`auth-notice ${flash.kind === 'error' ? 'auth-notice-error' : ''}`} role="status">
              {flash.message}
            </div>
          )}

          {error && (
            <div className="auth-error" role="alert">
              {error}
              {errorLink && (
                <> <a href={`#${errorLink}`}>Go to the bank sign-in page</a></>
              )}
            </div>
          )}

          <Input
            id="email"
            label="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            autoComplete="username"
            placeholder="you@bank.in"
          />

          <Input
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="Enter your password"
          />

          <Button type="submit" loading={loading} className="auth-submit">
            Sign in
          </Button>

          <div className="auth-links">
            <a href="#/forgot-password">Forgot password?</a>
          </div>
        </form>
      </div>

      <footer className="auth-footer">
        <p>Powered by Banihal</p>
      </footer>
    </div>
  );
}
