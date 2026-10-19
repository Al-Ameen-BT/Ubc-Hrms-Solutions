'use strict';

/**
 * Logo / favicon storage (see models/brandAsset.js for why it's in the DB).
 *
 * Uploads arrive as a base64 data URL in a JSON body — no multipart parser
 * dependency needed at these sizes. The file type is decided by the actual
 * bytes (magic numbers), never by the name or the claimed MIME type.
 *
 * SVG is deliberately NOT accepted: an SVG can carry script, and these
 * files are served from the app's own origin, so an uploaded SVG opened
 * directly would be stored XSS against every signed-in user.
 */

const crypto = require('crypto');
const zlib = require('zlib');
const { BrandAsset } = require('../models');

const LIMITS = { LOGO: 512 * 1024, FAVICON: 128 * 1024, BOARD_PHOTO: 512 * 1024 };

function sniff(buf) {
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.length >= 4 && buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return 'image/x-icon';
  return null;
}

class AssetError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

/**
 * A PNG whose magic bytes are valid but whose IDAT (pixel) data is
 * corrupted/truncated will later crash the whole Node process when pdfkit
 * tries to embed it in a document header (documentHeader.js): pdfkit's PNG
 * decoder inflates that data asynchronously and throws from a zlib
 * callback, outside any try/catch a caller can set up. So we validate it
 * ourselves, here, at upload time — zlib.inflateSync throws synchronously,
 * which we CAN catch — and refuse the upload outright rather than storing
 * a logo/photo that would crash every future document download.
 */
function assertPngIntegrity(buf) {
  let offset = 8; // past the 8-byte PNG signature, already checked by sniff()
  const idatChunks = [];
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buf.length) break; // truncated chunk — caught below by the "no IDAT" check
    if (type === 'IDAT') idatChunks.push(buf.slice(dataStart, dataEnd));
    if (type === 'IEND') break;
    offset = dataEnd + 4; // skip the trailing 4-byte CRC
  }
  if (!idatChunks.length) throw new AssetError('That PNG file looks corrupted (no image data found).');
  try {
    zlib.inflateSync(Buffer.concat(idatChunks));
  } catch (e) {
    throw new AssetError('That PNG file looks corrupted and can\'t be used — try re-exporting or re-saving it, then upload again.');
  }
}

function decodeUpload(dataUrl, kind) {
  if (!dataUrl || typeof dataUrl !== 'string') throw new AssetError('No image received.');
  const m = /^data:[^;,]*;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!m) throw new AssetError('Image must be sent as a base64 data URL.');
  const buf = Buffer.from(m[1].replace(/\s+/g, ''), 'base64');
  if (!buf.length) throw new AssetError('The image is empty.');
  const limit = LIMITS[kind];
  const kindLabel = kind === 'FAVICON' ? 'favicon' : kind === 'BOARD_PHOTO' ? 'photo' : 'logo';
  if (buf.length > limit) {
    throw new AssetError(`Image is too large (${Math.ceil(buf.length / 1024)} KB). Maximum for a ${kindLabel} is ${limit / 1024} KB.`);
  }
  const mimeType = sniff(buf);
  if (!mimeType) throw new AssetError('Unsupported image type. Use PNG, JPEG or WebP (ICO also accepted for the favicon). SVG is not accepted.');
  if (mimeType === 'image/x-icon' && kind !== 'FAVICON') throw new AssetError('ICO files can only be used as the favicon.');
  if (mimeType === 'image/png') assertPngIntegrity(buf);
  return { buf, mimeType };
}

async function find(organizationId, kind) {
  return BrandAsset.findOne({ where: { organizationId: organizationId || null, kind }, order: [['id', 'DESC']] });
}

/** Metadata only (no bytes) — for API responses. */
async function info(organizationId, kind) {
  const row = await BrandAsset.findOne({
    where: { organizationId: organizationId || null, kind },
    attributes: ['id', 'mimeType', 'sizeBytes', 'sha256', 'updatedAt'],
    order: [['id', 'DESC']],
  });
  if (!row) return null;
  return { mimeType: row.mimeType, sizeBytes: row.sizeBytes, version: row.sha256.slice(0, 12), updatedAt: row.updatedAt };
}

async function save(organizationId, kind, dataUrl, uploadedBy) {
  const { buf, mimeType } = decodeUpload(dataUrl, kind);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const existing = await find(organizationId, kind);
  const fields = { mimeType, data: buf, sizeBytes: buf.length, sha256, uploadedBy: uploadedBy || null };
  if (existing) {
    await existing.update(fields);
  } else {
    await BrandAsset.create({ organizationId: organizationId || null, kind, ...fields });
  }
  // Keep exactly one row per (org, kind) even if an older duplicate slipped in.
  await BrandAsset.destroy({ where: { organizationId: organizationId || null, kind, sha256: { [require('sequelize').Op.ne]: sha256 } } });
  return info(organizationId, kind);
}

async function remove(organizationId, kind) {
  return BrandAsset.destroy({ where: { organizationId: organizationId || null, kind } });
}

/** Express handler body: streams the stored bytes with safe headers. */
function send(res, row) {
  const etag = `"${row.sha256.slice(0, 32)}"`;
  res.set({
    'Content-Type': row.mimeType,
    'Content-Length': String(row.sizeBytes),
    'Cache-Control': 'public, max-age=300',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
  });
  if (res.req.headers['if-none-match'] === etag) return res.status(304).end();
  return res.end(Buffer.from(row.data));
}

module.exports = { find, info, save, remove, send, decodeUpload, sniff, assertPngIntegrity, AssetError, LIMITS };
