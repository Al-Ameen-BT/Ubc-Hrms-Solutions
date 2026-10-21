import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

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
}) {
  if (!open) return null;

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
          <Button variant={confirmVariant} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="confirm-modal-content">
        {error && <div className="auth-error" role="alert">{error}</div>}

        <div className={`confirm-warning-banner ${confirmVariant === 'danger' ? 'banner-danger' : 'banner-warning'}`}>
          <span className="confirm-warning-icon" aria-hidden="true">
            {confirmVariant === 'danger' ? '⚠️' : 'ℹ️'}
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
      </div>
    </Modal>
  );
}
