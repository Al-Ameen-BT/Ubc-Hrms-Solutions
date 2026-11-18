'use strict';

const crypto = require('node:crypto');
const { Op } = require('sequelize');
const {
  sequelize,
  DpdpRetentionRule,
  DpdpRetentionProposal,
  DpdpDeletionResult,
  OrganizationResponsibilityAssignment,
  ExpenseClaim,
  ExpenseReceipt,
  AuditLog,
} = require('../models');
const { RETENTION_CATEGORIES, STATUTORY_EXCLUDED_CATEGORIES } = require('./dpdpRetention');

const EXECUTABLE_CATEGORIES = Object.freeze(['EXPENSE_RECEIPTS']);

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function validCutoff(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw fail('A valid retention cutoff date is required.');
  return date;
}

async function requireActiveDpo(actor, transaction) {
  const today = new Date().toISOString().slice(0, 10);
  const assignment = await OrganizationResponsibilityAssignment.findOne({
    where: {
      organizationId: actor.organizationId,
      userId: actor.id,
      responsibility: 'DATA_PROTECTION_OFFICER',
      status: 'ACTIVE',
      effectiveFrom: { [Op.lte]: today },
      [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: today } }],
    },
    transaction,
  });
  if (!assignment) throw fail('An active assigned Data Protection Officer is required.', 403);
}

async function countCandidates(organizationId, category, cutoffAt, transaction) {
  if (category !== 'EXPENSE_RECEIPTS') return 0;
  return ExpenseReceipt.count({
    include: [{
      model: ExpenseClaim,
      required: true,
      where: { organizationId, createdAt: { [Op.lt]: cutoffAt } },
    }],
    transaction,
  });
}

async function createProposal({ actor, category, cutoffAt }) {
  if (!actor?.organizationId) throw fail('Unauthorized.', 401);
  if (!RETENTION_CATEGORIES.includes(category) || STATUTORY_EXCLUDED_CATEGORIES.includes(category)) {
    throw fail('This retention category cannot be proposed for deletion.');
  }
  const cutoff = validCutoff(cutoffAt);
  const rule = await DpdpRetentionRule.findOne({ where: { organizationId: actor.organizationId, category } });
  const proposal = await DpdpRetentionProposal.create({
    organizationId: actor.organizationId,
    category,
    cutoffAt: cutoff,
    candidateCount: await countCandidates(actor.organizationId, category, cutoff),
    legalHold: Boolean(rule?.legalHold),
    proposedBy: actor.id,
  });
  await AuditLog.create({
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: 'dpdp.retention.propose',
    targetType: 'dpdp_retention_proposal',
    targetId: String(proposal.id),
    details: { category, candidateCount: proposal.candidateCount, legalHold: proposal.legalHold },
  });
  return proposal;
}

async function decideProposal({ actor, proposalId, decision, reason }) {
  if (!actor?.organizationId) throw fail('Unauthorized.', 401);
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw fail('Decision must be APPROVED or REJECTED.');
  if (!String(reason || '').trim()) throw fail('Decision reason is required.');

  return sequelize.transaction(async (transaction) => {
    const proposal = await DpdpRetentionProposal.findOne({
      where: { id: proposalId, organizationId: actor.organizationId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!proposal) throw fail('Retention proposal not found.', 404);
    if (proposal.status !== 'PROPOSED') throw fail('Only proposed retention actions can be decided.', 409);
    if (Number(proposal.proposedBy) === Number(actor.id)) throw fail('A different active DPO must approve or reject this proposal.', 403);
    await requireActiveDpo(actor, transaction);

    const rule = await DpdpRetentionRule.findOne({
      where: { organizationId: actor.organizationId, category: proposal.category },
      transaction,
    });
    if (decision === 'APPROVED' && (proposal.legalHold || rule?.legalHold)) {
      throw fail('This retention category is under legal hold and cannot be approved.', 409);
    }

    proposal.status = decision;
    proposal.approvedBy = actor.id;
    proposal.approvedAt = new Date();
    proposal.decisionReason = String(reason).trim();
    await proposal.save({ transaction });
    await AuditLog.create({
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: 'dpdp.retention.decide',
      targetType: 'dpdp_retention_proposal',
      targetId: String(proposal.id),
      details: { decision, category: proposal.category },
    }, { transaction });
    return proposal;
  });
}

async function executeProposal({ actor, proposalId }) {
  if (!actor?.organizationId) throw fail('Unauthorized.', 401);
  try {
    return await sequelize.transaction(async (transaction) => {
      const proposal = await DpdpRetentionProposal.findOne({
        where: { id: proposalId, organizationId: actor.organizationId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!proposal) throw fail('Retention proposal not found.', 404);
      if (proposal.status === 'COMPLETED') return proposal;
      if (proposal.status !== 'APPROVED') throw fail('Only approved retention proposals can be executed.', 409);
      await requireActiveDpo(actor, transaction);
      if (!EXECUTABLE_CATEGORIES.includes(proposal.category)) {
        throw fail(`Deletion execution is not supported for ${proposal.category}.`, 409);
      }

      const receipts = await ExpenseReceipt.findAll({
        include: [{
          model: ExpenseClaim,
          required: true,
          where: { organizationId: actor.organizationId, createdAt: { [Op.lt]: proposal.cutoffAt } },
        }],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const results = [];
      for (const receipt of receipts) {
        const targetId = String(receipt.id);
        await receipt.destroy({ transaction });
        await DpdpDeletionResult.create({
          organizationId: actor.organizationId,
          proposalId: proposal.id,
          targetType: 'EXPENSE_RECEIPT',
          targetId,
          status: 'DELETED',
        }, { transaction });
        results.push({ targetId, status: 'DELETED' });
      }

      proposal.status = 'COMPLETED';
      proposal.executedAt = new Date();
      proposal.certificateDigest = crypto.createHash('sha256').update(JSON.stringify({
        proposalId: proposal.id,
        organizationId: proposal.organizationId,
        category: proposal.category,
        cutoffAt: proposal.cutoffAt.toISOString(),
        results,
      })).digest('hex');
      await proposal.save({ transaction });
      await AuditLog.create({
        organizationId: actor.organizationId,
        actorUserId: actor.id,
        action: 'dpdp.retention.execute',
        targetType: 'dpdp_retention_proposal',
        targetId: String(proposal.id),
        details: { category: proposal.category, deletedCount: results.length, certificateDigest: proposal.certificateDigest },
      }, { transaction });
      return proposal;
    });
  } catch (error) {
    if (error.status || error.name?.startsWith('Sequelize')) throw error;
    await DpdpRetentionProposal.update({ status: 'FAILED' }, { where: { id: proposalId, organizationId: actor.organizationId, status: 'APPROVED' } });
    throw error;
  }
}

function listProposals({ organizationId, status }) {
  const where = { organizationId };
  if (status) where.status = status;
  return DpdpRetentionProposal.findAll({ where, order: [['id', 'DESC']] });
}

module.exports = { EXECUTABLE_CATEGORIES, createProposal, decideProposal, executeProposal, listProposals };
