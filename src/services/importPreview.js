'use strict';

const crypto = require('node:crypto');

const PREVIEW_MS = 10 * 60 * 1000;

class ImportPreviewError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function actorKey(actor) { return `${actor?.id || ''}:${actor?.organizationId || 'platform'}`; }
function canonical(purpose, actor, expiresAt, preview) {
  return JSON.stringify(stable({ purpose, actor: actorKey(actor), expiresAt, preview }));
}
function mac(purpose, actor, expiresAt, preview) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set — cannot sign import previews.');
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(canonical(purpose, actor, expiresAt, preview)).digest();
}
function signPreview(purpose, actor, preview) {
  const expiresAt = Date.now() + PREVIEW_MS;
  return { ...preview, expiresAt, previewSignature: `${expiresAt}.${mac(purpose, actor, expiresAt, preview).toString('hex')}` };
}
function verifyPreview(purpose, actor, signed) {
  if (!signed || typeof signed !== 'object' || Array.isArray(signed)) throw new ImportPreviewError('Import preview is required.');
  const { previewSignature, expiresAt: suppliedExpiry, ...preview } = signed;
  const match = typeof previewSignature === 'string' && /^([1-9]\d{12})\.([a-f0-9]{64})$/.exec(previewSignature);
  if (!match) throw new ImportPreviewError('Invalid import preview signature.');
  const expiresAt = Number(match[1]);
  if (suppliedExpiry !== expiresAt || expiresAt <= Date.now() || expiresAt > Date.now() + PREVIEW_MS) throw new ImportPreviewError('Import preview expired; preview the workbook again.');
  const expected = mac(purpose, actor, expiresAt, preview), supplied = Buffer.from(match[2], 'hex');
  if (!crypto.timingSafeEqual(expected, supplied)) throw new ImportPreviewError('Invalid or changed import preview.');
  return preview;
}

module.exports = { ImportPreviewError, signPreview, verifyPreview };
