'use strict';

/**
 * Shared "is this tenant currently allowed in" check — used at login (so a
 * suspended/expired bank gets a clear message instead of a working token)
 * and on every subsequent authenticated request (so suspending a bank mid-
 * session actually cuts it off, not just blocks new logins).
 *
 * SUPER_ADMIN has no organization and is never subject to this.
 */

/** Today as 'YYYY-MM-DD' in India time — licence dates are Indian calendar dates. */
function todayIST() {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function daysBetween(fromYmd, toYmd) {
  const a = Date.UTC(+fromYmd.slice(0, 4), +fromYmd.slice(5, 7) - 1, +fromYmd.slice(8, 10));
  const b = Date.UTC(+toYmd.slice(0, 4), +toYmd.slice(5, 7) - 1, +toYmd.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

function checkOrgAccess(org) {
  if (!org) {
    return { ok: false, code: 'ORG_NOT_FOUND', message: 'Organisation not found.' };
  }
  if (org.status !== 'ACTIVE') {
    return {
      ok: false,
      code: 'ORG_SUSPENDED',
      message: "This organisation's access has been suspended by the platform administrator.",
    };
  }
  const today = todayIST();
  // DATEONLY comes back as 'YYYY-MM-DD'; compare as calendar dates, not
  // instants, so the licence stays valid through its whole expiry day.
  if (org.licenseStartsAt && String(org.licenseStartsAt) > today) {
    return {
      ok: false,
      code: 'ORG_LICENSE_NOT_STARTED',
      message: `This organisation's licence starts on ${org.licenseStartsAt}.`,
    };
  }
  if (org.licenseExpiresAt && String(org.licenseExpiresAt) < today) {
    return {
      ok: false,
      code: 'ORG_LICENSE_EXPIRED',
      message: `This organisation's licence expired on ${org.licenseExpiresAt}. Contact Banihal Technologies to renew.`,
    };
  }
  return { ok: true };
}

/** Summary the UI shows (banner/badges). Safe to send to the org's own users. */
function licenseSummary(org) {
  if (!org) return null;
  const today = todayIST();
  const access = checkOrgAccess(org);
  return {
    plan: org.licensePlan || null,
    startsAt: org.licenseStartsAt || null,
    expiresAt: org.licenseExpiresAt || null,
    daysLeft: org.licenseExpiresAt ? daysBetween(today, String(org.licenseExpiresAt)) : null,
    maxUsers: org.maxUsers == null ? null : org.maxUsers,
    maxEmployees: org.maxEmployees == null ? null : org.maxEmployees,
    state: access.ok ? 'ACTIVE' : access.code,
  };
}

module.exports = { checkOrgAccess, licenseSummary, todayIST, daysBetween };
