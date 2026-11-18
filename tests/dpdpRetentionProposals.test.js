'use strict';
process.env.DB_DIALECT = 'sqlite'; process.env.DB_STORAGE = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sequelize, Organization, User, Employee, PostCadre, OrganizationResponsibilityAssignment, DpdpRetentionRule, ExpenseClaim, ExpenseReceipt, DpdpDeletionResult } = require('../src/models');
const proposals = require('../src/services/dpdpRetentionProposals');
let org; let proposer; let dpo;
before(async () => {
  await sequelize.sync({ force: true }); org = await Organization.create({ code: 'DELETE', name: 'Deletion Bank' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'OFF', name: 'Officer' });
  const dpoEmp = await Employee.create({ organizationId: org.id, empCode: 'DPO1', name: 'DPO', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 1 });
  proposer = await User.create({ organizationId: org.id, email: 'admin@delete.invalid', name: 'Admin', role: 'ORG_ADMIN', passwordHash: 'x' });
  dpo = await User.create({ organizationId: org.id, employeeId: dpoEmp.id, email: 'dpo@delete.invalid', name: 'DPO', role: 'ORG_ADMIN', passwordHash: 'x' });
  await OrganizationResponsibilityAssignment.create({ organizationId: org.id, employeeId: dpoEmp.id, userId: dpo.id, responsibility: 'DATA_PROTECTION_OFFICER', scopeType: 'ORGANISATION', effectiveFrom: '2026-01-01', status: 'ACTIVE' });
});
after(async () => sequelize.close());

test('retention proposals enforce maker-checker, legal holds, allowlisted execution, and idempotency', async () => {
  await DpdpRetentionRule.create({ organizationId: org.id, category: 'EXPENSE_RECEIPTS', periodMonths: 1, legalHold: true });
  const held = await proposals.createProposal({ actor: proposer, category: 'EXPENSE_RECEIPTS', cutoffAt: '2026-10-01' });
  await assert.rejects(proposals.decideProposal({ actor: dpo, proposalId: held.id, decision: 'APPROVED', reason: 'Reviewed' }), /legal hold/i);
  await DpdpRetentionRule.update({ legalHold: false }, { where: { organizationId: org.id, category: 'EXPENSE_RECEIPTS' } });
  const unsupported = await proposals.createProposal({ actor: proposer, category: 'TEMP_ATTACHMENTS', cutoffAt: '2026-10-01' });
  await assert.rejects(proposals.decideProposal({ actor: proposer, proposalId: unsupported.id, decision: 'APPROVED', reason: 'Self approval' }), /different.*DPO/i);
  const approvedUnsupported = await proposals.decideProposal({ actor: dpo, proposalId: unsupported.id, decision: 'APPROVED', reason: 'Reviewed' });
  await assert.rejects(proposals.executeProposal({ actor: dpo, proposalId: approvedUnsupported.id }), /not supported/i);

  const claim = await ExpenseClaim.create({ organizationId: org.id, employeeId: (await Employee.findOne({ where: { organizationId: org.id } })).id, category: 'TRAVEL', purpose: 'Official travel', amount: 10, expenseDate: '2026-01-01', status: 'PAID', submittedBy: proposer.id, createdAt: '2026-01-01' });
  await ExpenseReceipt.create({ claimId: claim.id, mimeType: 'image/png', data: Buffer.from('x'), sizeBytes: 1, sha256: 'a'.repeat(64) });
  const proposal = await proposals.createProposal({ actor: proposer, category: 'EXPENSE_RECEIPTS', cutoffAt: '2026-10-01' });
  await proposals.decideProposal({ actor: dpo, proposalId: proposal.id, decision: 'APPROVED', reason: 'No hold' });
  const executed = await proposals.executeProposal({ actor: dpo, proposalId: proposal.id });
  assert.equal(executed.status, 'COMPLETED'); assert.match(executed.certificateDigest, /^[a-f0-9]{64}$/);
  assert.equal(await ExpenseReceipt.count(), 0); assert.equal(await DpdpDeletionResult.count({ where: { proposalId: proposal.id } }), 1);
  const repeated = await proposals.executeProposal({ actor: dpo, proposalId: proposal.id });
  assert.equal(repeated.certificateDigest, executed.certificateDigest);
});
