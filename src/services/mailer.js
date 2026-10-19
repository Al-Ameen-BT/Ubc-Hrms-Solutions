'use strict';

/**
 * Outgoing email. Which SMTP server is used:
 *   - mail concerning a bank → that bank's own SMTP if it has one enabled,
 *     otherwise the platform SMTP;
 *   - platform mail (Super Admin accounts) → the platform SMTP.
 * If neither is configured, sending is skipped and the caller is told so —
 * nothing in the app *depends* on mail being set up (temporary passwords
 * are always shown on screen too).
 */

const nodemailer = require('nodemailer');
const { SmtpConfig, Organization } = require('../models');
const secretBox = require('./secretBox');
const { getPlatformSettings } = require('./settings');

async function getConfigRow(organizationId) {
  return SmtpConfig.findOne({ where: { organizationId: organizationId || null }, order: [['id', 'ASC']] });
}

async function getOrCreateConfigRow(organizationId) {
  const row = await getConfigRow(organizationId);
  if (row) return row;
  return SmtpConfig.create({ organizationId: organizationId || null });
}

function isUsable(row) {
  return !!(row && row.enabled && row.host && row.fromEmail);
}

/** API-safe view: the password is never returned, only whether one is set. */
function publicView(row) {
  if (!row) {
    return { enabled: false, host: '', port: 587, security: 'STARTTLS', username: '', hasPassword: false, fromName: '', fromEmail: '', replyTo: '', lastTestAt: null, lastTestOk: null, lastTestMessage: null };
  }
  return {
    enabled: !!row.enabled,
    host: row.host || '',
    port: row.port || 587,
    security: row.security,
    username: row.username || '',
    hasPassword: !!row.passwordEnc,
    fromName: row.fromName || '',
    fromEmail: row.fromEmail || '',
    replyTo: row.replyTo || '',
    lastTestAt: row.lastTestAt,
    lastTestOk: row.lastTestOk,
    lastTestMessage: row.lastTestMessage,
  };
}

class SmtpInputError extends Error { constructor(m) { super(m); this.status = 400; } }

/** Applies a PUT body to the config row. Password: set if non-empty, cleared if clearPassword, else kept. */
async function updateConfig(organizationId, body) {
  const b = body || {};
  const row = await getOrCreateConfigRow(organizationId);
  if (b.security !== undefined && !['SSL', 'STARTTLS', 'NONE'].includes(b.security)) {
    throw new SmtpInputError("security must be 'SSL', 'STARTTLS' or 'NONE'");
  }
  if (b.port !== undefined && b.port !== '' && b.port !== null) {
    const p = Number(b.port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) throw new SmtpInputError('port must be 1–65535');
    row.port = p;
  }
  const emailish = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  if (b.fromEmail !== undefined && !emailish(b.fromEmail)) throw new SmtpInputError('From address is not a valid email');
  if (b.replyTo !== undefined && !emailish(b.replyTo)) throw new SmtpInputError('Reply-to is not a valid email');

  for (const k of ['host', 'username', 'fromName', 'fromEmail', 'replyTo']) {
    if (b[k] !== undefined) row[k] = String(b[k] || '').trim() || null;
  }
  if (b.security !== undefined) row.security = b.security;
  if (b.enabled !== undefined) row.enabled = !!b.enabled;
  if (b.clearPassword) row.passwordEnc = null;
  else if (b.password) row.passwordEnc = secretBox.encrypt(b.password);

  if (row.enabled && (!row.host || !row.fromEmail)) {
    throw new SmtpInputError('To enable SMTP, the server host and From address are required.');
  }
  await row.save();
  return row;
}

function transportFor(row) {
  let password = null;
  if (row.passwordEnc) {
    try { password = secretBox.decrypt(row.passwordEnc); } catch (e) {
      throw new Error('Stored SMTP password could not be decrypted (was JWT_SECRET changed?). Re-enter the password.');
    }
  }
  return nodemailer.createTransport({
    host: row.host,
    port: row.port || (row.security === 'SSL' ? 465 : 587),
    secure: row.security === 'SSL',
    requireTLS: row.security === 'STARTTLS',
    ignoreTLS: row.security === 'NONE',
    auth: row.username ? { user: row.username, pass: password || '' } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
}

function fromHeader(row, fallbackName) {
  const name = (row.fromName || fallbackName || '').replace(/"/g, '');
  return name ? `"${name}" <${row.fromEmail}>` : row.fromEmail;
}

/** Picks the SMTP row to use for mail concerning `organizationId` (null = platform). */
async function resolve(organizationId) {
  if (organizationId) {
    const own = await getConfigRow(organizationId);
    if (isUsable(own)) return { row: own, via: 'ORGANISATION' };
  }
  const platform = await getConfigRow(null);
  if (isUsable(platform)) return { row: platform, via: 'PLATFORM' };
  return null;
}

/**
 * Sends a message. Never throws — returns { sent, via, error } so callers
 * can report "user created, but the welcome email failed" instead of
 * failing the whole action.
 */
async function sendMail({ organizationId, to, subject, text, html, attachments }) {
  try {
    const chosen = await resolve(organizationId);
    if (!chosen) return { sent: false, via: null, error: 'No SMTP server is configured.' };
    const settings = await getPlatformSettings();
    let senderName = settings.platformName;
    if (chosen.via === 'ORGANISATION') {
      const org = await Organization.findByPk(organizationId, { attributes: ['name', 'shortName'] });
      if (org) senderName = org.shortName || org.name;
    }
    const info = await transportFor(chosen.row).sendMail({
      from: fromHeader(chosen.row, senderName),
      replyTo: chosen.row.replyTo || undefined,
      to, subject, text, html, attachments,
    });
    return { sent: true, via: chosen.via, messageId: info.messageId };
  } catch (err) {
    console.error(`[mail] send to ${to} failed: ${err.message}`);
    return { sent: false, via: null, error: err.message };
  }
}

/** Sends a test message through exactly this scope's saved settings and records the outcome. */
async function testConfig(organizationId, to) {
  const row = await getConfigRow(organizationId);
  if (!row || !row.host || !row.fromEmail) {
    return { ok: false, message: 'Save a host and From address first.' };
  }
  let ok = false;
  let message;
  try {
    const t = transportFor(row);
    await t.verify();
    await t.sendMail({
      from: fromHeader(row, 'UCB HRMS'),
      replyTo: row.replyTo || undefined,
      to,
      subject: 'UCB HRMS — SMTP test message',
      text: `This is a test message confirming that outgoing mail works with these settings:\n\n` +
            `Server: ${row.host}:${row.port} (${row.security})\nFrom: ${row.fromEmail}\n\nNo action is needed.`,
    });
    ok = true;
    message = `Test message sent to ${to}.`;
  } catch (err) {
    message = err.message.slice(0, 480);
  }
  row.lastTestAt = new Date();
  row.lastTestOk = ok;
  row.lastTestMessage = message;
  await row.save();
  return { ok, message };
}

// ------------------------------------------------------------------ content

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function wrapHtml(title, paragraphs) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;max-width:560px">' +
    `<h2 style="font-size:18px;color:#0f4c5c">${escapeHtml(title)}</h2>` +
    paragraphs.join('') +
    '<p style="color:#6b7280;font-size:12px;margin-top:24px">This is an automated message from UCB HRMS &amp; Payroll. Please do not share your password with anyone, including support staff.</p>' +
    '</div>';
}

function welcomeEmail({ name, email, tempPassword, loginUrl, orgName }) {
  const where = orgName ? ` for ${orgName}` : '';
  return {
    subject: `Your UCB HRMS account${where}`,
    text:
      `Hello ${name},\n\nAn account has been created for you${where}.\n\n` +
      `Sign in at: ${loginUrl}\nEmail: ${email}\nTemporary password: ${tempPassword}\n\n` +
      'You will be asked to choose your own password when you first sign in.\n',
    html: wrapHtml('Your account is ready', [
      `<p>Hello ${escapeHtml(name)},</p>`,
      `<p>An account has been created for you${escapeHtml(where)}.</p>`,
      `<p><strong>Sign in at:</strong> <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a><br>` +
      `<strong>Email:</strong> ${escapeHtml(email)}<br>` +
      `<strong>Temporary password:</strong> <code style="font-size:15px">${escapeHtml(tempPassword)}</code></p>`,
      '<p>You will be asked to choose your own password when you first sign in.</p>',
    ]),
  };
}

function resetEmail({ name, resetUrl }) {
  return {
    subject: 'Reset your UCB HRMS password',
    text:
      `Hello ${name},\n\nA password reset was requested for your account. Open this link within 30 minutes to choose a new password:\n\n${resetUrl}\n\n` +
      'If you did not request this, ignore this email — your password has not been changed.\n',
    html: wrapHtml('Reset your password', [
      `<p>Hello ${escapeHtml(name)},</p>`,
      '<p>A password reset was requested for your account. Open this link within 30 minutes to choose a new password:</p>',
      `<p><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p>`,
      '<p>If you did not request this, ignore this email — your password has not been changed.</p>',
    ]),
  };
}

module.exports = {
  getConfigRow, updateConfig, publicView, testConfig, sendMail, resolve,
  welcomeEmail, resetEmail, SmtpInputError,
};
