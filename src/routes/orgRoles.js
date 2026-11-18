'use strict';
const express = require('express');
const { requirePermission } = require('../middleware/permissions');
const { authenticate } = require('../middleware/auth');
const users = require('../services/userAdmin');
const router = express.Router();
const options = req => ({ organizationId: req.user.organizationId, actor: req.user, id: req.params.id, userId: req.params.userId, data: req.body || {} });
const handle = (work, status = 200) => async (req, res) => { try { res.status(status).json({ data: await work(req) }); } catch (error) { users.sendError(res, error); } };
router.get('/roles/readiness', authenticate, requirePermission('roles.manage'), handle(req => users.previewAccessReadiness(options(req))));
router.post('/roles/activate', authenticate, requirePermission('roles.manage'), handle(req => {
  const data = users.inputShape(req.body || {}, ['accessControlMode']);
  if (data.accessControlMode !== undefined && data.accessControlMode !== 'PERMISSIONS') throw new users.UserAdminError(400, 'Permission mode activation is one-way');
  return users.activatePermissionMode(options(req));
}));
router.get('/roles', authenticate, requirePermission('roles.manage'), handle(req => users.listRoles(options(req))));
router.post('/roles', authenticate, requirePermission('roles.manage'), handle(req => users.writeRole(options(req)), 201));
router.get('/roles/catalogue', authenticate, requirePermission('roles.manage'), handle(() => { const { PERMISSIONS, ROLE_TEMPLATES } = require('../services/permissionCatalog'); return { permissions: PERMISSIONS, templates: ROLE_TEMPLATES }; }));
router.get('/roles/:id', authenticate, requirePermission('roles.manage'), handle(req => users.readRole(options(req))));
router.get('/roles/:id/impact', authenticate, requirePermission('roles.manage'), handle(req => users.previewRoleImpact(options(req))));
router.put('/roles/:id', authenticate, requirePermission('roles.manage'), handle(req => users.writeRole(options(req))));
router.put('/roles/:id/permissions', authenticate, requirePermission('roles.manage'), handle(req => { users.inputShape(req.body || {}, ['permissionCodes']); return users.writeRole(options(req)); }));
router.delete('/roles/:id', authenticate, requirePermission('roles.manage'), handle(req => users.writeRole({ ...options(req), data: { status: 'INACTIVE' } })));
router.get('/role-assignments', authenticate, requirePermission('roles.manage'), handle(req => users.listRoleAssignments({ ...options(req), userId: req.query.userId })));
router.post('/role-assignments', authenticate, requirePermission('roles.manage'), handle(req => users.changeRoleAssignment(options(req)), 201));
router.put('/role-assignments/:id', authenticate, requirePermission('roles.manage'), handle(req => users.changeRoleAssignment(options(req))));
router.delete('/role-assignments/:id', authenticate, requirePermission('roles.manage'), handle(req => users.changeRoleAssignment({ ...options(req), data: { status: 'INACTIVE' } })));
router.get('/access-preview/:userId', authenticate, requirePermission('roles.manage'), handle(req => users.previewUserAccess(options(req))));

const dpdpGovernance = require('../services/dpdpGovernance');
const { requireFeaturePermission } = require('../middleware/permissions');
const { DpdpOrganizationProfile } = require('../models');

router.get('/dpdp/readiness', authenticate, requireFeaturePermission('dpdp.view', ['ORG_ADMIN', 'DATA_PROTECTION_OFFICER']), handle(req => dpdpGovernance.readiness(req.user.organizationId)));
router.get('/dpdp/profile', authenticate, requireFeaturePermission('dpdp.view', ['ORG_ADMIN', 'DATA_PROTECTION_OFFICER']), handle(async req => DpdpOrganizationProfile.findOne({ where: { organizationId: req.user.organizationId } })));
router.put('/dpdp/profile', authenticate, requireFeaturePermission('settings.configure', ['ORG_ADMIN']), handle(req => dpdpGovernance.updateProfile({ organizationId: req.user.organizationId, actor: req.user, data: req.body || {} })));
router.post('/dpdp/dpo', authenticate, requireFeaturePermission('settings.configure', ['ORG_ADMIN']), handle(req => dpdpGovernance.assignDpo({ organizationId: req.user.organizationId, actor: req.user, userId: req.body?.userId, effectiveFrom: req.body?.effectiveFrom }), 201));

module.exports = router;
