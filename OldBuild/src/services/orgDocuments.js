'use strict';

/**
 * Upload handling for Organisation Profile statutory documents (task 79) —
 * RBI licence, incorporation/registration certificate, PAN, GSTN, TAN,
 * other. Unlike services/brandAssets.js (logos/photos, images only), these
 * are typically scanned PDFs, so this accepts PDF alongside the same image
 * types brandAssets does — reusing its magic-number sniffing and PNG
 * integrity check rather than duplicating them.
 *
 * Same base64-data-URL-in-JSON approach as brandAssets.js — no multipart
 * parser dependency needed at these sizes. SVG is still not accepted, for
 * the same stored-XSS reason.
 */

const crypto = require('crypto');
const { OrganizationDocument } = require('../models');
const brand = require('./brandAssets');
const orgFields = require('./orgFields');

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — a scanned certificate/licence, not a bulk archive

class OrgDocumentError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

function sniff(buf) {
  if (buf.length >= 5 && buf.slice(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return brand.sniff(buf); // PNG / JPEG / WebP (ICO is favicon-only, irrelevant here)
}

function decodeUpload(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') throw new OrgDocumentError('No file received.');
  const m = /^data:[^;,]*;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!m) throw new OrgDocumentError('File must be sent as a base64 data URL.');
  const buf = Buffer.from(m[1].replace(/\s+/g, ''), 'base64');
  if (!buf.length) throw new OrgDocumentError('The file is empty.');
  if (buf.length > MAX_BYTES) throw new OrgDocumentError(`File is too large (${Math.ceil(buf.length / 1024)} KB). Maximum is ${MAX_BYTES / (1024 * 1024)} MB.`);
  const mimeType = sniff(buf);
  if (!mimeType) throw new OrgDocumentError('Unsupported file type. Use PDF, PNG, JPEG or WebP.');
  if (mimeType === 'image/png') brand.assertPngIntegrity(buf);
  return { buf, mimeType };
}

async function list(organizationId) {
  return OrganizationDocument.findAll({
    where: { organizationId },
    attributes: { exclude: ['data'] },
    order: [['docType', 'ASC'], ['id', 'DESC']],
  });
}

async function create(organizationId, body, uploadedBy) {
  const fields = orgFields.orgDocumentFields(body);
  const { buf, mimeType } = decodeUpload((body || {}).fileDataUrl);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const fileName = (body && body.fileName) ? String(body.fileName).trim().slice(0, 255) : null;
  const row = await OrganizationDocument.create({
    organizationId, ...fields, fileName, mimeType, data: buf, sizeBytes: buf.length, sha256, uploadedBy: uploadedBy || null,
  });
  const { data, ...safe } = row.toJSON();
  return safe;
}

async function remove(organizationId, id) {
  const row = await OrganizationDocument.findOne({ where: { id, organizationId } });
  if (!row) return null;
  await row.destroy();
  return row;
}

async function find(organizationId, id) {
  return OrganizationDocument.findOne({ where: { id, organizationId } });
}

module.exports = { OrgDocumentError, MAX_BYTES, sniff, decodeUpload, list, create, remove, find };
