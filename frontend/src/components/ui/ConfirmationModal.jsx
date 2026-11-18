import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';

export function ConfirmationModal({
  open,
  onClose,
  onConfirm,
  title,
  itemName,
  details = {},
  warningMessage,
  confirmLabel = 'Deactivate',
  confirmVariant = 'danger',
  loading = false,
  error = '',
  requireVerification = false,
  verificationText = 'DISABLE',
  verificationLabel = '',
}) {
  const [inputText, setInputText] = useState('');

  // Reset input when modal opens/closes
  useEffect(() => {
    if (open) {
      setInputText('');
    }
  }, [open]);

  if (!open) return null;

  const isVerified = !requireVerification || inputText.trim().toUpperCase() === verificationText.trim().toUpperCase();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={confirmVariant}
            loading={loading}
            disabled={!isVerified || loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="confirm-modal-content">
        {error && <div className="auth-error" role="alert">{error}</div>}

        <div className={`confirm-warning-banner ${confirmVariant === 'danger' ? 'banner-danger' : confirmVariant === 'primary' ? 'banner-primary' : 'banner-warning'}`}>
          <span className="confirm-warning-icon" aria-hidden="true">
            {confirmVariant === 'danger' ? '⚠️' : confirmVariant === 'primary' ? 'ℹ️' : 'ℹ️'}
          </span>
          <div>{warningMessage}</div>
        </div>

        {(itemName || Object.keys(details).length > 0) && (
          <div className="confirm-details-box">
            {itemName && (
              <div className="confirm-details-title">
                {itemName}
              </div>
            )}
            {Object.keys(details).length > 0 && (
              <div className="confirm-details-grid">
                {Object.entries(details).map(([key, val]) => (
                  val != null && val !== '' ? (
                    <div key={key} className="confirm-detail-item">
                      <span className="confirm-detail-label">{key}</span>
                      <span className="confirm-detail-val">{String(val)}</span>
                    </div>
                  ) : null
                ))}
              </div>
            )}
          </div>
        )}

        {requireVerification && (
          <div className="confirm-verification-section">
            <Input
              id="confirm-verification-input"
              label={verificationLabel || `Type "${verificationText}" to confirm:`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={verificationText}
              autoComplete="off"
              mono
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
