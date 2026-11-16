'use strict';
const express = require('express');
const models = require('../models');
const { authenticate } = require('../middleware/auth');
const { requireAnyPermission, requirePermission } = require('../middleware/permissions');
const transfers = require('../services/employeeTransfers');
const { scopedWhere, can } = require('../services/accessControl');
const { inputShape, tenantResource, sendError, UserAdminError } = require('../services/userAdmin');
const router = express.Router(); router.use(authenticate);
const attributes = ['id', 'employeeId', 'branchId', 'departmentId', 'positionId', 'compensationProposalId', 'effectiveDate', 'reason', 'status', 'preparedBy', 'decidedBy', 'decidedAt', 'decisionReason', 'activatedAt'];
const safe = row => Object.fromEntries(attributes.map(key => [key, row[key]]));
const handle = (work, status = 200) => async (req, res) => { try { res.status(status).json({ data: await work(req) }); } catch (error) { sendError(res, error); } };
async function load(req, res, next) { try { req.transfer = await tenantResource(models.EmployeeTransfer, req.params.id, req.user.organizationId); next(); } catch (error) { sendError(res, error); } }
router.get('/', requirePermission('transfers.view'), handle(async req => (await models.EmployeeTransfer.findAll({ where: scopedWhere(req.access, 'transfers.view', 'EmployeeTransfer'), attributes, order: [['id', 'DESC']] })).map(safe)));
router.post('/', requirePermission('transfers.manage'), handle(async req => {
  const body = inputShape(req.body || {}, ['employeeId', 'branchId', 'departmentId', 'positionId', 'effectiveDate', 'reason', 'compensation', 'compensationProposalId', 'roleChanges']);
  for (const [key, type] of [['employeeId', 'Employee'], ['branchId', 'OrganizationBranch'], ['departmentId', 'OrganizationDepartment'], ['positionId', 'OrganizationPosition'], ['compensationProposalId', 'EmployeeCompensationAssignment']]) if (body[key] != null) await tenantResource(models[type], body[key], req.user.organizationId);
  if (body.roleChanges && typeof body.roleChanges === 'object') {
    for (const key of ['closeAssignmentIds', 'retainAssignmentIds']) if (Array.isArray(body.roleChanges[key])) for (const id of body.roleChanges[key]) await tenantResource(models.UserRoleAssignment, id, req.user.organizationId);
    if (Array.isArray(body.roleChanges.start)) for (const start of body.roleChanges.start) {
      if (start?.roleId != null) await tenantResource(models.OrganizationRole, start.roleId, req.user.organizationId);
      for (const [key, type] of [['branchIds', 'OrganizationBranch'], ['departmentIds', 'OrganizationDepartment']]) if (Array.isArray(start?.[key])) for (const id of start[key]) await tenantResource(models[type], id, req.user.organizationId);
    }
  }
  return safe(await transfers.proposeTransfer({ ...body, organizationId: req.user.organizationId }, req.user));
}, 201));
router.get('/:id', load, requirePermission('transfers.view'), handle(req => {
  if (!can(req.access, 'transfers.view', req.transfer)) throw new UserAdminError(403, 'Permission denied');
  return safe(req.transfer);
}));
for (const decision of ['approve', 'reject']) router.post(`/:id/${decision}`, load, requireAnyPermission('transfers.manage', 'compensation.approve'), handle(async req => {
  inputShape(req.body || {}, ['reason']);
  if (req.body?.reason !== undefined && (typeof req.body.reason !== 'string' || req.body.reason.length > 500)) throw new UserAdminError(400, 'Reason must be at most 500 characters');
  return safe(await transfers[`${decision}Transfer`](req.transfer.id, { ...req.user, decisionReason: req.body?.reason }));
}));
module.exports = router;
