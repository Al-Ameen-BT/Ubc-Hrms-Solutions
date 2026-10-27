import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/ui/Button';
import { AuthShell } from './AuthShell';

const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;

function EyeIcon({ crossed }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
      {crossed && <path d="M4 4l16 16" />}
    </svg>
  );
}

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

/** Map API failures to messages that are useful without exposing account facts. */
function describeLoginError(err) {
  const code = err?.body?.code;
  const status = err?.status;

  if (status === 0) {
    return {
      title: 'We can’t reach the server',
      body: 'Check your connection, then try again.',
    };
  }
  if (code === 'ORG_LOGIN_REQUIRED' && err?.body?.loginPath) {
    return {
      title: 'Use your organisation’s sign-in page',
      body: 'This account belongs to an organisation with its own sign-in page.',
      link: {
        href: `${err.body.loginPath}#/login`,
        label: 'Go to the organisation sign-in page',
      },
    };
  }
  if (status === 403) {
    return {
      title: 'Sign-in is unavailable',
      body: err?.message || 'Access to this organisation is currently unavailable.',
    };
  }
  if (status === 429) {
    return {
      title: 'Too many attempts',
      body: err?.message || 'Wait a few minutes before trying again.',
    };
  }
  if (status === 404) {
    return {
      title: 'This sign-in page isn’t available',
      body: 'Check the address you were given, or ask your administrator.',
    };
  }
  if (status === 401 || status === 400) {
    return {
      title: 'We couldn’t sign you in',
      body: 'Check your work email and password, then try again. If you still can’t get in, ask your HR administrator.',
    };
  }
  if (status >= 500) {
    return {
      title: 'Something went wrong',
      body: 'Please try again in a moment. If it keeps happening, contact your HR administrator.',
    };
  }
  return {
    title: 'We couldn’t sign you in',
    body: 'Please try again. If this keeps happening, contact your HR administrator.',
  };
}

export function LoginPage() {
  const { login, branding, orgCode, flash, clearFlash } = useAuth();
  const navigate = useNavigate();
  const signInMessage = branding?.loginMessage || branding?.platform?.loginMessage;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [loading, setLoading] = useState(false);

  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const updateEmail = (value) => {
    setEmail(value);
    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }));
    if (formError) setFormError(null);
  };

  const updatePassword = (value) => {
    setPassword(value);
    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: '' }));
    if (formError) setFormError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (clearFlash) clearFlash();
    setFormError(null);

    const trimmedEmail = email.trim();
    const next = {};
    if (!trimmedEmail) next.email = 'Enter your work email.';
    else if (!EMAIL_RE.test(trimmedEmail)) {
      next.email = 'Enter a valid work email, like name@bank.in.';
    }
    if (!password) next.password = 'Enter your password.';

    setFieldErrors(next);
    if (Object.keys(next).length) {
      if (next.email) emailRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      const result = await login(trimmedEmail, password, orgCode);
      if (result.mfaRequired) {
        sessionStorage.setItem('mfaChallengeToken', result.challengeToken);
        navigate('/mfa-verify');
      } else {
        navigate('/');
      }
    } catch (err) {
      setFormError(describeLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      {flash?.message && !formError && (
        <div
          className={`login-note ${flash.kind === 'error' ? 'login-note-error' : ''}`}
          role="status"
        >
          {flash.message}
        </div>
      )}

      {signInMessage && !formError && !flash?.message && (
        <div className="login-note" role="status">{signInMessage}</div>
      )}

      {formError && (
        <div className="login-alert" role="alert">
          <AlertIcon />
          <div>
            <p className="login-alert-title">{formError.title}</p>
            <p className="login-alert-body">{formError.body}</p>
            {formError.link && (
              <a className="login-alert-link" href={formError.link.href}>
                {formError.link.label}
              </a>
            )}
          </div>
        </div>
      )}

      <form className="login-form" onSubmit={handleSubmit} aria-busy={loading} noValidate>
        <div className="login-field">
          <div className="login-label-row">
            <label className="login-label" htmlFor="email">Work email</label>
          </div>
          <input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            className={`login-input ${fieldErrors.email ? 'is-invalid' : ''}`}
            value={email}
            onChange={(e) => updateEmail(e.target.value)}
            placeholder="name@bank.in"
            autoComplete="username"
            autoCapitalize="none"
            inputMode="email"
            enterKeyHint="next"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            required
            autoFocus
          />
          {fieldErrors.email && (
            <p className="login-field-error" id="email-error">{fieldErrors.email}</p>
          )}
        </div>

        <div className="login-field">
          <div className="login-label-row">
            <label className="login-label" htmlFor="password">Password</label>
            <a className="login-forgot" href="#/forgot-password">Forgot password?</a>
          </div>
          <div className="login-input-wrap">
            <input
              ref={passwordRef}
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              className={`login-input login-input-password ${fieldErrors.password ? 'is-invalid' : ''}`}
              value={password}
              onChange={(e) => updatePassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              enterKeyHint="go"
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              required
            />
            <button
              type="button"
              className="login-reveal"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              aria-controls="password"
            >
              <EyeIcon crossed={showPassword} />
            </button>
          </div>
          {fieldErrors.password && (
            <p className="login-field-error" id="password-error">{fieldErrors.password}</p>
          )}
        </div>

        <Button type="submit" loading={loading} className="login-submit">
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  );
}
