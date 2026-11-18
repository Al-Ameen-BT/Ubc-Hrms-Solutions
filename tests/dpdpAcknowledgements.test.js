'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  sequelize,
  Organization,
  User,
  Employee,
  PostCadre,
  DpdpDocument,
  DpdpAcknowledgement,
} = require('../src/models');
const dpdpDocuments = require('../src/services/dpdpDocuments');
const dpdpAcknowledgements = require('../src/services/dpdpAcknowledgements');

let org;
let post;
let emp;
let user;
let termsDoc;
let privacyDoc;
let noticeDoc;

before(async () => {
  await sequelize.sync();
  org = await Organization.create({ code: 'ACK_TEST', name: 'Ack Test Bank' });
  post = await PostCadre.create({ organizationId: org.id, code: 'OFF_ACK', name: 'Officer' });
  emp = await Employee.create({
    organizationId: org.id,
    empCode: 'ACK_E1',
    name: 'Ack Staff',
    doj: '2020-01-01',
    postCadreId: post.id,
    currentBasicPay: 40000,
  });
  user = await User.create({
    organizationId: org.id,
    email: 'user@acktest.invalid',
    name: 'Ack User',
    role: 'EMPLOYEE',
    employeeId: emp.id,
    passwordHash: 'dummy',
  });

  termsDoc = await dpdpDocuments.publishDocument({
    ownerType: 'PLATFORM',
    type: 'TERMS',
    title: 'Terms v1',
    body: 'Terms content',
    version: '1.0-ack',
    actor: user,
  });

  privacyDoc = await dpdpDocuments.publishDocument({
    ownerType: 'PLATFORM',
    type: 'PLATFORM_PRIVACY',
    title: 'Privacy v1',
    body: 'Privacy content',
    version: '1.0-ack',
    actor: user,
  });

  noticeDoc = await dpdpDocuments.publishDocument({
    ownerType: 'ORGANIZATION',
    organizationId: org.id,
    type: 'EMPLOYEE_NOTICE',
    title: 'Notice v1',
    body: 'Notice content',
    version: '1.0-ack',
    actor: user,
  });
});

after(async () => {
  await sequelize.close();
});

test('acknowledgementStatus identifies all missing required documents', async () => {
  const status = await dpdpAcknowledgements.acknowledgementStatus({ user, channel: 'WEB' });
  assert.equal(status.isCurrent, false);
  assert.equal(status.missingDocumentIds.length, 3);
  assert.ok(status.missingDocumentIds.includes(termsDoc.id));
  assert.ok(status.missingDocumentIds.includes(privacyDoc.id));
  assert.ok(status.missingDocumentIds.includes(noticeDoc.id));
});

test('recordAcknowledgements records evidence and updates status to current', async () => {
  const result = await dpdpAcknowledgements.recordAcknowledgements({
    user,
    employee: emp,
    documentIds: [termsDoc.id, privacyDoc.id, noticeDoc.id],
    channel: 'WEB',
  });

  assert.equal(result.recordedCount, 3);

  const status = await dpdpAcknowledgements.acknowledgementStatus({ user, channel: 'WEB' });
  assert.equal(status.isCurrent, true);
  assert.equal(status.missingDocumentIds.length, 0);
});

test('publishing a new document version makes status non-current again', async () => {
  // Publish v1.1 of terms
  const termsV2 = await dpdpDocuments.publishDocument({
    ownerType: 'PLATFORM',
    type: 'TERMS',
    title: 'Terms v2',
    body: 'Updated terms content',
    version: '2.0-ack',
    actor: user,
  });

  const status = await dpdpAcknowledgements.acknowledgementStatus({ user, channel: 'WEB' });
  assert.equal(status.isCurrent, false);
  assert.equal(status.missingDocumentIds.length, 1);
  assert.equal(status.missingDocumentIds[0], termsV2.id);
});

test('a future document does not become required before its effective time', async () => {
  const current = (await dpdpDocuments.activeBundle({ organizationId: org.id })).terms;
  const future = await dpdpDocuments.publishDocument({
    ownerType: 'PLATFORM',
    type: 'TERMS',
    title: 'Future terms',
    body: 'Future terms content',
    version: '3.0-ack-future',
    effectiveAt: new Date(Date.now() + 86400000),
    actor: user,
  });

  const status = await dpdpAcknowledgements.acknowledgementStatus({ user, channel: 'WEB' });
  assert.equal(status.requiredDocumentIds.includes(current.id), true);
  assert.equal(status.requiredDocumentIds.includes(future.id), false);
});
