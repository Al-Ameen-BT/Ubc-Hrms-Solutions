'use strict';
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const models = require('../models');
const structure = require('../services/organizationStructure');
const { organizationChart, photoHandler } = require('../services/organizationChart');
const workbook = require('../services/branchWorkbook');
const structureWorkbook = require('../services/structureWorkbook');
const lifecycle = require('../services/organizationLifecycle');
const { scopedWhere } = require('../services/accessControl');
const { inputShape, tenantResource, sendError, UserAdminError } = require('../services/userAdmin');
const router = express.Router(), legacy = express.Router();
const fields = {
  branches: ['number', 'code', 'branchCode', 'name', 'address', 'phone', 'unitType', 'isHeadOffice', 'status', 'displayOrder'],
  departments: ['code', 'name', 'branchId', 'status', 'displayOrder'],
  positions: ['code', 'name', 'branchId', 'departmentId', 'postCadreId', 'reportsToPositionId', 'capacity', 'leadershipVisible', 'status', 'displayOrder'],
  assignments: ['employeeId', 'branchId', 'departmentId', 'positionId', 'effectiveFrom', 'effectiveTo'],
  responsibilities: ['employeeId', 'userId', 'responsibility', 'scopeType', 'branchId', 'effectiveFrom', 'effectiveTo'],
};
const refs = { branchId: 'OrganizationBranch', departmentId: 'OrganizationDepartment', positionId: 'OrganizationPosition', reportsToPositionId: 'OrganizationPosition', postCadreId: 'PostCadre', employeeId: 'Employee', userId: 'User' };
const columns = {
  branches: ['id', 'number', 'code', 'name', 'address', 'phone', 'unitType', 'isHeadOffice', 'status', 'displayOrder'],
  departments: ['id', 'code', 'name', 'branchId', 'status', 'displayOrder'],
  positions: ['id', 'code', 'name', 'branchId', 'departmentId', 'postCadreId', 'reportsToPositionId', 'capacity', 'leadershipVisible', 'status', 'displayOrder'],
  assignments: ['id', 'employeeId', 'branchId', 'departmentId', 'positionId', 'effectiveFrom', 'effectiveTo', 'status'],
  responsibilities: ['id', 'employeeId', 'userId', 'responsibility', 'scopeType', 'branchId', 'effectiveFrom', 'effectiveTo', 'status'],
};
const safe = (row, group) => Object.fromEntries(columns[group].map(key => [key, row[key]]));
const handle = (work, status = 200) => async (req, res) => { try { const data = await work(req); if (!res.headersSent) res.status(status).json({ data }); } catch (error) { sendError(res, error); } };
function boundary(group, Model) {
  return async (req, res, next) => {
    try {
      if (req.params.id) await tenantResource(Model, req.params.id, req.user.organizationId);
      if (req.method !== 'GET' && req.method !== 'DELETE') {
        inputShape(req.body || {}, fields[group]);
        for (const [key, type] of Object.entries(refs)) if (req.body?.[key] != null) await tenantResource(models[type], req.body[key], req.user.organizationId);
      }
      next();
    } catch (error) { sendError(res, error); }
  };
}
router.use(authenticate); legacy.use(authenticate);
router.get('/chart', requirePermission('chart.view'), handle(req => organizationChart({
  actor: req.user,
  at: req.query.at,
  view: req.query.view,
  branchId: req.query.branchId,
  departmentId: req.query.departmentId,
  level: req.query.level,
})));
router.get('/branch-options', requirePermission('people.create'), handle(req => structure.branchOptions(req.access)));
router.get('/position-options', requirePermission('people.create'), handle(req => structure.onboardingPositionOptions(req.access, { branchId: req.query.branchId, departmentId: req.query.departmentId })));
router.get('/board/:id/photo', requirePermission('chart.view'), photoHandler('board'));
router.post('/head-office', requirePermission('branches.manage'), boundary('branches', models.OrganizationBranch), handle(async req => safe(await structure.configureHeadOffice({ organizationId: req.user.organizationId, actor: req.user, data: req.body }), 'branches'), 201));
router.post('/departments/:id/archive', requirePermission('departments.manage'), handle(req => lifecycle.archiveDepartment({ organizationId: req.user.organizationId, actor: req.user, departmentId: req.params.id, effectiveDate: req.body?.effectiveDate })));
router.post('/branches/merge/preview', requirePermission('branches.manage'), handle(req => lifecycle.previewBranchMerge({ organizationId: req.user.organizationId, actor: req.user, sourceBranchId: req.body?.sourceBranchId, destinationBranchId: req.body?.destinationBranchId })));
router.post('/branches/merge/apply', requirePermission('branches.manage'), handle(req => lifecycle.mergeBranch({ organizationId: req.user.organizationId, actor: req.user, sourceBranchId: req.body?.sourceBranchId, destinationBranchId: req.body?.destinationBranchId, departmentMappings: req.body?.departmentMappings, positionMappings: req.body?.positionMappings, geofenceAction: req.body?.geofenceAction, effectiveDate: req.body?.effectiveDate })));
router.post('/branches/:id/retire', requirePermission('branches.manage'), handle(req => lifecycle.retireBranch({ organizationId: req.user.organizationId, actor: req.user, branchId: req.params.id, destinationBranchId: req.body?.destinationBranchId, useStandalone: req.body?.useStandalone === true, effectiveDate: req.body?.effectiveDate })));
router.get('/branches/import/template', requirePermission('branches.manage'), async (req, res) => {
  try { res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('branches.xlsx').send(await workbook.writeBranchTemplate()); } catch (error) { sendError(res, error); }
});
router.post('/branches/import/preview', requirePermission('branches.manage'), (req, res, next) => {
  if (!req.is('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) return res.status(415).json({ status: 'error', message: 'Upload an .xlsx workbook' });
  express.raw({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', limit: 2 * 1024 * 1024 })(req, res, error => error ? sendError(res, error) : next());
}, handle(async req => {
  if (!Buffer.isBuffer(req.body) || req.body.length > 2 * 1024 * 1024) throw new UserAdminError(400, 'Upload an .xlsx workbook buffer');
  return workbook.previewBranchWorkbook(req.body, req.user.organizationId);
}));
router.post('/branches/import/apply', requirePermission('branches.manage'), handle(async req => {
  inputShape(req.body || {}, ['rows', 'errors', 'previewSignature']);
  const created = await workbook.applyBranchWorkbook(req.body, req.user);
  return created.map(row => safe(row, 'branches'));
}, 201));
router.get('/branches/export', requirePermission('branches.view'), async (req, res) => {
  try { res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('branches-export.xlsx').send(await structureWorkbook.exportStructureWorkbook('branches', req.user.organizationId)); } catch (error) { sendError(res, error); }
});
for (const [entity, cfg] of Object.entries(structureWorkbook.ENTITY_CONFIG)) {
  const viewPerm = entity === 'staffing' || entity === 'responsibilities' ? 'assignments.view' : `${entity}.view`;
  router.get(`/${entity}/export`, requirePermission(viewPerm), async (req, res) => {
    try { res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(`${entity}-export.xlsx`).send(await structureWorkbook.exportStructureWorkbook(entity, req.user.organizationId)); } catch (error) { sendError(res, error); }
  });
  router.get(`/${entity}/import/template`, requirePermission(cfg.permission), async (req, res) => {
    try { res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(cfg.filename).send(await structureWorkbook.writeStructureTemplate(entity)); } catch (error) { sendError(res, error); }
  });
  router.post(`/${entity}/import/preview`, requirePermission(cfg.permission), (req, res, next) => {
    if (!req.is('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) return res.status(415).json({ status: 'error', message: 'Upload an .xlsx workbook' });
    express.raw({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', limit: 2 * 1024 * 1024 })(req, res, error => error ? sendError(res, error) : next());
  }, handle(async req => {
    if (!Buffer.isBuffer(req.body) || req.body.length > 2 * 1024 * 1024) throw new UserAdminError(400, 'Upload an .xlsx workbook buffer');
    return structureWorkbook.previewStructureWorkbook(entity, req.body, req.user);
  }));
  router.post(`/${entity}/import/apply`, requirePermission(cfg.permission), handle(async req => {
    const outGroup = entity === 'staffing' ? 'assignments' : entity;
    const created = await structureWorkbook.applyStructureWorkbook(entity, req.body, req.user);
    return created.map(row => safe(row, outGroup));
  }, 201));
}
for (const [group, modelName, singular] of [['branches', 'OrganizationBranch', 'Branch'], ['departments', 'OrganizationDepartment', 'Department'], ['positions', 'OrganizationPosition', 'Position'], ['assignments', 'EmployeeOrganizationAssignment', 'EmployeeOrganization'], ['responsibilities', 'OrganizationResponsibilityAssignment', 'Responsibility']]) {
  const Model = models[modelName], permission = group === 'responsibilities' ? 'assignments' : group;
  const mount = (target, path) => {
    target.get(path, requirePermission(`${permission}.view`), handle(async req => (await Model.findAll({ where: scopedWhere(req.access, `${permission}.view`, modelName), attributes: columns[group], order: [['id', 'ASC']] })).map(row => safe(row, group))));
    const create = group === 'assignments' ? structure.assignEmployeeOrganization : group === 'responsibilities' ? structure.assignResponsibility : structure[`create${singular}`];
    target.post(path, requirePermission(`${permission}.manage`), boundary(group, Model), handle(async req => safe(await create({ organizationId: req.user.organizationId, actor: req.user, data: req.body }), group), 201));
    if (['assignments', 'responsibilities'].includes(group)) return;
    target.put(`${path}/:id`, requirePermission(`${permission}.manage`), boundary(group, Model), handle(async req => safe(await structure[`update${singular}`]({ organizationId: req.user.organizationId, actor: req.user, id: req.params.id, data: req.body }), group)));
    target.delete(`${path}/:id`, requirePermission(`${permission}.manage`), boundary(group, Model), handle(async req => safe(await structure[`deactivate${singular}`]({ organizationId: req.user.organizationId, actor: req.user, id: req.params.id }), group)));
  };
  mount(router, `/${group}`);
  if (group === 'branches') mount(legacy, '/profile/branches');
}
module.exports = router;
module.exports.legacy = legacy;
