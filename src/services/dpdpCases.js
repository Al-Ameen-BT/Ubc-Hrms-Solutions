'use strict';

const { Op } = require('sequelize');
const {
  sequelize,
  DpdpDataRequest,
  DpdpIncident,
  Employee,
  AuditLog,
  DpdpRequestEvent,
  DpdpNomination,
  DpdpProcessingActivity,
  DpdpSharingEvent,
} = require('../models');

const VALID_REQUEST_TYPES = ['ACCESS', 'DOWNLOAD', 'SHARING', 'CORRECTION', 'ERASURE', 'CONSENT_WITHDRAWAL', 'GRIEVANCE', 'NOMINATION'];
const VALID_REQUEST_STATUSES = ['SUBMITTED', 'IDENTITY_VERIFICATION', 'IN_REVIEW', 'ACTION_REQUIRED', 'COMPLETED', 'REJECTED'];
const VALID_INCIDENT_STATUSES = ['OPEN', 'CONTAINED', 'NOTIFIED', 'CLOSED'];
const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * Creates an employee DPDP data rights request.
 */
function dueDate(from, days) { const d = new Date(from); d.setUTCDate(d.getUTCDate() + Math.min(Math.max(Number(days) || 30, 1), 90)); return d; }

async function addRequestEvent(request, actor, eventType, fromStatus, toStatus, summary, transaction) {
  return DpdpRequestEvent.create({ organizationId: request.organizationId, requestId: request.id, eventType, fromStatus, toStatus, actorUserId: actor?.id || null, summary: summary || null }, { transaction });
}

async function createRequest({ actor, employee, requestType, details, submittedAt = new Date(), slaDays = 30 } = {}) {
  if (!actor || !actor.organizationId) {
    const err = new Error('Authenticated organization user is required.');
    err.status = 400;
    throw err;
  }
  if (!employee || !employee.id) {
    const err = new Error('Active linked employee record is required to submit a data request.');
    err.status = 400;
    throw err;
  }
  if (!VALID_REQUEST_TYPES.includes(requestType)) {
    const err = new Error(`Invalid requestType "${requestType}". Allowed: ${VALID_REQUEST_TYPES.join(', ')}.`);
    err.status = 400;
    throw err;
  }

  return sequelize.transaction(async (transaction) => {
    const createdAt = new Date(submittedAt);
    const req = await DpdpDataRequest.create({ organizationId: actor.organizationId, employeeId: employee.id, userId: actor.id, principalType: 'EMPLOYEE', principalReference: employee.empCode, principalName: employee.name, requestType, status: 'SUBMITTED', details: details ? String(details).trim() : null, dueAt: dueDate(createdAt, slaDays), createdAt }, { transaction });
    req.caseId = `DPDP-${String(actor.organizationId)}-${createdAt.getUTCFullYear()}-${req.id}`;
    await req.save({ transaction });
    await addRequestEvent(req, actor, 'SUBMITTED', null, 'SUBMITTED', null, transaction);
    await AuditLog.create({ action: 'dpdp.request.create', organizationId: actor.organizationId, actorUserId: actor.id, targetType: 'dpdp_data_request', targetId: req.id, details: { requestType, employeeId: employee.id, caseId: req.caseId } }, { transaction });
    return req;
  });
}

async function createAssistedRequest({ actor, principalType, principalReference, principalName, principalContact = null, requestType, details, slaDays = 30 } = {}) {
  if (!actor?.organizationId) throw Object.assign(new Error('Unauthorized.'), { status: 401 });
  if (!VALID_REQUEST_TYPES.includes(requestType)) throw Object.assign(new Error('Invalid requestType.'), { status: 400 });
  if (!principalType || principalType === 'EMPLOYEE' || !principalName) throw Object.assign(new Error('External principal type and name are required.'), { status: 400 });
  const createdAt = new Date();
  return sequelize.transaction(async (transaction) => {
    const req = await DpdpDataRequest.create({ organizationId: actor.organizationId, employeeId: null, userId: null, principalType, principalReference: principalReference || null, principalName: String(principalName).trim(), principalContact: principalContact || null, requestType, status: 'SUBMITTED', details: details || null, ownerUserId: actor.id, dueAt: dueDate(createdAt, slaDays), createdAt }, { transaction });
    req.caseId = `DPDP-${String(actor.organizationId)}-${createdAt.getUTCFullYear()}-${req.id}`;
    await req.save({ transaction });
    await addRequestEvent(req, actor, 'ASSISTED_INTAKE', null, 'SUBMITTED', null, transaction);
    return req;
  });
}

async function verifyRequestIdentity({ actor, requestId, method }) {
  const req = await DpdpDataRequest.findOne({ where: { id: requestId, organizationId: actor.organizationId } });
  if (!req) throw Object.assign(new Error('Request not found.'), { status: 404 });
  if (!method) throw Object.assign(new Error('Identity verification method is required.'), { status: 400 });
  req.identityVerifiedAt = new Date(); req.identityVerifiedBy = actor.id; req.identityVerificationMethod = String(method).trim();
  await req.save(); await addRequestEvent(req, actor, 'IDENTITY_VERIFIED', req.status, req.status, null); return req;
}

async function advanceRequest({ actor, requestId, status, summary = null }) {
  const req = await DpdpDataRequest.findOne({ where: { id: requestId, organizationId: actor.organizationId } });
  if (!req) throw Object.assign(new Error('Request not found.'), { status: 404 });
  if (!VALID_REQUEST_STATUSES.includes(status)) throw Object.assign(new Error('Invalid request status.'), { status: 400 });
  if (['COMPLETED', 'REJECTED'].includes(req.status)) throw Object.assign(new Error('Closed requests cannot be reopened.'), { status: 409 });
  if (status === 'IN_REVIEW' && !req.identityVerifiedAt) throw Object.assign(new Error('Identity verification is required before review.'), { status: 409 });
  const from = req.status; req.status = status; if (['COMPLETED', 'REJECTED'].includes(status)) req.closedAt = new Date(); await req.save(); await addRequestEvent(req, actor, 'STATUS_CHANGED', from, status, summary); return req;
}

async function submitNomination({ actor, employee, data = {} }) {
  if (!employee || employee.organizationId !== actor.organizationId) throw Object.assign(new Error('Active linked employee is required.'), { status: 409 });
  if (!data.nomineeName || !data.relationship || !data.contact) throw Object.assign(new Error('Nominee name, relationship and contact are required.'), { status: 400 });
  return sequelize.transaction(async (transaction) => {
    await DpdpNomination.update({ withdrawnAt: new Date() }, { where: { organizationId: actor.organizationId, employeeId: employee.id, withdrawnAt: null }, transaction });
    const row = await DpdpNomination.create({ organizationId: actor.organizationId, employeeId: employee.id, userId: actor.id, nomineeName: String(data.nomineeName).trim(), relationship: String(data.relationship).trim(), contact: String(data.contact).trim() }, { transaction });
    await AuditLog.create({ organizationId: actor.organizationId, actorUserId: actor.id, action: 'dpdp.nomination.submit', targetType: 'dpdp_nomination', targetId: String(row.id), details: { employeeId: employee.id, verificationStatus: row.verificationStatus } }, { transaction });
    return row;
  });
}

function currentNomination({ actor, employee }) {
  if (!employee || employee.organizationId !== actor.organizationId) return null;
  return DpdpNomination.findOne({ where: { organizationId: actor.organizationId, employeeId: employee.id, withdrawnAt: null }, order: [['id', 'DESC']] });
}

async function privacySummary({ actor, employee }) {
  if (!employee || employee.organizationId !== actor.organizationId) throw Object.assign(new Error('Active linked employee record is required.'), { status: 409 });
  const activities = await DpdpProcessingActivity.findAll({ where: { organizationId: actor.organizationId, principalType: 'EMPLOYEE', status: 'ACTIVE' }, attributes: ['code', 'module', 'dataCategory', 'purpose', 'lawfulBasis', 'retentionCategory'], order: [['module', 'ASC'], ['code', 'ASC']] });
  return { employee: { empCode: employee.empCode, name: employee.name }, processingActivities: activities, generatedAt: new Date().toISOString() };
}

function sharingSummary({ actor, employee }) {
  if (!employee || employee.organizationId !== actor.organizationId) return [];
  return DpdpSharingEvent.findAll({ where: { organizationId: actor.organizationId, employeeId: employee.id }, attributes: ['id', 'principalType', 'dataCategories', 'purpose', 'lawfulAuthority', 'sharedAt', 'processorId', 'recipientName'], order: [['sharedAt', 'DESC']] });
}

/**
 * Lists requests for the current employee (self-service).
 */
async function listMyRequests({ actor, employee } = {}) {
  if (!employee) return [];
  return DpdpDataRequest.findAll({
    where: {
      organizationId: actor.organizationId,
      employeeId: employee.id,
    },
    order: [['id', 'DESC']],
  });
}

/**
 * Lists organization requests for DPO / Org Admin.
 */
async function listOrgRequests({ organizationId, status, requestType } = {}) {
  const where = { organizationId };
  if (status) where.status = status;
  if (requestType) where.requestType = requestType;

  return DpdpDataRequest.findAll({
    where,
    include: [{ model: Employee, attributes: ['id', 'empCode', 'name'] }],
    order: [['id', 'DESC']],
  });
}

/**
 * Decides an employee data request (DPO action).
 */
async function decideRequest({
  actor,
  requestId,
  status,
  decisionReason,
  retentionReason = null,
  dpoResponse = null,
} = {}) {
  if (!actor || !actor.organizationId) {
    const err = new Error('Unauthorized.');
    err.status = 401;
    throw err;
  }
  if (!VALID_REQUEST_STATUSES.includes(status)) {
    const err = new Error(`Invalid status "${status}".`);
    err.status = 400;
    throw err;
  }
  if (!decisionReason || !String(decisionReason).trim()) {
    const err = new Error('Decision reason is required when deciding a request.');
    err.status = 400;
    throw err;
  }

  return sequelize.transaction(async (transaction) => {
    const req = await DpdpDataRequest.findOne({
      where: {
        id: requestId,
        organizationId: actor.organizationId,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!req) {
      const err = new Error('Request not found.');
      err.status = 404;
      throw err;
    }

    if (['COMPLETED', 'REJECTED'].includes(req.status)) {
      const err = new Error('Closed requests cannot be re-decided.');
      err.status = 409;
      throw err;
    }

    // Special validation for ERASURE: rejecting an erasure request requires a statutory retention reason
    if (req.requestType === 'ERASURE' && status === 'REJECTED') {
      if (!retentionReason || !String(retentionReason).trim()) {
        const err = new Error('Statutory retention reason is required when refusing an erasure request.');
        err.status = 400;
        throw err;
      }
    }

    req.status = status;
    req.decisionReason = String(decisionReason).trim();
    if (retentionReason) req.retentionReason = String(retentionReason).trim();
    if (dpoResponse) req.dpoResponse = String(dpoResponse).trim();
    req.decidedBy = actor.id;
    req.decidedAt = new Date();
    if (['COMPLETED', 'REJECTED'].includes(status)) req.closedAt = req.decidedAt;

    await req.save({ transaction });
    await addRequestEvent(req, actor, 'DECIDED', null, status, null, transaction);

    await AuditLog.create({
      action: 'dpdp.request.decide',
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      targetType: 'dpdp_data_request',
      targetId: req.id,
      details: {
        status,
        requestType: req.requestType,
        decisionReason: req.decisionReason,
        retentionReason: req.retentionReason,
      },
    }, { transaction });

    return req;
  });
}

/**
 * Creates a data protection incident in the breach register.
 */
async function createIncident({
  actor,
  title,
  severity = 'MEDIUM',
  affectedCategories = null,
  affectedCount = 0,
  discoveredAt = new Date(),
  summary = null,
} = {}) {
  if (!actor || !actor.organizationId) {
    const err = new Error('Unauthorized.');
    err.status = 401;
    throw err;
  }
  if (!title || !String(title).trim()) {
    const err = new Error('Incident title is required.');
    err.status = 400;
    throw err;
  }
  if (!VALID_SEVERITIES.includes(severity)) {
    const err = new Error(`Invalid severity "${severity}".`);
    err.status = 400;
    throw err;
  }

  const incident = await DpdpIncident.create({
    organizationId: actor.organizationId,
    title: String(title).trim(),
    severity,
    status: 'OPEN',
    affectedCategories: affectedCategories ? String(affectedCategories).trim() : null,
    affectedCount: Number(affectedCount) || 0,
    discoveredAt: discoveredAt instanceof Date ? discoveredAt : new Date(discoveredAt),
    summary: summary ? String(summary).trim() : null,
    reportedBy: actor.id,
  });

  await AuditLog.create({
    action: 'dpdp.incident.create',
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    targetType: 'dpdp_incident',
    targetId: incident.id,
    details: { title: incident.title, severity },
  });

  return incident;
}

/**
 * Updates an incident (advance status, record action taken, containment, closure).
 */
async function updateIncident({
  actor,
  incidentId,
  status,
  severity,
  containedAt,
  notifiedAt,
  closedAt,
  actionTaken,
  summary,
} = {}) {
  if (!actor || !actor.organizationId) {
    const err = new Error('Unauthorized.');
    err.status = 401;
    throw err;
  }

  return sequelize.transaction(async (transaction) => {
    const incident = await DpdpIncident.findOne({
      where: {
        id: incidentId,
        organizationId: actor.organizationId,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!incident) {
      const err = new Error('Incident not found.');
      err.status = 404;
      throw err;
    }

    if (incident.status === 'CLOSED' && status && status !== 'CLOSED') {
      const err = new Error('Closed incidents cannot be reopened.');
      err.status = 409;
      throw err;
    }

    if (status && VALID_INCIDENT_STATUSES.includes(status)) {
      incident.status = status;
      if (status === 'CONTAINED' && !incident.containedAt) {
        incident.containedAt = containedAt ? new Date(containedAt) : new Date();
      }
      if (status === 'NOTIFIED' && !incident.notifiedAt) {
        incident.notifiedAt = notifiedAt ? new Date(notifiedAt) : new Date();
      }
      if (status === 'CLOSED' && !incident.closedAt) {
        incident.closedAt = closedAt ? new Date(closedAt) : new Date();
        incident.closedBy = actor.id;
      }
    }

    if (severity && VALID_SEVERITIES.includes(severity)) {
      incident.severity = severity;
    }
    if (actionTaken !== undefined) {
      incident.containmentActions = actionTaken ? String(actionTaken).trim() : null;
    }
    if (summary !== undefined) {
      incident.summary = summary ? String(summary).trim() : null;
    }

    await incident.save({ transaction });

    await AuditLog.create({
      action: 'dpdp.incident.update',
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      targetType: 'dpdp_incident',
      targetId: incident.id,
      details: { status: incident.status, severity: incident.severity },
    }, { transaction });

    return incident;
  });
}

/**
 * Lists incidents for the organization breach register.
 */
async function listIncidents({ organizationId, status, severity } = {}) {
  const where = { organizationId };
  if (status) where.status = status;
  if (severity) where.severity = severity;

  return DpdpIncident.findAll({
    where,
    order: [['discoveredAt', 'DESC'], ['id', 'DESC']],
  });
}

module.exports = {
  createRequest,
  createAssistedRequest,
  verifyRequestIdentity,
  advanceRequest,
  submitNomination,
  currentNomination,
  privacySummary,
  sharingSummary,
  listMyRequests,
  listOrgRequests,
  decideRequest,
  createIncident,
  updateIncident,
  listIncidents,
};
