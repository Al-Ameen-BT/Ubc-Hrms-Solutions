'use strict';
const { effectiveAccess, can, resourceModel } = require('../services/accessControl');
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

// Resolvers provide { resourceType: Sequelize model name, id }; reload inside the tenant.
function requirePermission(code, resolveResource) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    try {
      const access = await effectiveAccess(req.user.id);
      if (!sameId(access.organizationId, req.user.organizationId) || !can(access, code)) return res.status(403).json({ status: 'error', message: 'Permission denied' });
      req.access = access;
      if (resolveResource) {
        const target = await resolveResource(req);
        const model = target && resourceModel(target.resourceType);
        const resource = model && target.id != null && await model.findOne({ where: { id: target.id, organizationId: access.organizationId } });
        if (!resource) return res.status(404).json({ status: 'error', message: 'Resource not found' });
        if (!can(access, code, resource)) return res.status(403).json({ status: 'error', message: 'Permission denied' });
        req.permissionResource = resource;
      }
      next();
    } catch (error) { next(error); }
  };
}
function requireAnyPermission(...codes) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    try {
      const access = await effectiveAccess(req.user.id);
      if (!sameId(access.organizationId, req.user.organizationId) || !codes.some(code => can(access, code))) return res.status(403).json({ status: 'error', message: 'Permission denied' });
      req.access = access;
      next();
    } catch (error) { next(error); }
  };
}
module.exports = { requirePermission, requireAnyPermission };
