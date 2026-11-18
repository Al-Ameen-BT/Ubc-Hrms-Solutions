'use strict';

const express = require('express');
const { requireFeaturePermission } = require('../middleware/permissions');
const { authenticate } = require('../middleware/auth');
const dpdpDocuments = require('../services/dpdpDocuments');
const { sendError } = require('../services/userAdmin');

const router = express.Router();

// -------------------------------------------------------- Organisation Routes
// Mounted under /org/dpdp in index.js
router.use(authenticate);

// GET /api/v1/org/dpdp/documents
router.get(
  '/documents',
  requireFeaturePermission('dpdp.view', ['ORG_ADMIN', 'DATA_PROTECTION_OFFICER']),
  async (req, res) => {
    try {
      const list = await dpdpDocuments.listDocuments({
        ownerType: 'ORGANIZATION',
        organizationId: req.user.organizationId,
        type: req.query.type,
      });
      res.json({ data: list });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// POST /api/v1/org/dpdp/documents/publish
router.post(
  '/documents/publish',
  requireFeaturePermission('settings.configure', ['ORG_ADMIN']),
  async (req, res) => {
    try {
      const doc = await dpdpDocuments.publishDocument({
        ownerType: 'ORGANIZATION',
        organizationId: req.user.organizationId,
        type: req.body.type,
        title: req.body.title,
        body: req.body.body,
        version: req.body.version,
        summary: req.body.summary,
        effectiveAt: req.body.effectiveAt,
        actor: req.user,
      });
      res.status(201).json({ data: doc });
    } catch (err) {
      sendError(res, err);
    }
  }
);

const dpdpCases = require('../services/dpdpCases');

// GET /api/v1/org/dpdp/requests
router.get(
  '/requests',
  requireFeaturePermission('dpdp.view', ['ORG_ADMIN', 'DATA_PROTECTION_OFFICER']),
  async (req, res) => {
    try {
      const list = await dpdpCases.listOrgRequests({
        organizationId: req.user.organizationId,
        status: req.query.status,
        requestType: req.query.requestType,
      });
      res.json({ data: list });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// POST /api/v1/org/dpdp/requests/:id/decide
router.post(
  '/requests/:id/decide',
  requireFeaturePermission('dpdp.manage', ['ORG_ADMIN', 'DATA_PROTECTION_OFFICER']),
  async (req, res) => {
    try {
      const decided = await dpdpCases.decideRequest({
        actor: req.user,
        requestId: req.params.id,
        status: req.body.status,
        decisionReason: req.body.decisionReason,
        retentionReason: req.body.retentionReason,
        dpoResponse: req.body.dpoResponse,
      });
      res.json({ data: decided });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// GET /api/v1/org/dpdp/incidents
router.get(
  '/incidents',
  requireFeaturePermission('dpdp.view', ['ORG_ADMIN', 'DATA_PROTECTION_OFFICER']),
  async (req, res) => {
    try {
      const list = await dpdpCases.listIncidents({
        organizationId: req.user.organizationId,
        status: req.query.status,
        severity: req.query.severity,
      });
      res.json({ data: list });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// POST /api/v1/org/dpdp/incidents
router.post(
  '/incidents',
  requireFeaturePermission('dpdp.manage', ['ORG_ADMIN', 'DATA_PROTECTION_OFFICER']),
  async (req, res) => {
    try {
      const incident = await dpdpCases.createIncident({
        actor: req.user,
        title: req.body.title,
        severity: req.body.severity,
        affectedCategories: req.body.affectedCategories,
        affectedCount: req.body.affectedCount,
        discoveredAt: req.body.discoveredAt,
        summary: req.body.summary,
      });
      res.status(201).json({ data: incident });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// PUT /api/v1/org/dpdp/incidents/:id
router.put(
  '/incidents/:id',
  requireFeaturePermission('dpdp.manage', ['ORG_ADMIN', 'DATA_PROTECTION_OFFICER']),
  async (req, res) => {
    try {
      const incident = await dpdpCases.updateIncident({
        actor: req.user,
        incidentId: req.params.id,
        status: req.body.status,
        severity: req.body.severity,
        containedAt: req.body.containedAt,
        notifiedAt: req.body.notifiedAt,
        closedAt: req.body.closedAt,
        actionTaken: req.body.actionTaken,
        summary: req.body.summary,
      });
      res.json({ data: incident });
    } catch (err) {
      sendError(res, err);
    }
  }
);

const dpdpRetention = require('../services/dpdpRetention');

// GET /api/v1/org/dpdp/retention
router.get(
  '/retention',
  requireFeaturePermission('dpdp.manage', ['ORG_ADMIN', 'DATA_PROTECTION_OFFICER']),
  async (req, res) => {
    try {
      const organizationId = req.user.organizationId;
      const rules = await dpdpRetention.listRules({ organizationId });
      const candidates = await dpdpRetention.expiryCandidates({ organizationId });
      res.json({
        data: {
          rules,
          candidates,
          statutoryExcluded: dpdpRetention.STATUTORY_EXCLUDED_CATEGORIES,
          availableCategories: dpdpRetention.RETENTION_CATEGORIES,
        },
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// PUT /api/v1/org/dpdp/retention
router.put(
  '/retention',
  requireFeaturePermission('dpdp.manage', ['ORG_ADMIN', 'DATA_PROTECTION_OFFICER']),
  async (req, res) => {
    try {
      const organizationId = req.user.organizationId;
      const { category, periodMonths, legalHold, notes } = req.body || {};
      const rule = await dpdpRetention.upsertRule({
        organizationId,
        category,
        periodMonths,
        legalHold,
        notes,
        actor: req.user,
      });
      res.json({ data: rule });
    } catch (err) {
      sendError(res, err);
    }
  }
);

module.exports = router;
