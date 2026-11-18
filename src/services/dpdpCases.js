'use strict';

const { Op } = require('sequelize');
const {
  sequelize,
  DpdpDataRequest,
  DpdpIncident,
  Employee,
  AuditLog,
} = require('../models');

const VALID_REQUEST_TYPES = ['ACCESS', 'CORRECTION', 'ERASURE', 'GRIEVANCE', 'NOMINATION'];
const VALID_REQUEST_STATUSES = ['SUBMITTED', 'IN_REVIEW', 'COMPLETED', 'REJECTED'];
const VALID_INCIDENT_STATUSES = ['OPEN', 'CONTAINED', 'NOTIFIED', 'CLOSED'];
const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * Creates an employee DPDP data rights request.
 */
async function createRequest({ actor, employee, requestType, details } = {}) {
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

  const req = await DpdpDataRequest.create({
    organizationId: actor.organizationId,
    employeeId: employee.id,
    userId: actor.id,
    requestType,
    status: 'SUBMITTED',
    details: details ? String(details).trim() : null,
  });

  await AuditLog.create({
    action: 'dpdp.request.create',
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    targetType: 'dpdp_data_request',
    targetId: req.id,
    details: { requestType, employeeId: employee.id },
  });

  return req;
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

    await req.save({ transaction });

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
  listMyRequests,
  listOrgRequests,
  decideRequest,
  createIncident,
  updateIncident,
  listIncidents,
};
