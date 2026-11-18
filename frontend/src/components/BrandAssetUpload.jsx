import React, { useState } from 'react';
import { readFileAsDataUrl } from '../lib/files';
import { Button } from './ui/Button';
import './BrandAssetUpload.css';

export function BrandAssetUpload({ id, label, hint, asset, limitBytes, src, accept, onUpload, onDelete, onChanged }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const isIcon = accept.includes('.ico');

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    if (file.size > limitBytes) return setError(`Choose an image under ${Math.round(limitBytes / 1024)} KB.`);
    if (!['image/png', 'image/jpeg', 'image/webp', ...(accept.includes('.ico') ? ['image/x-icon', 'image/vnd.microsoft.icon'] : [])].includes(file.type) && !(accept.includes('.ico') && !file.type && /\.ico$/i.test(file.name))) {
      return setError('Choose a PNG, JPEG, WebP or ICO image allowed for this slot.');
    }
    setPending(true);
    try {
      await onUpload(await readFileAsDataUrl(file));
      onChanged();
    } catch (err) { setError(err.message || 'Upload failed. Try again.'); }
    finally { setPending(false); }
  };

  const remove = async () => {
    setPending(true);
    setError('');
    try { await onDelete(); onChanged(); }
    catch (err) { setError(err.message || 'Could not remove image.'); }
    finally { setPending(false); }
  };

  return <div className="field brand-asset-field">
    <label className="field-label" htmlFor={id}>{label}</label>
    <p className="form-note">{hint}</p>
    {asset && <div className={`brand-asset-preview-frame${isIcon ? ' brand-asset-preview-frame-icon' : ''}`}>
      <img src={src} alt={`${label} preview`} className="brand-asset-preview" />
    </div>}
    <div className="row-actions brand-asset-actions">
      <label className={`file-upload-btn-wrap${pending ? ' is-disabled' : ''}`} htmlFor={id}>
        <span className="file-upload-btn">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M3 13v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3M10 3v10M6 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {pending ? 'Uploading…' : asset ? `Replace ${label.toLowerCase()}` : `Choose ${label.toLowerCase()}`}
        </span>
        <input id={id} type="file" accept={accept} disabled={pending} onChange={upload} aria-describedby={`${id}-hint`} />
      </label>
      {asset && <Button variant="secondary" size="sm" disabled={pending} onClick={remove}>Remove</Button>}
    </div>
    <small id={`${id}-hint`} className="field-hint">{Math.round(limitBytes / 1024)} KB maximum</small>
    {error && <p className="auth-error" role="alert">{error}</p>}
  </div>;
}
