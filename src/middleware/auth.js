'use strict';

const { verifyToken } = require('../services/authService');
const { checkOrgAccess } = require('../services/orgAccess');
const { User, Organization } = require('../models');

/**
 * Verifies the Bearer token and attaches req.user = { id, role, organizationId }.
 * Re-loads the user row (rather than trusting the token's claims blindly) so
 * a deactivated user is rejected immediately rather than at next token expiry.
 *
 * Also re-checks the user's organization on every request (not just at
 * login): if a Super Admin suspends a bank or its license lapses mid-
 * session, existing tokens stop working on the very next call instead of
 * staying valid until they expire. verifyToken() itself rejects an MFA
 * challenge token here (wrong `typ`), so a leaked mid-login token can't be
 * replayed as a Bearer token.
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ status: 'error', message: 'Missing or malformed Authorization header (expected: Bearer <token>)' });
  }
  try {
    const payload = verifyToken(token);
    const user = await User.findByPk(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ status: 'error', message: 'User not found or inactive' });
    }
    if (user.organizationId) {
      const org = await Organization.findByPk(user.organizationId);
      const access = checkOrgAccess(org);
      if (!access.ok) {
        return res.status(403).json({ status: 'error', code: access.code, message: access.message });
      }
    }
    req.user = { id: user.id, role: user.role, organizationId: user.organizationId, email: user.email, name: user.name };
    next();
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid or expired token' });
  }
}

/** Restricts a route to one or more roles. Use after `authenticate`. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ status: 'error', message: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

/**
 * Enforces tenant isolation on an org-scoped route. SUPER_ADMIN may act on
 * any organization (and must specify which one via the resolver). Every
 * other role is pinned to their own organizationId regardless of what the
 * request claims — this is what makes the org-scoping real rather than
 * advisory.
 *
 * @param {(req) => number|string|undefined} resolveRequestedOrgId - pulls the
 *   organization id the request is asking about, from params/query/body.
 */
function requireOwnOrg(resolveRequestedOrgId) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    const requested = resolveRequestedOrgId(req);
    if (req.user.role === 'SUPER_ADMIN') {
      if (!requested) {
        return res.status(400).json({ status: 'error', message: 'SUPER_ADMIN must specify which organization (organizationId) this request is for' });
      }
      return next();
    }
    if (requested && String(requested) !== String(req.user.organizationId)) {
      return res.status(403).json({ status: 'error', message: 'Cannot access another organization\'s data' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, requireOwnOrg };
