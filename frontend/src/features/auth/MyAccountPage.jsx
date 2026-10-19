import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

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
    </div>
  );
}
