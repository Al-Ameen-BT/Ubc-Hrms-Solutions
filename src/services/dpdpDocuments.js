'use strict';

const { Op } = require('sequelize');
const { sequelize, DpdpDocument, AuditLog } = require('../models');

const ALLOWED_PLATFORM_TYPES = ['TERMS', 'PLATFORM_PRIVACY'];
const ALLOWED_ORG_TYPES = ['EMPLOYEE_NOTICE'];

/**
 * Validates document content and owner-type constraints.
 */
function validatePublishInput({ ownerType, organizationId, type, title, body, version }) {
  if (!ownerType || !['PLATFORM', 'ORGANIZATION'].includes(ownerType)) {
    const err = new Error('Invalid document ownerType.');
    err.status = 400;
    throw err;
  }

  if (ownerType === 'PLATFORM') {
    if (organizationId != null) {
      const err = new Error('Platform documents must not have an organizationId.');
      err.status = 400;
      throw err;
    }
    if (!ALLOWED_PLATFORM_TYPES.includes(type)) {
      const err = new Error(`Platform owner cannot publish document type "${type}". Allowed: ${ALLOWED_PLATFORM_TYPES.join(', ')}.`);
      err.status = 400;
      throw err;
    }
  }

  if (ownerType === 'ORGANIZATION') {
    if (!organizationId) {
      const err = new Error('Organisation documents must have an organizationId.');
      err.status = 400;
      throw err;
    }
    if (!ALLOWED_ORG_TYPES.includes(type)) {
      const err = new Error(`Organisation owner cannot publish document type "${type}". Allowed: ${ALLOWED_ORG_TYPES.join(', ')}.`);
      err.status = 400;
      throw err;
    }
  }

  if (!title || !String(title).trim()) {
    const err = new Error('Document title is required.');
    err.status = 400;
    throw err;
  }

  if (!body || !String(body).trim()) {
    const err = new Error('Document body content is required and cannot be empty.');
    err.status = 400;
    throw err;
  }

  if (!version || !String(version).trim()) {
    const err = new Error('Document version string is required.');
    err.status = 400;
    throw err;
  }
}

/**
 * Publishes a new version of a DPDP legal document.
 * Transactionally supersedes the existing PUBLISHED version for this owner/org/type.
 */
async function publishDocument({
  ownerType,
  organizationId = null,
  type,
  title,
  body,
  version,
  summary = null,
  bodyMl = null,
  summaryMl = null,
  effectiveAt = null,
  actor,
  transaction: externalTx,
}) {
  validatePublishInput({ ownerType, organizationId, type, title, body, version });

  const run = async (t) => {
    const now = new Date();
    const effAt = effectiveAt ? new Date(effectiveAt) : now;

    // A scheduled successor coexists until it becomes effective; resolution chooses the latest effective version.
    const currentPublished = await DpdpDocument.findAll({
      where: {
        ownerType,
        organizationId: organizationId ?? null,
        type,
        state: 'PUBLISHED',
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const superseded = [];
    if (effAt <= now) {
      for (const doc of currentPublished.filter(row => !row.effectiveAt || row.effectiveAt <= now)) {
        doc.state = 'SUPERSEDED';
        doc.supersededAt = now;
        await doc.save({ transaction: t });
        superseded.push(doc);
      }
    }

    // 2. Create the newly published document
    const newDoc = await DpdpDocument.create({
      ownerType,
      organizationId: organizationId ?? null,
      type,
      version: String(version).trim(),
      title: String(title).trim(),
      body: String(body).trim(),
      summary: summary ? String(summary).trim() : null,
      bodyMl: bodyMl ? String(bodyMl).trim() : null,
      summaryMl: summaryMl ? String(summaryMl).trim() : null,
      state: 'PUBLISHED',
      publishedAt: now,
      effectiveAt: effAt,
      publishedBy: actor?.id || null,
    }, { transaction: t });

    // 3. Audit publication
    await AuditLog.create({
      organizationId: organizationId ?? null,
      actorUserId: actor?.id || null,
      action: 'dpdp.document.publish',
      targetType: 'dpdp_document',
      targetId: String(newDoc.id),
      details: {
        ownerType,
        type,
        version: newDoc.version,
        title: newDoc.title,
        effectiveAt: newDoc.effectiveAt,
        supersededIds: superseded.map((d) => d.id),
      },
    }, { transaction: t });

    return newDoc;
  };

  if (externalTx) {
    return run(externalTx);
  }
  return sequelize.transaction(run);
}

/**
 * Resolves the active bundle of legal documents applicable as of `at`.
 * Consists of:
 * 1. Platform Terms (TERMS)
 * 2. Platform Privacy Notice (PLATFORM_PRIVACY)
 * 3. Organisation Employee Notice (EMPLOYEE_NOTICE) - if organizationId provided
 */
async function activeBundle({ organizationId = null, at = new Date(), transaction } = {}) {
  const options = transaction ? { transaction } : {};
  const asOf = at instanceof Date ? at : new Date(at);

  const [terms, platformPrivacy, employeeNotice] = await Promise.all([
    DpdpDocument.findOne({
      where: {
        ownerType: 'PLATFORM',
        type: 'TERMS',
        state: 'PUBLISHED',
        effectiveAt: { [Op.lte]: asOf },
      },
      order: [['effectiveAt', 'DESC'], ['id', 'DESC']],
      ...options,
    }),
    DpdpDocument.findOne({
      where: {
        ownerType: 'PLATFORM',
        type: 'PLATFORM_PRIVACY',
        state: 'PUBLISHED',
        effectiveAt: { [Op.lte]: asOf },
      },
      order: [['effectiveAt', 'DESC'], ['id', 'DESC']],
      ...options,
    }),
    organizationId ? DpdpDocument.findOne({
      where: {
        ownerType: 'ORGANIZATION',
        organizationId,
        type: 'EMPLOYEE_NOTICE',
        state: 'PUBLISHED',
        effectiveAt: { [Op.lte]: asOf },
      },
      order: [['effectiveAt', 'DESC'], ['id', 'DESC']],
      ...options,
    }) : null,
  ]);

  return {
    asOf: asOf.toISOString(),
    terms,
    platformPrivacy,
    employeeNotice,
  };
}

/**
 * Returns required document IDs from an active bundle.
 */
function requiredDocumentIds(bundle) {
  if (!bundle) return [];
  const ids = [];
  if (bundle.terms?.id) ids.push(bundle.terms.id);
  if (bundle.platformPrivacy?.id) ids.push(bundle.platformPrivacy.id);
  if (bundle.employeeNotice?.id) ids.push(bundle.employeeNotice.id);
  return ids;
}

/**
 * Public representation of a document (strips internal creator/admin IDs).
 */
function publicDocumentView(doc) {
  if (!doc) return null;
  return {
    id: doc.id,
    type: doc.type,
    version: doc.version,
    title: doc.title,
    body: doc.body,
    summary: doc.summary,
    bodyMl: doc.bodyMl,
    summaryMl: doc.summaryMl,
    effectiveAt: doc.effectiveAt,
    publishedAt: doc.publishedAt,
  };
}

/**
 * Lists documents for admin management screens.
 */
async function listDocuments({ ownerType, organizationId = null, type = null } = {}) {
  const where = {};
  if (ownerType) where.ownerType = ownerType;
  if (ownerType === 'ORGANIZATION' && organizationId) {
    where.organizationId = organizationId;
  } else if (ownerType === 'PLATFORM') {
    where.organizationId = null;
  }
  if (type) where.type = type;

  return DpdpDocument.findAll({
    where,
    order: [['id', 'DESC']],
  });
}

module.exports = {
  publishDocument,
  activeBundle,
  requiredDocumentIds,
  publicDocumentView,
  listDocuments,
  ALLOWED_PLATFORM_TYPES,
  ALLOWED_ORG_TYPES,
};
