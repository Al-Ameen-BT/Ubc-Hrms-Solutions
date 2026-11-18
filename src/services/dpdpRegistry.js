'use strict';

const {
  DpdpProcessingActivity,
  DpdpProcessor,
  DpdpSharingEvent,
  DpdpControlAssessment,
  AuditLog,
} = require('../models');

const PRINCIPAL_TYPES = ['CANDIDATE', 'EMPLOYEE', 'CONTRACTOR', 'FORMER_EMPLOYEE', 'DEPENDENT', 'NOMINEE', 'REFERENCE', 'EMERGENCY_CONTACT'];
const LAWFUL_BASES = ['CONSENT', 'EMPLOYMENT_LEGITIMATE_USE', 'LEGAL_REQUIREMENT', 'OTHER_LEGITIMATE_USE'];
const SECURITY_CLASSES = ['INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'];
const CONTROL_STATUSES = ['IMPLEMENTED', 'PARTIAL', 'NOT_IMPLEMENTED', 'NOT_APPLICABLE'];

function error(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function actorOrg(actor) {
  if (!actor?.organizationId) throw error('Authenticated organisation user is required.', 401);
  return actor.organizationId;
}

function text(value, name, max = 255) {
  const clean = String(value || '').trim();
  if (!clean) throw error(`${name} is required.`);
  if (clean.length > max) throw error(`${name} is too long.`);
  return clean;
}

function list(value) {
  return Array.isArray(value) ? [...new Set(value.filter((item) => item != null))] : [];
}

async function audit(actor, action, targetType, targetId, details) {
  await AuditLog.create({
    organizationId: actor.organizationId,
    actorUserId: actor.id || null,
    actorEmail: actor.email || null,
    action,
    targetType,
    targetId: String(targetId),
    details,
  });
}

async function validateProcessorIds(organizationId, ids) {
  const uniqueIds = list(ids).map(Number).filter(Number.isInteger);
  if (!uniqueIds.length) return [];
  const count = await DpdpProcessor.count({ where: { id: uniqueIds, organizationId } });
  if (count !== uniqueIds.length) throw error('Processor not found.');
  return uniqueIds;
}

async function upsertProcessingActivity({ actor, id = null, data = {} }) {
  const organizationId = actorOrg(actor);
  const principalType = text(data.principalType, 'principalType', 32);
  const lawfulBasis = text(data.lawfulBasis, 'lawfulBasis', 40);
  const securityClassification = text(data.securityClassification, 'securityClassification', 24);
  if (!PRINCIPAL_TYPES.includes(principalType)) throw error('Invalid principalType.');
  if (!LAWFUL_BASES.includes(lawfulBasis)) throw error('Invalid lawfulBasis.');
  if (!SECURITY_CLASSES.includes(securityClassification)) throw error('Invalid securityClassification.');
  const processorIds = await validateProcessorIds(organizationId, data.processorIds);

  const dataCategory = text(data.dataCategory, 'dataCategory', 64);
  if (dataCategory === 'HIGH_RISK_BIOMETRIC' && !(
    data.dpiaRequired === true
    && data.riskReviewStatus === 'APPROVED'
    && data.biometricAlternativeAvailable === true
    && data.rawBiometricStored === false
  )) {
    throw error('High-risk biometric processing requires an approved DPIA, a non-biometric alternative, and confirmation that raw biometric images are not stored.');
  }

  let row = null;
  if (id) row = await DpdpProcessingActivity.findOne({ where: { id, organizationId } });
  if (!row && data.code) row = await DpdpProcessingActivity.findOne({ where: { organizationId, code: String(data.code).trim().toUpperCase() } });
  const values = {
    organizationId,
    code: text(data.code, 'code', 64).toUpperCase(),
    module: text(data.module, 'module', 64).toUpperCase(),
    storageLocation: text(data.storageLocation, 'storageLocation'),
    fieldName: text(data.fieldName, 'fieldName', 128),
    dataCategory,
    principalType,
    purpose: text(data.purpose, 'purpose', 4000),
    lawfulBasis,
    legalReference: data.legalReference ? String(data.legalReference).trim() : null,
    dataSource: data.dataSource ? String(data.dataSource).trim() : null,
    accessRoles: list(data.accessRoles),
    processorIds,
    retentionCategory: data.retentionCategory ? String(data.retentionCategory).trim() : null,
    deletionTrigger: data.deletionTrigger ? String(data.deletionTrigger).trim() : null,
    securityClassification,
    dpiaRequired: Boolean(data.dpiaRequired),
    riskReviewStatus: data.riskReviewStatus || null,
    biometricAlternativeAvailable: data.biometricAlternativeAvailable ?? null,
    rawBiometricStored: data.rawBiometricStored ?? null,
    reviewOwnerUserId: data.reviewOwnerUserId || null,
    nextReviewAt: data.nextReviewAt || null,
    status: data.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
  };
  row = row ? await row.update(values) : await DpdpProcessingActivity.create(values);
  await audit(actor, row._options?.isNewRecord ? 'dpdp.activity.create' : 'dpdp.activity.upsert', 'dpdp_processing_activity', row.id, { code: row.code, dataCategory: row.dataCategory });
  return row;
}

function listProcessingActivities({ organizationId, status }) {
  return DpdpProcessingActivity.findAll({
    where: { organizationId, ...(status ? { status } : {}) },
    order: [['module', 'ASC'], ['code', 'ASC']],
  });
}

async function upsertProcessor({ actor, id = null, data = {} }) {
  const organizationId = actorOrg(actor);
  let row = id ? await DpdpProcessor.findOne({ where: { id, organizationId } }) : null;
  if (id && !row) throw error('Processor not found.', 404);
  const code = text(data.code, 'code', 64).toUpperCase();
  if (!row) row = await DpdpProcessor.findOne({ where: { organizationId, code } });
  const values = {
    organizationId,
    code,
    name: text(data.name, 'name'),
    serviceCategory: data.serviceCategory ? String(data.serviceCategory).trim() : null,
    purpose: data.purpose ? String(data.purpose).trim() : null,
    dataCategories: list(data.dataCategories),
    processingLocations: list(data.processingLocations),
    crossBorder: Boolean(data.crossBorder),
    dpaStatus: ['MISSING', 'DRAFT', 'CURRENT', 'EXPIRED'].includes(data.dpaStatus) ? data.dpaStatus : 'MISSING',
    dpaEffectiveAt: data.dpaEffectiveAt || null,
    dpaExpiresAt: data.dpaExpiresAt || null,
    breachContact: data.breachContact ? String(data.breachContact).trim() : null,
    contractControls: data.contractControls && typeof data.contractControls === 'object' ? data.contractControls : {},
    nextReviewAt: data.nextReviewAt || null,
    status: data.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
  };
  row = row ? await row.update(values) : await DpdpProcessor.create(values);
  await audit(actor, 'dpdp.processor.upsert', 'dpdp_processor', row.id, { code: row.code, status: row.status });
  return row;
}

function listProcessors({ organizationId, status }) {
  return DpdpProcessor.findAll({ where: { organizationId, ...(status ? { status } : {}) }, order: [['name', 'ASC']] });
}

async function recordSharingEvent({ actor, data = {} }) {
  const organizationId = actorOrg(actor);
  const activity = await DpdpProcessingActivity.findOne({ where: { id: Number(data.processingActivityId), organizationId } });
  if (!activity) throw error('Processing activity not found.', 404);
  if (data.processorId) await validateProcessorIds(organizationId, [data.processorId]);
  const principalType = text(data.principalType, 'principalType', 32);
  if (!PRINCIPAL_TYPES.includes(principalType)) throw error('Invalid principalType.');
  const row = await DpdpSharingEvent.create({
    organizationId,
    employeeId: data.employeeId || null,
    principalType,
    principalReference: data.principalReference ? String(data.principalReference).trim() : null,
    processingActivityId: activity.id,
    processorId: data.processorId || null,
    recipientName: data.recipientName ? String(data.recipientName).trim() : null,
    dataCategories: list(data.dataCategories),
    purpose: text(data.purpose, 'purpose', 4000),
    lawfulAuthority: text(data.lawfulAuthority, 'lawfulAuthority'),
    sharedAt: data.sharedAt ? new Date(data.sharedAt) : new Date(),
    recordedBy: actor.id || null,
  });
  await audit(actor, 'dpdp.sharing.record', 'dpdp_sharing_event', row.id, { principalType, processingActivityId: activity.id, processorId: row.processorId });
  return row;
}

function listSharingEvents({ organizationId, employeeId }) {
  return DpdpSharingEvent.findAll({
    where: { organizationId, ...(employeeId ? { employeeId } : {}) },
    order: [['sharedAt', 'DESC'], ['id', 'DESC']],
  });
}

async function upsertControlAssessment({ actor, data = {} }) {
  const organizationId = actorOrg(actor);
  const controlCode = text(data.controlCode, 'controlCode', 64).toUpperCase();
  const status = text(data.status, 'status', 32);
  if (!CONTROL_STATUSES.includes(status)) throw error('Invalid control status.');
  let row = await DpdpControlAssessment.findOne({ where: { organizationId, controlCode } });
  const values = {
    organizationId,
    controlCode,
    title: text(data.title, 'title'),
    status,
    evidenceReference: data.evidenceReference ? String(data.evidenceReference).trim() : null,
    ownerUserId: data.ownerUserId || null,
    verifiedAt: data.verifiedAt || null,
    nextReviewAt: data.nextReviewAt || null,
  };
  row = row ? await row.update(values) : await DpdpControlAssessment.create(values);
  await audit(actor, 'dpdp.control.upsert', 'dpdp_control_assessment', row.id, { controlCode, status });
  return row;
}

function listControlAssessments({ organizationId }) {
  return DpdpControlAssessment.findAll({ where: { organizationId }, order: [['controlCode', 'ASC']] });
}

async function dashboard(organizationId) {
  const [activities, processors, controls, sharingEvents] = await Promise.all([
    listProcessingActivities({ organizationId, status: 'ACTIVE' }),
    listProcessors({ organizationId, status: 'ACTIVE' }),
    listControlAssessments({ organizationId }),
    DpdpSharingEvent.count({ where: { organizationId } }),
  ]);
  const activityReady = activities.filter((row) => row.purpose && row.lawfulBasis && row.securityClassification && row.retentionCategory && (
    row.dataCategory !== 'HIGH_RISK_BIOMETRIC' || (row.dpiaRequired && row.riskReviewStatus === 'APPROVED' && row.biometricAlternativeAvailable && row.rawBiometricStored === false)
  )).length;
  return {
    processingActivities: { total: activities.length, ready: activityReady },
    processors: { total: processors.length, current: processors.filter((row) => row.dpaStatus === 'CURRENT').length },
    controls: { total: controls.length, implemented: controls.filter((row) => row.status === 'IMPLEMENTED').length, gaps: controls.filter((row) => ['PARTIAL', 'NOT_IMPLEMENTED'].includes(row.status)).length },
    sharingEvents,
  };
}

module.exports = {
  PRINCIPAL_TYPES,
  LAWFUL_BASES,
  SECURITY_CLASSES,
  CONTROL_STATUSES,
  listProcessingActivities,
  upsertProcessingActivity,
  listProcessors,
  upsertProcessor,
  listSharingEvents,
  recordSharingEvent,
  listControlAssessments,
  upsertControlAssessment,
  dashboard,
};
