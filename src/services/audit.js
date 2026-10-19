'use strict';

const { AuditLog } = require('../models');

function clientIp(req) {
  return (req && (req.ip || (req.socket && req.socket.remoteAddress))) || null;
}

/**
 * Records one audit event. Never throws and never blocks the response on
 * failure — a broken audit write must not turn a successful user action
 * into an error — but it does log loudly, since a silent gap in the audit
 * trail is itself a finding.
 *
 * @param {object} req - Express request (actor + IP are taken from it)
 * @param {string} action - e.g. 'auth.login', 'org.license.update'
 * @param {object} [opts]
 * @param {number|null} [opts.organizationId] - tenant concerned; defaults to the actor's own
 * @param {object} [opts.actor] - override actor {id, email} (e.g. before req.user exists, at login)
 */
async function audit(req, action, opts = {}) {
  try {
    const actor = opts.actor || (req && req.user) || {};
    const organizationId = opts.organizationId !== undefined
      ? opts.organizationId
      : (actor.organizationId !== undefined ? actor.organizationId : null);
    await AuditLog.create({
      organizationId: organizationId || null,
      actorUserId: actor.id || null,
      actorEmail: actor.email || null,
      action,
      targetType: opts.targetType || null,
      targetId: opts.targetId != null ? String(opts.targetId) : null,
      details: opts.details || null,
      ip: clientIp(req),
    });
  } catch (err) {
    console.error(`[audit] FAILED to record "${action}": ${err.message}`);
  }
}

/**
 * Page-based listing for the audit trail (Super Admin's platform-wide view
 * and an Org Admin's own-organisation view both call this with their own
 * `where`). Real page numbers rather than an infinite "load more", so the
 * UI can show "Page 3 of 41" and jump straight to the oldest page — useful
 * once the retention window (services/auditRetention.js) is the only thing
 * bounding how far back the trail goes.
 *
 * @param {object} where - base Sequelize where-clause (org/action filters already applied)
 * @param {object} query - the request's query params: page (1-based), pageSize (max 200)
 */
async function auditPage(where, query = {}) {
  const pageSize = Math.min(Math.max(Number(query.pageSize) || 50, 1), 200);
  const page = Math.max(Number(query.page) || 1, 1);
  const { rows, count } = await AuditLog.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return { data: rows, page, pageSize, total: count, totalPages: Math.max(Math.ceil(count / pageSize), 1) };
}

module.exports = { audit, auditPage };
