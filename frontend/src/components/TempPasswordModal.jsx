import React, { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';

/**
 * Reusable popup modal displaying a newly issued temporary password (after
 * account creation or admin password reset). Highlights when SMTP is not
 * configured/bypassed and provides one-click copy for both the password and a
 * shareable login message for the Employee Self-Service portal & Mobile app.
 */
export function TempPasswordModal({ credentials, onClose }) {
  const toast = useToast();
  const [copiedField, setCopiedField] = useState('');

  useEffect(() => {
    setCopiedField('');
  }, [credentials]);

  if (!credentials) {
    return <Modal open={false} onClose={onClose} title="" />;
  }

  const { mode = 'create', user, tempPassword, emailStatus, loginUrl } = credentials;
  const isReset = mode === 'reset';
  const title = isReset ? 'Temporary Password Issued' : 'User Account Created';
  const emailSent = Boolean(emailStatus?.sent);
  const smtpNotConfigured = emailStatus?.smtpConfigured === false;
  const emailFailed = Boolean(emailStatus?.requested && !emailSent && emailStatus?.error && !smtpNotConfigured);
  const isEmployee = user?.role === 'EMPLOYEE';

  const copyText = async (text, label, fieldKey) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldKey);
      toast.add(`${label} copied.`, 'success');
      setTimeout(() => setCopiedField((prev) => (prev === fieldKey ? '' : prev)), 2000);
    } catch {
      toast.add('Could not copy automatically — please copy the text manually.', 'error');
    }
  };

  const shareText = [
    user?.name ? `Hello ${user.name},` : 'Hello,',
    '',
    isReset
      ? 'Your UCB HRMS password has been reset. Use this temporary password to sign in:'
      : 'Your UCB HRMS account is ready. Use these details to sign in:',
    loginUrl ? `Portal URL: ${loginUrl}` : null,
    user?.email ? `Email: ${user.email}` : null,
    `Temporary Password: ${tempPassword}`,
    '',
    'You will be prompted to set a new password on your first sign-in.',
    isEmployee
      ? 'To link the Employee Mobile App, sign in to the web Employee Self-Service portal first, set your new password, and open My Account -> Linked devices.'
      : null,
  ]
    .filter((line) => line !== null)
    .join('\n');

  let noticeClass = 'temp-pwd-notice';
  let noticeText = 'Share this temporary password securely with the user.';
  if (emailSent) {
    noticeClass = 'temp-pwd-notice temp-pwd-notice-sent';
    noticeText = `Welcome details were emailed to ${user?.email || 'the user'}. You can also copy the temporary password below.`;
  } else if (smtpNotConfigured) {
    noticeClass = 'temp-pwd-notice temp-pwd-notice-bypass';
    noticeText = 'No SMTP email service is configured for this organisation (email bypassed). Share this temporary password directly with the employee/user so they can log in.';
  } else if (emailFailed) {
    noticeClass = 'temp-pwd-notice temp-pwd-notice-warn';
    noticeText = `Email could not be sent (${emailStatus.error}). Share this temporary password directly with the user.`;
  } else if (emailStatus?.bypassed) {
    noticeClass = 'temp-pwd-notice temp-pwd-notice-bypass';
    noticeText = 'Email delivery was bypassed. Share this temporary password directly with the employee/user so they can log in.';
  }

  return (
    <Modal
      open={Boolean(credentials)}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => copyText(shareText, 'Shareable login message', 'message')}
          >
            {copiedField === 'message' ? 'Message Copied' : 'Copy Shareable Message'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => copyText(tempPassword || '', 'Temporary password', 'password')}
          >
            {copiedField === 'password' ? 'Password Copied' : 'Copy Password'}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="temp-pwd-modal">
        <div className={noticeClass} role="status">
          {noticeText}
        </div>

        <dl className="definition-list temp-pwd-meta">
          {user?.name && (
            <>
              <dt>Name</dt>
              <dd>{user.name}</dd>
            </>
          )}
          {user?.email && (
            <>
              <dt>Email</dt>
              <dd className="mono">{user.email}</dd>
            </>
          )}
          {user?.role && (
            <>
              <dt>Role</dt>
              <dd>{user.role.replace(/_/g, ' ')}</dd>
            </>
          )}
          {loginUrl && (
            <>
              <dt>Portal URL</dt>
              <dd className="mono">{loginUrl}</dd>
            </>
          )}
        </dl>

        <div className="field">
          <span className="field-label">Temporary Password (share with user)</span>
          <code className="manual-key mono">{tempPassword}</code>
        </div>

        <p className="form-note">
          The user must sign in to the Employee Self-Service portal with this temporary password and set their own permanent password on first login.
          {isEmployee
            ? ' Once their password is set, they can link the Mobile app from My Account → Linked devices.'
            : ''}
        </p>
      </div>
    </Modal>
  );
}
