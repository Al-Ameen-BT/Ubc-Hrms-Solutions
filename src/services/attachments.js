'use strict';

/**
 * Generic "at most one document per owner row" attachment storage, shared
 * by Government Orders (models/governmentOrderDocument.js) and Service
 * Book events (models/serviceHistoryDocument.js). Same base64-data-URL-in-
 * JSON / magic-number-sniffed pattern as services/documents.js and
 * services/brandAssets.js — see those files' header comments for why.
 * Parameterised by the model and its owner foreign-key column so both
 * callers share one implementation instead of two near-identical copies.
 */

const crypto = require('crypto');

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function sniff(buf) {
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.slice(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

class AttachmentError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

function decodeUpload(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') throw new AttachmentError('No file received.');
  const m = /^data:[^;,]*;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!m) throw new AttachmentError('File must be sent as a base64 data URL.');
  const buf = Buffer.from(m[1].replace(/\s+/g, ''), 'base64');
  if (!buf.length) throw new AttachmentError('The file is empty.');
  if (buf.length > MAX_BYTES) throw new AttachmentError(`File is too large (${Math.ceil(buf.length / 1024)} KB). Maximum is ${MAX_BYTES / 1024 / 1024} MB.`);
  const mimeType = sniff(buf);
  if (!mimeType) throw new AttachmentError('Unsupported file type. Use PNG, JPEG, WebP or PDF.');
  return { buf, mimeType };
}

/** Metadata only (no bytes) — safe to embed in list/detail API responses. */
async function info(Model, ownerField, ownerId) {
  const row = await Model.findOne({
    where: { [ownerField]: ownerId },
    attributes: ['id', 'label', 'mimeType', 'sizeBytes', 'sha256', 'createdAt'],
  });
  if (!row) return null;
  return { id: row.id, label: row.label, mimeType: row.mimeType, sizeBytes: row.sizeBytes, version: row.sha256.slice(0, 12), createdAt: row.createdAt };
}

/** Batch version of `info`, keyed by ownerId — for embedding into a list of owners without an N+1 query each. */
async function infoBatch(Model, ownerField, ownerIds) {
  if (!ownerIds.length) return {};
  const rows = await Model.findAll({
    where: { [ownerField]: ownerIds },
    attributes: ['id', ownerField, 'label', 'mimeType', 'sizeBytes', 'sha256', 'createdAt'],
  });
  const out = {};
  rows.forEach((row) => {
    out[row[ownerField]] = { id: row.id, label: row.label, mimeType: row.mimeType, sizeBytes: row.sizeBytes, version: row.sha256.slice(0, 12), createdAt: row.createdAt };
  });
  return out;
}

async function save(Model, ownerField, ownerId, { label, dataUrl }, uploadedBy) {
  const { buf, mimeType } = decodeUpload(dataUrl);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const existing = await Model.findOne({ where: { [ownerField]: ownerId } });
  const fields = { label: label ? String(label).slice(0, 255) : null, mimeType, data: buf, sizeBytes: buf.length, sha256, uploadedBy: uploadedBy || null };
  if (existing) await existing.update(fields);
  else await Model.create({ [ownerField]: ownerId, ...fields });
  return info(Model, ownerField, ownerId);
}

async function remove(Model, ownerField, ownerId) {
  return Model.destroy({ where: { [ownerField]: ownerId } });
}

/** The full row, including bytes — for streaming the file. */
async function get(Model, ownerField, ownerId) {
  return Model.findOne({ where: { [ownerField]: ownerId } });
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

module.exports = { info, infoBatch, save, remove, get, send, decodeUpload, AttachmentError, MAX_BYTES };
