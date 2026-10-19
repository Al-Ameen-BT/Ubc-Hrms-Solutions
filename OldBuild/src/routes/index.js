'use strict';

const express = require('express');
const crudRouter = require('./crudFactory');
const { PostCadre, GovernmentOrder, RuleReference, PayScale } = require('../models');

const router = express.Router();

// Public (no token): branding for the login pages.
router.use('/public', require('./public'));

// Sign-in, MFA, password reset.
router.use('/auth', require('./auth'));

// Super Admin platform administration.
router.use('/admin', require('./admin'));

// An Org Admin's own organisation settings.
router.use('/org', require('./orgSettings'));

// Org user management (Org Admin for own org; Super Admin for any).
router.use('/organizations/:orgId/users', require('./orgUsers'));

// ---------------------------------------------------------- master data
// All tenant-scoped via crudFactory. Default roles: read = every staff role
// except EMPLOYEE; write = ORG_ADMIN, HR_ADMIN (SUPER_ADMIN always).

router.use('/post-cadres', crudRouter(PostCadre, {
  fields: ['organizationId', 'code', 'name', 'cadre', 'cadreLevel', 'parentPostId', 'defaultPayScaleId', 'status'],
  softDeleteValue: 'INACTIVE',
  refs: { parentPostId: PostCadre, defaultPayScaleId: PayScale },
}));

// Uploaded scan for a GO — fixed sub-paths, mounted BEFORE the generic
// crudRouter below so they aren't swallowed by its /:id routes.
router.use('/government-orders', require('./governmentOrderDocuments'));

router.use('/government-orders', crudRouter(GovernmentOrder, {
  fields: ['organizationId', 'goNumber', 'goDate', 'issuingAuthority', 'subject', 'documentUrl', 'description', 'status'],
  softDeleteValue: 'SUPERSEDED',
}));

router.use('/ksr-rules', crudRouter(RuleReference, {
  fields: [
    'organizationId', 'ruleType', 'title', 'part', 'chapter', 'ruleNumber',
    'applicableEmployeeCategory', 'applicablePostCadreId', 'conditions', 'calculationMethod',
    'governmentOrderId', 'goNumber', 'goDate', 'issuingAuthority', 'documentUrl', 'description',
    'isVerified', 'status', 'effectiveFrom', 'effectiveTo',
  ],
  softDeleteValue: 'SUPERSEDED',
  refs: { applicablePostCadreId: PostCadre, governmentOrderId: GovernmentOrder },
}));

const payScales = require('./payScales');
router.use('/pay-revisions', payScales.revisions);
router.use('/pay-scales', payScales.scales);

router.use('/allowance-types', require('./allowanceTypes'));

// Leave Policy / Leave Management — see routes/leave.js
const leaveRoutes = require('./leave');
router.use('/leave-types', leaveRoutes.types);
router.use('/leave-applications', leaveRoutes.applications);
router.use('/employees', leaveRoutes.employeeLeave);

router.use('/employees', require('./serviceBook'));

router.use('/organizations/:orgId/payroll-runs', require('./payroll'));
router.use('/organizations/:orgId/year-end', require('./yearEnd'));

// DA Arrears Management — see routes/arrears.js
const arrearsRoutes = require('./arrears');
router.use('/da-revisions', arrearsRoutes.revisions);
router.use('/arrears-cases', arrearsRoutes.cases);

module.exports = router;
