'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sequelize, Organization, User, Employee, PostCadre, DpdpDocument } = require('../src/models');
const dpdpDocuments = require('../src/services/dpdpDocuments');

let org;
let adminUser;

before(async () => {
  await sequelize.sync();
  org = await Organization.create({ code: 'DOC_TEST', name: 'Doc Test Bank' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'OFF_DOC', name: 'Officer' });
  const emp = await Employee.create({
    organizationId: org.id,
    empCode: 'DOC_EMP1',
    name: 'Doc Staff',
    doj: '2020-01-01',
    postCadreId: post.id,
    currentBasicPay: 40000,
  });
  adminUser = await User.create({
    organizationId: org.id,
    email: 'admin@docbank.invalid',
    name: 'Doc Admin',
    role: 'ORG_ADMIN',
    employeeId: emp.id,
    passwordHash: 'dummy',
  });
});

after(async () => {
  await sequelize.close();
});

test('publishDocument validates non-empty title, body, and owner constraints', async () => {
  // Empty body rejection
  await assert.rejects(async () => {
    await dpdpDocuments.publishDocument({
      ownerType: 'PLATFORM',
      type: 'TERMS',
      title: 'Platform Terms',
      body: '   ',
      version: '1.0',
      actor: adminUser,
    });
  }, /body|content/i);

  // Platform cannot publish EMPLOYEE_NOTICE
  await assert.rejects(async () => {
    await dpdpDocuments.publishDocument({
      ownerType: 'PLATFORM',
      type: 'EMPLOYEE_NOTICE',
      title: 'Bank Notice',
      body: 'Content',
      version: '1.0',
      actor: adminUser,
    });
  }, /type|owner/i);

  // Organization cannot publish TERMS
  await assert.rejects(async () => {
    await dpdpDocuments.publishDocument({
      ownerType: 'ORGANIZATION',
      organizationId: org.id,
      type: 'TERMS',
      title: 'Terms',
      body: 'Content',
      version: '1.0',
      actor: adminUser,
    });
  }, /type|owner/i);
});

test('publishDocument publishes document, supersedes prior published version and records publisher', async () => {
  const doc1 = await dpdpDocuments.publishDocument({
    ownerType: 'PLATFORM',
    type: 'TERMS',
    title: 'Terms v1',
    body: 'Terms content v1',
    version: '1.0',
    actor: adminUser,
  });

  assert.equal(doc1.state, 'PUBLISHED');
  assert.equal(doc1.version, '1.0');
  assert.ok(doc1.publishedAt);
  assert.equal(doc1.publishedBy, adminUser.id);

  // Publishing v1.1 should supersede v1.0
  const doc2 = await dpdpDocuments.publishDocument({
    ownerType: 'PLATFORM',
    type: 'TERMS',
    title: 'Terms v1.1',
    body: 'Terms content v1.1',
    version: '1.1',
    actor: adminUser,
  });

  assert.equal(doc2.state, 'PUBLISHED');
  assert.equal(doc2.version, '1.1');

  await doc1.reload();
  assert.equal(doc1.state, 'SUPERSEDED');
  assert.ok(doc1.supersededAt);
});

test('activeBundle resolves the active platform-plus-organisation documents', async () => {
  // Publish platform privacy
  await dpdpDocuments.publishDocument({
    ownerType: 'PLATFORM',
    type: 'PLATFORM_PRIVACY',
    title: 'Platform Privacy',
    body: 'Privacy content',
    version: '1.0',
    actor: adminUser,
  });

  // Publish organization employee notice
  await dpdpDocuments.publishDocument({
    ownerType: 'ORGANIZATION',
    organizationId: org.id,
    type: 'EMPLOYEE_NOTICE',
    title: 'Employee DPDP Notice',
    body: 'Bank notice content',
    version: '1.0',
    actor: adminUser,
  });

  const bundle = await dpdpDocuments.activeBundle({ organizationId: org.id });
  assert.ok(bundle.terms);
  assert.equal(bundle.terms.version, '1.1');
  assert.ok(bundle.platformPrivacy);
  assert.equal(bundle.platformPrivacy.version, '1.0');
  assert.ok(bundle.employeeNotice);
  assert.equal(bundle.employeeNotice.version, '1.0');

  const requiredIds = dpdpDocuments.requiredDocumentIds(bundle);
  assert.equal(requiredIds.length, 3);
  assert.deepEqual(requiredIds, [bundle.terms.id, bundle.platformPrivacy.id, bundle.employeeNotice.id]);
});

test('future-effective publication preserves the currently effective document', async () => {
  const current = (await dpdpDocuments.activeBundle({ organizationId: org.id })).terms;
  const future = await dpdpDocuments.publishDocument({
    ownerType: 'PLATFORM',
    type: 'TERMS',
    title: 'Terms future',
    body: 'Terms content effective next month',
    version: '9.0-future',
    effectiveAt: new Date(Date.now() + 30 * 86400000),
    actor: adminUser,
  });

  await current.reload();
  assert.equal(current.state, 'PUBLISHED');
  assert.equal(future.state, 'PUBLISHED');
  assert.equal((await dpdpDocuments.activeBundle({ organizationId: org.id })).terms.id, current.id);
});
