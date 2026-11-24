'use strict';
const { Op } = require('sequelize');
const { effectiveAccess, can, resourceModel, scopedWhere, tenantWhere } = require('../services/accessControl');
const permissionGuards = new WeakSet();
const isPermissionMiddleware = handler => permissionGuards.has(handler);
const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const resource = (resourceType, key = 'id', source = 'params') => req => ({ resourceType, id: req[source]?.[key] });

function permissionMiddleware(codes, resolveResource, legacyRoles) {
  const middleware = async (req, res, next) => {
    if (!req.user) return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    try {
      // A legacy platform path remains explicit; platform identities never gain tenant grants.
      const platform = req.user.role === 'SUPER_ADMIN' && legacyRoles?.includes('SUPER_ADMIN');
      let access = platform ? null : await effectiveAccess(req.user.id, undefined, undefined, req.user.accessVersion);
      const legacy = platform || access?.accessControlMode === 'LEGACY' && legacyRoles;
      const allowed = legacy ? legacyRoles.includes(req.user.role) && (!access?.bootstrapRestricted || codes.some(code => can(access, code))) : sameId(access?.organizationId, req.user.organizationId) && codes.some(code => can(access, code));
      if (!allowed) return res.status(403).json({ status: 'error', message: 'Permission denied' });
      if (!platform && req.params.orgId != null && !sameId(req.params.orgId, access.organizationId)) return res.status(403).json({ status: 'error', message: 'Permission denied' });
      if (legacy && !platform) {
        access = { ...access, grants: codes.map(action => ({ action, scope: 'ORGANISATION', branchIds: [], departmentIds: [] })) };
      }
      req.access = access;
      req.permissionCode = codes.find(code => legacy || can(access, code));
      if (resolveResource) {
        const target = await resolveResource(req);
        const model = target && resourceModel(target.resourceType);
        const row = model && target.id != null && await model.findOne({ where: { id: target.id, ...(platform ? {} : tenantWhere(access, target.resourceType)) } });
        if (!row) return res.status(404).json({ status: 'error', message: 'Resource not found' });
        if (!legacy) {
          let permitted = false;
          for (const code of codes) if (can(access, code) && await model.count({ where: { [Op.and]: [{ id: row.id }, scopedWhere(access, code, target.resourceType)] } })) { permitted = true; req.permissionCode = code; break; }
          if (!permitted) return res.status(403).json({ status: 'error', message: 'Permission denied' });
        }
        req.permissionResource = row;
      }
      next();
    } catch (error) { next(error); }
  };
  Object.defineProperty(middleware, 'authorization', { value: Object.freeze({ kind: 'permission', codes: Object.freeze([...codes]), resource: resolveResource || 'TENANT' }) });
  permissionGuards.add(middleware);
  return middleware;
}
function requirePermission(code, resolveResource) { return permissionMiddleware([code], resolveResource); }
function requireAnyPermission(...codes) { return permissionMiddleware(codes); }
// Route-specific legacy allowlists preserve exact parity only before one-way activation.
function requireFeaturePermission(codes, legacyRoles, resolveResource) {
  return permissionMiddleware(Array.isArray(codes) ? codes : [codes], resolveResource, legacyRoles);
}
module.exports = { isPermissionMiddleware, requirePermission, requireAnyPermission, requireFeaturePermission, resource };
