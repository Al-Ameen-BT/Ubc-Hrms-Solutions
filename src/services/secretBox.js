'use strict';

/**
 * Symmetric encryption for secrets the server has to read back later —
 * TOTP seeds and SMTP passwords. (Passwords users sign in with are
 * bcrypt-hashed instead, in authService; those never need reading back.)
 *
 * AES-256-GCM, fresh 12-byte IV per value, key derived from JWT_SECRET.
 * Stored format: base64(iv):base64(tag):base64(ciphertext).
 *
 * Consequence worth knowing operationally: rotating JWT_SECRET makes every
 * stored MFA seed and SMTP password undecryptable — users would need their
 * MFA reset and SMTP passwords re-entered. Don't rotate it casually.
 */

const crypto = require('crypto');

function key() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set — cannot encrypt/decrypt stored secrets.');
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

function decrypt(stored) {
  const [ivB64, tagB64, encB64] = String(stored || '').split(':');
  if (!ivB64 || !tagB64 || !encB64) throw new Error('Malformed encrypted value');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]).toString('utf8');
}

/** Random URL-safe token plus its SHA-256 (store the hash, send the token). */
function randomToken(bytes = 32) {
  const token = crypto.randomBytes(bytes).toString('base64url');
  return { token, hash: sha256(token) };
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

module.exports = { encrypt, decrypt, randomToken, sha256 };
