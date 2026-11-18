'use strict';

const { Op } = require('sequelize');
const { sequelize, DpdpDocument, DpdpAcknowledgement } = require('../models');
const dpdpDocuments = require('./dpdpDocuments');

/**
 * Checks acknowledgement status for a given user and channel.
 * Resolves the active bundle for the user's organization (if any).
 * Returns:
 * {
 *   isCurrent: boolean,
 *   requiredDocuments: Array<DpdpDocument>,
 *   requiredDocumentIds: Array<number>,
 *   missingDocuments: Array<DpdpDocument>,
 *   missingDocumentIds: Array<number>,
 *   bundle: object,
 * }
 */
async function acknowledgementStatus({ user, channel = 'WEB', deviceLinkId = null, transaction } = {}) {
  const options = transaction ? { transaction } : {};
  const orgId = user?.organizationId || null;

  const bundle = await dpdpDocuments.activeBundle({ organizationId: orgId, transaction });
  const requiredDocs = [];
  if (bundle.terms) requiredDocs.push(bundle.terms);
  if (bundle.platformPrivacy) requiredDocs.push(bundle.platformPrivacy);
  if (bundle.employeeNotice) requiredDocs.push(bundle.employeeNotice);

  const requiredIds = requiredDocs.map(d => d.id);
  if (requiredIds.length === 0) {
    return {
      isCurrent: true,
      requiredDocuments: [],
      requiredDocumentIds: [],
      missingDocuments: [],
      missingDocumentIds: [],
      bundle,
    };
  }

  const ackWhere = {
    documentId: { [Op.in]: requiredIds },
    userId: user?.id || null,
    channel,
  };
  if (deviceLinkId != null) {
    ackWhere.deviceLinkId = deviceLinkId;
  }

  const existingAcks = await DpdpAcknowledgement.findAll({
    where: ackWhere,
    attributes: ['documentId'],
    ...options,
  });

  const acknowledgedDocIds = new Set(existingAcks.map(a => a.documentId));
  const missingDocs = requiredDocs.filter(d => !acknowledgedDocIds.has(d.id));
  const missingDocumentIds = missingDocs.map(d => d.id);

  return {
    isCurrent: missingDocumentIds.length === 0,
    requiredDocuments: requiredDocs,
    requiredDocumentIds: requiredIds,
    missingDocuments: missingDocs,
    missingDocumentIds,
    bundle,
  };
}

/**
 * Records acknowledgements for currently required documents.
 * Must match exactly what is required and missing, or subset of currently required.
 */
async function recordAcknowledgements({
  user,
  employee = null,
  documentIds = [],
  channel = 'WEB',
  deviceLinkId = null,
  transaction,
} = {}) {
  if (!user || !user.id) {
    const err = new Error('User is required to record DPDP acknowledgement.');
    err.status = 400;
    throw err;
  }

  const docIdArray = Array.isArray(documentIds) ? Array.from(new Set(documentIds.map(Number))) : [];
  if (docIdArray.length === 0) {
    const err = new Error('At least one document ID must be specified for acknowledgement.');
    err.status = 400;
    throw err;
  }

  const runWithTransaction = async (tx) => {
    // Check current required bundle
    const status = await acknowledgementStatus({ user, channel, deviceLinkId, transaction: tx });

    // Validate that every submitted docId is among the requiredDocuments
    const requiredIdSet = new Set(status.requiredDocumentIds);
    for (const id of docIdArray) {
      if (!requiredIdSet.has(id)) {
        const err = new Error(`Document ID ${id} is not part of the active required legal bundle.`);
        err.status = 400;
        throw err;
      }
    }

    const orgId = user.organizationId || null;
    const empId = employee?.id || user.employeeId || null;

    let recordedCount = 0;
    const createdAcks = [];

    for (const docId of docIdArray) {
      // Check if already acknowledged
      const existing = await DpdpAcknowledgement.findOne({
        where: {
          documentId: docId,
          userId: user.id,
          channel,
          deviceLinkId: deviceLinkId ?? null,
        },
        transaction: tx,
      });

      if (!existing) {
        const ack = await DpdpAcknowledgement.create({
          documentId: docId,
          organizationId: orgId,
          userId: user.id,
          employeeId: empId,
          channel,
          deviceLinkId: deviceLinkId ?? null,
          acknowledgedAt: new Date(),
        }, { transaction: tx });
        createdAcks.push(ack);
        recordedCount++;
      }
    }

    return {
      recordedCount,
      acknowledgements: createdAcks,
    };
  };

  if (transaction) {
    return runWithTransaction(transaction);
  } else {
    return sequelize.transaction(runWithTransaction);
  }
}

module.exports = {
  acknowledgementStatus,
  recordAcknowledgements,
};
