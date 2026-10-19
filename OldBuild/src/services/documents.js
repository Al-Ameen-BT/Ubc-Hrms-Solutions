'use strict';

/**
 * Employee document uploads (PAN, Aadhar, Education Certificate, Photo,
 * Others). Same base64-data-URL-in-JSON pattern as services/brandAssets.js
 * (see that file's header comment for why), extended to also accept PDF —
 * ID and certificate scans are commonly PDFs, unlike logos.
 */

const crypto = require('crypto');
const { EmployeeDocument } = require('../models');

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per document

function sniff(buf) {
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.slice(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

class DocumentError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

function decodeUpload(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') throw new DocumentError('No file received.');
  const m = /^data:[^;,]*;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!m) throw new DocumentError('File must be sent as a base64 data URL.');
  const buf = Buffer.from(m[1].replace(/\s+/g, ''), 'base64');
  if (!buf.length) throw new DocumentError('The file is empty.');
  if (buf.length > MAX_BYTES) throw new DocumentError(`File is too large (${Math.ceil(buf.length / 1024)} KB). Maximum is ${MAX_BYTES / 1024 / 1024} MB.`);
  const mimeType = sniff(buf);
  if (!mimeType) throw new DocumentError('Unsupported file type. Use PNG, JPEG, WebP or PDF.');
  return { buf, mimeType };
}

const DOC_TYPES = ['PAN', 'AADHAR', 'EDUCATION_CERTIFICATE', 'PHOTO', 'OTHER'];

async function upload(employeeId, { docType, label, dataUrl }, uploadedBy) {
  if (!DOC_TYPES.includes(docType)) throw new DocumentError(`docType must be one of: ${DOC_TYPES.join(', ')}`);
  const { buf, mimeType } = decodeUpload(dataUrl);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  return EmployeeDocument.create({
    employeeId, docType, label: label ? String(label).slice(0, 255) : null,
    mimeType, data: buf, sizeBytes: buf.length, sha256, uploadedBy: uploadedBy || null,
  });
}

async function list(employeeId) {
  return EmployeeDocument.findAll({
    where: { employeeId },
    attributes: ['id', 'employeeId', 'docType', 'label', 'mimeType', 'sizeBytes', 'sha256', 'createdAt'],
    order: [['createdAt', 'DESC']],
  });
}

async function get(employeeId, docId) {
  return EmployeeDocument.findOne({ where: { id: docId, employeeId } });
}

/** Express handler body: streams the stored bytes with safe headers. */
function send(res, row) {
  const etag = `"${row.sha256.slice(0, 32)}"`;
  res.set({
    'Content-Type': row.mimeType,
    'Content-Length': String(row.sizeBytes),
    'Cache-Control': 'private, max-age=300',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
  });
  if (res.req.headers['if-none-match'] === etag) return res.status(304).end();
  return res.end(Buffer.from(row.data));
}

module.exports = { upload, list, get, send, DocumentError, DOC_TYPES, MAX_BYTES };
