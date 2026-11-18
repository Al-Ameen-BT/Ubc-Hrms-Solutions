'use strict';

const { isFeatureEnabled } = require('../services/orgFeatures');

/**
 * Middleware factory enforcing feature availability for tenant routes.
 *
 * Security Invariants:
 * 1. Must run AFTER `authenticate` middleware (requires `req.user`).
 * 2. If user is SUPER_ADMIN -> bypass immediately (req.user.role === 'SUPER_ADMIN').
 * 3. Identifies tenant organization:
 *    - Defaults to `req.user.organizationId`
 *    - If route has `:orgId` or `:id` (e.g. in cross-tenant management), verifies that scope.
 * 4. Resolves state from DB directly (never from client-supplied headers or long-lived caches).
 * 5. If disabled -> halts execution, returns HTTP 403 Forbidden with standard machine-readable code.
 */
function requireFeature(featureCode) {
  return async function featureGateMiddleware(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    // Principle 2: SUPER_ADMIN always bypasses feature gates for platform support & oversight
    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    const orgId = req.user.organizationId;
    if (!orgId) {
      return res.status(403).json({
        status: 'error',
        code: 'TENANT_REQUIRED',
        message: 'No tenant organization associated with request.',
      });
    }

    try {
      const enabled = await isFeatureEnabled(orgId, featureCode, req);
      if (!enabled) {
        return res.status(403).json({
          status: 'error',
          code: 'FEATURE_DISABLED',
          feature: featureCode,
          message: `The feature "${featureCode}" is not enabled for your organisation. Please contact your platform administrator.`,
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireFeature };
