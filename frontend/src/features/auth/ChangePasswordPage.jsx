import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { authApi } from '../../api/client';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export function ChangePasswordPage() {
  const { user, refreshMe, logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const forced = !!user?.mustChangePassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!current) {
      setError('Enter your current password.');
      return;
    }
    if (next !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    if (next.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authApi.changePassword(current, next);
      /* Refresh the stored user so mustChangePassword clears server-side too.
         Without this the guard would bounce straight back here (endless loop). */
      await refreshMe();
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  };

  const signOut = (e) => {
    e.preventDefault();
    logout();
    navigate('/login');
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">{forced ? 'Choose a New Password' : 'Change Password'}</h1>
          <p className="auth-subtitle">
            {forced
              ? `Hello ${user?.name || user?.email} — you signed in with a temporary password. Please choose your own.`
              : `Signed in as ${user?.email}`}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}

          <Input
            id="current"
            label="Current Password"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoComplete="current-password"
          />

          <Input
            id="next"
            label="New Password"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            hint="At least 8 characters."
          />

          <Input
            id="confirm"
            label="Confirm New Password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />

          <Button type="submit" loading={loading} className="auth-submit">
            Update Password
          </Button>
        </form>

        {forced && (
          <div className="auth-links">
            <a href="#/login" onClick={signOut}>Sign out</a>
          </div>
        )}
      </div>
    </div>
  );
}
