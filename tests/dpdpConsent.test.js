'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sequelize, Organization, User, Employee, PostCadre, AuditLog, DpdpConsentRecord } = require('../src/models');
const documents = require('../src/services/dpdpDocuments');
const consent = require('../src/services/dpdpConsent');

let org;
let actor;
let employee;
let notice;

before(async () => {
  await sequelize.sync({ force: true });
  org = await Organization.create({ code: 'CONSENT', name: 'Consent Bank' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'OFF', name: 'Officer' });
  employee = await Employee.create({ organizationId: org.id, empCode: 'C1', name: 'Consent Employee', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 10000 });
  actor = await User.create({ organizationId: org.id, employeeId: employee.id, email: 'employee@consent.invalid', name: 'Consent Employee', role: 'EMPLOYEE', passwordHash: 'x' });
  notice = await documents.publishDocument({
    ownerType: 'ORGANIZATION', organizationId: org.id, type: 'EMPLOYEE_NOTICE', version: '1.0', title: 'Optional Benefits Notice',
    body: 'English notice body', summary: 'English summary', bodyMl: 'മലയാളം അറിയിപ്പ്', summaryMl: 'മലയാളം സംഗ്രഹം', actor,
  });
});

after(async () => sequelize.close());

test('bilingual notice keeps English and Malayalam in one published version', async () => {
  const bundle = await documents.activeBundle({ organizationId: org.id });
  const view = documents.publicDocumentView(bundle.employeeNotice);
  assert.equal(view.version, '1.0');
  assert.equal(view.body, 'English notice body');
  assert.equal(view.bodyMl, 'മലയാളം അറിയിപ്പ്');
  assert.equal(view.summaryMl, 'മലയാളം സംഗ്രഹം');
});

test('optional consent grant and withdrawal are append-only and mandatory acknowledgement stays separate', async () => {
  const purpose = await consent.upsertPurpose({
    actor,
    data: {
      code: 'PROMOTIONAL_PHOTO', titleEn: 'Promotional photographs', titleMl: 'പ്രചാരണ ചിത്രങ്ങൾ',
      descriptionEn: 'Use photographs in voluntary bank communications.', descriptionMl: 'സ്വമേധയാ ബാങ്ക് ആശയവിനിമയങ്ങളിൽ ചിത്രങ്ങൾ ഉപയോഗിക്കുക.',
      dataCategories: ['PHOTOGRAPH'], noticeDocumentId: notice.id, withdrawalConsequenceEn: 'Future use stops.', status: 'ACTIVE',
    },
  });

  const granted = await consent.recordChoice({ actor, employee, purposeCode: purpose.code, decision: 'GRANTED', channel: 'WEB', language: 'ML', ipReference: 'ip-hash', deviceReference: 'browser-ref' });
  const withdrawn = await consent.recordChoice({ actor, employee, purposeCode: purpose.code, decision: 'WITHDRAWN', channel: 'WEB', language: 'ML', ipReference: 'ip-hash', deviceReference: 'browser-ref' });

  assert.equal(granted.priorRecordId, null);
  assert.equal(withdrawn.priorRecordId, granted.id);
  assert.equal(await DpdpConsentRecord.count({ where: { employeeId: employee.id, purposeId: purpose.id } }), 2);
  const current = await consent.currentChoices({ actor, employee });
  assert.equal(current[0].decision, 'WITHDRAWN');
  assert.equal(typeof consent.deleteChoice, 'undefined');

  const logs = await AuditLog.findAll({ where: { organizationId: org.id, action: 'dpdp.consent.change' } });
  assert.equal(logs.length, 2);
  const serialized = JSON.stringify(logs.map((row) => row.details));
  assert.doesNotMatch(serialized, /English notice body|മലയാളം|browser-ref|ip-hash/);
});
