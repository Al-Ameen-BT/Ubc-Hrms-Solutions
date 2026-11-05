'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'catalogue-test-secret-only';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const catalogue = require('../src/services/bankRuleCatalogue');
const { sequelize, BankRuleCatalogue, Organization, Employee, OrgPayrollSetting } = require('../src/models');

const draft = (overrides = {}) => ({
  name: 'Government scale revision', bankClass: 'SPECIAL_GRADE',
  orderNumber: 'TEST/1', issuingAuthority: 'Test authority', orderDate: '2026-01-01',
  effectiveDate: '2026-04-01', sourceUrl: 'https://example.gov.in/orders/test.pdf',
  posts: [{ code: 'CLERK', name: 'Junior Clerk', scaleExpression: '10000-500/2-11000', payableDays: 30, monthDays: null }],
  rules: [{ title: 'Annual increment', reference: 'Clause 4', description: 'Advance one stage after qualifying service.' }],
  payrollDefaults: { daPercent: 12, pfCalculationBase: 'BASIC_PLUS_DA' }, ...overrides,
});
before(async () => { await sequelize.sync(); });
after(async () => { await sequelize.close(); });

test('validates and expands post scales without inventing payroll defaults', () => {
  const value = catalogue.validateCatalogue(draft());
  assert.deepEqual(value.posts[0].stages, [10000, 10500, 11000]);
  assert.deepEqual(value.payrollDefaults, { daPercent: 12, pfCalculationBase: 'BASIC_PLUS_DA' });
});
test('rejects malformed, excessive, decreasing and mismatched scales', () => {
  for (const expr of ['100-200', '100-0/2-100', '100--5/2-90', '100-5/999999999-200', '100-5/2-120', '0', '1e2', '100-5/2-110-junk']) {
    assert.throws(() => catalogue.validateCatalogue(draft({ posts: [{ code: 'A', name: 'A', scaleExpression: expr }] })), /scale|stage|expression/i);
  }
});
test('rejects bad dates, duplicate posts, unsafe sources, unknown classes and payroll fields', () => {
  for (const change of [
    { orderDate: '2026-02-30' }, { effectiveDate: 'not-a-date' }, { bankClass: 'CLASS_UNKNOWN' },
    { sourceUrl: 'javascript:alert(1)' }, { posts: [draft().posts[0], draft().posts[0]] },
    { payrollDefaults: { organizationId: 42 } }, { payrollDefaults: { constructor: 42 } }, { payrollDefaults: { odMultiplier: 10000 } }, { payrollDefaults: { daPercent: -1 } },
    { payrollDefaults: { daPercent: 101 } }, { payrollDefaults: { medicalAllowanceMonth: 13 } },
    { payrollDefaults: { hraType: 'UNKNOWN' } }, { payrollDefaults: { retirementAge: 20 } },
    { payrollDefaults: { vehicleLoanAllowMultiple: 'false' } }, { payrollDefaults: { gsliCutoffDate: '2026-02-30' } },
  ]) assert.throws(() => catalogue.validateCatalogue(draft(change)));
});
test('reference library stays explicitly unverified and class-specific', () => {
  const reference = catalogue.referenceForClass('CLASS_IV');
  assert.match(reference.note, /verif/i);
  assert.equal(reference.posts.some(p => p.code === 'SYS_ADMIN'), false);
  assert.ok(reference.posts.every(p => p.stages.length > 0));
  assert.throws(() => catalogue.referenceForClass('UNKNOWN'));
});
test('drafts can be incomplete, are versioned, and cannot be overwritten by stale editors', async () => {
  const row = await catalogue.createDraft(1, { name: 'Incomplete', bankClass: 'CLASS_I' });
  assert.equal(row.status, 'DRAFT');
  await assert.rejects(catalogue.publish(row.id, 1, { version: row.version, verified: true, verificationNote: 'Checked' }));
  const updated = await catalogue.updateDraft(row.id, { ...draft({ bankClass: 'CLASS_I' }), version: row.version });
  assert.equal(updated.version, row.version + 1);
  await assert.rejects(catalogue.updateDraft(row.id, { ...draft(), version: row.version }), /changed|reload/i);
  await catalogue.deleteDraft(row.id, updated.version);
});
test('publication requires explicit verification; freezes the complete snapshot', async () => {
  const row = await catalogue.createDraft(1, draft());
  await assert.rejects(catalogue.publish(row.id, 1, { version: row.version }), /verif/i);
  const published = await catalogue.publish(row.id, 1, { version: row.version, verified: true, verificationNote: 'Compared every stage with the source order.' });
  assert.equal(published.status, 'PUBLISHED');
  assert.equal(published.publishedByUserId, 1);
  assert.ok(published.publishedAt);
  await assert.rejects(catalogue.updateDraft(row.id, { ...draft(), version: published.version }), /draft/i);
  await assert.rejects(catalogue.deleteDraft(row.id, published.version), /draft/i);
  assert.equal(await Organization.count(), 0);
  assert.equal(await Employee.count(), 0);
  assert.equal(await OrgPayrollSetting.count(), 0);
});
test('successor must match class and move effective date forward; publication supersedes atomically', async () => {
  const previous = await BankRuleCatalogue.findOne({ where: { status: 'PUBLISHED', bankClass: 'SPECIAL_GRADE' } });
  const wrong = await catalogue.createDraft(1, draft({ bankClass: 'CLASS_II', supersedesId: previous.id, effectiveDate: '2027-04-01' }));
  await assert.rejects(catalogue.publish(wrong.id, 1, { version: wrong.version, verified: true, verificationNote: 'Checked' }), /class/i);
  const next = await catalogue.createDraft(1, draft({ supersedesId: previous.id, effectiveDate: '2027-04-01' }));
  const published = await catalogue.publish(next.id, 1, { version: next.version, verified: true, verificationNote: 'Checked successor order' });
  assert.equal(published.status, 'PUBLISHED');
  assert.equal((await previous.reload()).status, 'SUPERSEDED');
  assert.deepEqual(previous.posts[0].stages, [10000, 10500, 11000]);
});
test('another publication for the class must explicitly supersede its current version', async () => {
  const row = await catalogue.createDraft(1, draft({ effectiveDate: '2028-04-01' }));
  await assert.rejects(catalogue.publish(row.id, 1, { version: row.version, verified: true, verificationNote: 'Checked' }), /supersed/i);
});

test('scales require whole rupees and every class reference validates', () => {
  assert.throws(() => catalogue.expandStages('100.10-0.10/2-100.30'), /whole|integer/i);
  for (const key of ['SPECIAL_GRADE', 'CLASS_I', 'CLASS_II', 'CLASS_III', 'CLASS_IV', 'CLASS_V']) {
    const ref = catalogue.referenceForClass(key);
    assert.ok(catalogue.validateCatalogue(draft({ bankClass: key, posts: ref.posts })).posts.length);
  }
});

test('invalid successor dates leave both published predecessor and draft unchanged', async () => {
  const previous = await BankRuleCatalogue.findOne({ where: { bankClass: 'SPECIAL_GRADE', status: 'PUBLISHED' } });
  const row = await catalogue.createDraft(1, draft({ effectiveDate: previous.effectiveDate, supersedesId: previous.id }));
  await assert.rejects(catalogue.publish(row.id, 1, { version: row.version, verified: true, verificationNote: 'Checked' }), /later effective date/);
  assert.equal((await previous.reload()).status, 'PUBLISHED');
  assert.equal((await row.reload()).status, 'DRAFT');
});
