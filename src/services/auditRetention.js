'use strict';

/**
 * Audit log retention — audit_log is append-only (see models/auditLog.js),
 * so the only way rows ever leave it is this purge: anything older than
 * the platform's configured retention window (PlatformSetting.
 * auditRetentionDays, default 180) is deleted, and once deleted that
 * space is free for new rows to occupy — the "overwrite after retention"
 * behaviour the retention setting exists to describe. Applies platform-
 * wide (one retention window for every organisation's audit trail, not a
 * per-bank setting), since retention is a platform compliance/storage
 * policy set by Banihal, not something each bank tunes for itself.
 */

const { AuditLog } = require('../models');
const { getPlatformSettings } = require('./settings');
const { Op } = require('sequelize');

/** Deletes every audit_log row older than the configured retention window. Returns how many were removed. */
async function purgeExpiredAuditLogs() {
  const settings = await getPlatformSettings();
  const days = Number(settings.auditRetentionDays) > 0 ? Number(settings.auditRetentionDays) : 180;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const deleted = await AuditLog.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
  return { days, cutoff, deleted };
}

/** Starts a daily background purge. Best-effort — a failure is logged, never fatal to the server. */
function scheduleDailyPurge() {
  const run = () => {
    purgeExpiredAuditLogs()
      .then(({ deleted, days }) => { if (deleted) console.log(`[audit] retention purge: removed ${deleted} row(s) older than ${days} day(s).`); })
      .catch((err) => console.error(`[audit] retention purge failed: ${err.message}`));
  };
  run(); // once at boot, so a long-lived server also catches up immediately
  return setInterval(run, 24 * 60 * 60 * 1000);
}

module.exports = { purgeExpiredAuditLogs, scheduleDailyPurge };
