'use strict';

const crypto = require('crypto');
const secretBox = require('./secretBox');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');

const JWT_EXPIRY = process.env.JWT_EXPIRY || '12h';
const MFA_CHALLENGE_EXPIRY = '5m';
const MFA_ISSUER = 'UCB HRMS';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET is not set. Set it in your environment before starting the app — auth cannot run without it.'
    );
  }
  return secret;
}

async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/** Generates a random, human-typeable temporary password (for admin-created accounts). */
function generateTempPassword() {
  // crypto.randomInt, not Math.random — these are real credentials.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += chars[crypto.randomInt(chars.length)];
  }
  return out;
}

/**
 * `typ` distinguishes a normal 12h session token from the narrow, 5-minute
 * MFA challenge token issued mid-login (see signMfaChallengeToken). Without
 * this, a leaked challenge token could be replayed as a full Bearer token
 * before its short expiry, since JWTs are otherwise self-contained.
 * verifyToken() below rejects anything that isn't 'access'; tokens issued
 * before this field existed have no `typ` at all and are treated as
 * 'access' for a smooth transition (they carry the normal 12h expiry
 * anyway, so the gap closes itself).
 */
function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, organizationId: user.organizationId, typ: 'access' },
    getSecret(),
    { expiresIn: JWT_EXPIRY }
  );
}

function verifyToken(token) {
  const payload = jwt.verify(token, getSecret());
  if (payload.typ && payload.typ !== 'access') {
    throw new Error('Not an access token');
  }
  return payload;
}

/**
 * Issued after a correct password when the account has MFA enabled.
 * Deliberately narrow: 5 minutes, single-purpose (typ: 'mfa_challenge'),
 * and rejected outright by the normal `authenticate` middleware — it can
 * only be redeemed at POST /auth/mfa/verify-login, and only for the same
 * user id it was issued for.
 */
function signMfaChallengeToken(user) {
  return jwt.sign({ sub: user.id, typ: 'mfa_challenge' }, getSecret(), { expiresIn: MFA_CHALLENGE_EXPIRY });
}

function verifyMfaChallengeToken(token) {
  const payload = jwt.verify(token, getSecret());
  if (payload.typ !== 'mfa_challenge') {
    throw new Error('Not an MFA challenge token');
  }
  return payload;
}

// ---------------------------------------------------------------------- MFA
//
// TOTP secrets are encrypted at rest (AES-256-GCM via services/secretBox)
// rather than stored as plain base32 — if the database ever leaks, a
// plaintext secret is as good as no MFA at all. This is symmetric
// encryption, not hashing: the server has to read the secret back on every
// code check, so it can't be a one-way hash.

function encryptMfaSecret(plainSecret) {
  return secretBox.encrypt(plainSecret);
}

function decryptMfaSecret(stored) {
  return secretBox.decrypt(stored);
}

/** Generates a fresh base32 TOTP secret. Not persisted until confirmed. */
function generateMfaSecret() {
  return authenticator.generateSecret();
}

/** otpauth:// URI an authenticator app scans/imports. */
function mfaKeyUri(email, secret) {
  return authenticator.keyuri(email, MFA_ISSUER, secret);
}

async function mfaQrCodeDataUrl(otpauthUrl) {
  return QRCode.toDataURL(otpauthUrl, { width: 240, margin: 1 });
}

/** Checks a 6-digit code against a *plaintext* secret (caller decrypts first). */
function verifyMfaCode(code, plainSecret) {
  try {
    return authenticator.check(String(code).trim(), plainSecret);
  } catch (err) {
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateTempPassword,
  signToken,
  verifyToken,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
  encryptMfaSecret,
  decryptMfaSecret,
  generateMfaSecret,
  mfaKeyUri,
  mfaQrCodeDataUrl,
  verifyMfaCode,
};
