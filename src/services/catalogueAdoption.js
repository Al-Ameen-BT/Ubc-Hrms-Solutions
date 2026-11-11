'use strict';
const { Op } = require('sequelize');
const { sequelize, Organization, BankRuleCatalogue, OrganizationCatalogueAdoption, PostCadre } = require('../models');
const { isDateOnly } = require('./dateUtils');

class AdoptionError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

async function verifiedRevision(organizationId, catalogueId, effectiveDate, transaction) {
  const [org, revision] = await Promise.all([
    Organization.findByPk(organizationId, { transaction }),
    BankRuleCatalogue.findByPk(catalogueId, { transaction }),
  ]);
  if (!org) throw new AdoptionError('Organisation not found.', 404);
  if (!revision || revision.status !== 'PUBLISHED') throw new AdoptionError('A published catalogue revision is required.', 409);
  if (org.bankClass !== revision.bankClass) throw new AdoptionError('Catalogue bank class does not match this organisation.', 400);
  if (!isDateOnly(effectiveDate) || effectiveDate < revision.effectiveDate) throw new AdoptionError('Effective date must be valid and on or after the government revision date.');
  return revision;
}

async function proposeAdoption({ organizationId, catalogueId, effectiveDate, actorId }) {
  await verifiedRevision(organizationId, catalogueId, effectiveDate);
  if (await OrganizationCatalogueAdoption.count({ where: { organizationId, effectiveDate, status: 'APPROVED' } })) throw new AdoptionError('An adoption already exists for this date.', 409);
  return OrganizationCatalogueAdoption.create({ organizationId, catalogueId, effectiveDate, preparedBy: actorId });
}

async function decideAdoption({ organizationId, proposalId, decision, actorId, reason }) {
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new AdoptionError('Decision must be APPROVED or REJECTED.');
  return sequelize.transaction(async transaction => {
    await Organization.findByPk(organizationId, { transaction, lock: transaction.LOCK.UPDATE });
    const row = await OrganizationCatalogueAdoption.findOne({ where: { id: proposalId, organizationId }, transaction });
    if (!row) throw new AdoptionError('Adoption proposal not found.', 404);
    if (row.status !== 'PENDING') throw new AdoptionError('This adoption has already changed.', 409);
    if (Number(row.preparedBy) === Number(actorId)) throw new AdoptionError('A different approving authority must decide this proposal.', 403);
    if (decision === 'APPROVED') {
      const revision = await verifiedRevision(organizationId, row.catalogueId, row.effectiveDate, transaction);
      if (await OrganizationCatalogueAdoption.count({ where: { organizationId, effectiveDate: row.effectiveDate, status: 'APPROVED' }, transaction })) throw new AdoptionError('An adoption already exists for this date.', 409);
      for (const post of revision.posts || []) {
        await PostCadre.findOrCreate({ where: { organizationId, code: post.code }, defaults: { organizationId, code: post.code, name: post.name }, transaction });
      }
    }
    const [changed] = await OrganizationCatalogueAdoption.update({ status: decision, decidedBy: actorId, decidedAt: new Date(), decisionReason: reason ? String(reason).slice(0, 500) : null }, { where: { id: row.id, organizationId, status: 'PENDING' }, transaction });
    if (!changed) throw new AdoptionError('This adoption has already changed.', 409);
    return OrganizationCatalogueAdoption.findByPk(row.id, { transaction });
  });
}

async function adoptionForDate(organizationId, date, transaction) {
  if (!isDateOnly(date)) throw new AdoptionError('Valid date required.');
  return OrganizationCatalogueAdoption.findOne({ where: { organizationId, status: 'APPROVED', effectiveDate: { [Op.lte]: date } }, order: [['effectiveDate', 'DESC'], ['id', 'DESC']], transaction });
}

module.exports = { AdoptionError, proposeAdoption, decideAdoption, adoptionForDate };
