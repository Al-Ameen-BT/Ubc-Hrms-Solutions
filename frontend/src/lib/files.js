/* Small file helpers for the scan-upload flows. Documents are sent to the API
   as base64 data URLs inside JSON (see src/services/documents.js), so we only
   need to read the file client-side and hand back the data URL. */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // mirrors documents.MAX_BYTES
export const ACCEPTED_UPLOAD_TYPES = '.png,.jpg,.jpeg,.webp,.pdf';

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}

export function humanSize(bytes) {  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** Validates size/type before upload; throws with a friendly message. */
export function assertUploadable(file) {
  if (!file) throw new Error('Choose a file first.');
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File is too large (${humanSize(file.size)}). Maximum is 5 MB.`);
  }
  const ok = /image\/(png|jpe?g|webp)$/i.test(file.type) || file.type === 'application/pdf';
  if (!ok) throw new Error('Unsupported file type. Use PNG, JPEG, WebP or PDF.');
}
