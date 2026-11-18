'use strict';

/**
 * DPDP acknowledgement gate middleware.
 *
 * `requireDpdpCurrent`:
 * Rejects requests with 403 { code: 'DPDP_ACKNOWLEDGEMENT_REQUIRED' } if
 * the token is compliance-limited (i.e. req.user?.dpdpPending is true),
 * unless the route was explicitly marked with `allowDpdpPending`.
 *
 * `allowDpdpPending`:
 * Marks a route/handler to permit access even when req.user.dpdpPending is true
 * (e.g. GET /me/dpdp, POST /me/dpdp/acknowledge, sign-out, password change).
 */

const dpdpAllowlist = new WeakSet();

function allowDpdpPending(handler) {
  dpdpAllowlist.add(handler);
  return handler;
}

function isDpdpPendingAllowed(req) {
  return req._allowDpdpPending === true;
}

function markDpdpPendingAllowed(req, res, next) {
  req._allowDpdpPending = true;
  next();
}

function requireDpdpCurrent(req, res, next) {
  if (req.user && req.user.dpdpPending && !req._allowDpdpPending) {
    return res.status(403).json({
      status: 'error',
      code: 'DPDP_ACKNOWLEDGEMENT_REQUIRED',
      message: 'DPDP compliance acknowledgement is required before proceeding.',
    });
  }
  next();
}

module.exports = {
  requireDpdpCurrent,
  allowDpdpPending,
  markDpdpPendingAllowed,
};
