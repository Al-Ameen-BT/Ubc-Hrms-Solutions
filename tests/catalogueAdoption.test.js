'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sequelize, Organization, BankRuleCatalogue, PostCadre } = require('../src/models');
const adoption = require('../src/services/catalogueAdoption');
let org, revision;
before(async () => {
  await sequelize.sync();
  org = await Organization.create({ code: 'ADOPT', name: 'Adopting Bank', bankClass: 'CLASS_I' });
  revision = await BankRuleCatalogue.create({ name: 'Class I order', bankClass: 'CLASS_I', status: 'PUBLISHED', effectiveDate: '2026-04-01', posts: [{ code: 'CLERK', name: 'Clerk', stages: [10000, 10500], payableDays: 30 }], rules: [], payrollDefaults: {}, createdByUserId: 1 });
});
after(async () => { await sequelize.close(); });

test('adoption requires a published revision of the bank class and valid effective date', async () => {
  const draft = await BankRuleCatalogue.create({ name: 'Draft', bankClass: 'CLASS_I', posts: [], rules: [], payrollDefaults: {}, createdByUserId: 1 });
  const wrong = await BankRuleCatalogue.create({ name: 'Wrong class', bankClass: 'CLASS_V', status: 'PUBLISHED', effectiveDate: '2026-04-01', posts: [], rules: [], payrollDefaults: {}, createdByUserId: 1 });
  await assert.rejects(adoption.proposeAdoption({ organizationId: org.id, catalogueId: draft.id, effectiveDate: '2026-04-01', actorId: 10 }), /published/i);
  await assert.rejects(adoption.proposeAdoption({ organizationId: org.id, catalogueId: wrong.id, effectiveDate: '2026-04-01', actorId: 10 }), /class/i);
  await assert.rejects(adoption.proposeAdoption({ organizationId: org.id, catalogueId: revision.id, effectiveDate: '2026-02-30', actorId: 10 }), /date/i);
});

test('separate approver activates adoption without changing existing salary', async () => {
  const proposal = await adoption.proposeAdoption({ organizationId: org.id, catalogueId: revision.id, effectiveDate: '2026-04-15', actorId: 10 });
  await assert.rejects(adoption.decideAdoption({ organizationId: org.id, proposalId: proposal.id, decision: 'APPROVED', actorId: 10 }), /different/i);
  const approved = await adoption.decideAdoption({ organizationId: org.id, proposalId: proposal.id, decision: 'APPROVED', actorId: 11 });
  assert.equal(approved.status, 'APPROVED');
  assert.equal((await PostCadre.findOne({ where: { organizationId: org.id, code: 'CLERK' } }))?.name, 'Clerk');
  assert.equal((await adoption.adoptionForDate(org.id, '2026-04-14')), null);
  assert.equal((await adoption.adoptionForDate(org.id, '2026-04-15')).catalogueId, revision.id);
  await assert.rejects(adoption.decideAdoption({ organizationId: org.id, proposalId: proposal.id, decision: 'APPROVED', actorId: 12 }), /already|changed/i);
  await assert.rejects(adoption.proposeAdoption({ organizationId: org.id, catalogueId: revision.id, effectiveDate: '2026-04-15', actorId: 12 }), /date|exists/i);
});
