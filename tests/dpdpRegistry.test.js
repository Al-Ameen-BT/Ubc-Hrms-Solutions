'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  sequelize,
  Organization,
  User,
  DpdpProcessingActivity,
  DpdpProcessor,
  DpdpSharingEvent,
  DpdpControlAssessment,
} = require('../src/models');
const registry = require('../src/services/dpdpRegistry');

let org1;
let org2;
let actor;

before(async () => {
  await sequelize.sync({ force: true });
  org1 = await Organization.create({ code: 'REG_ONE', name: 'Registry Bank One' });
  org2 = await Organization.create({ code: 'REG_TWO', name: 'Registry Bank Two' });
  actor = await User.create({ organizationId: org1.id, email: 'dpo@registry.invalid', name: 'Registry DPO', role: 'DATA_PROTECTION_OFFICER', passwordHash: 'x' });
});

after(async () => sequelize.close());

test('processing register enforces tenant isolation and biometric readiness controls', async () => {
  const processor = await registry.upsertProcessor({
    actor,
    data: { code: 'BIO_VENDOR', name: 'Attendance Vendor', serviceCategory: 'BIOMETRIC_ATTENDANCE', dpaStatus: 'CURRENT', status: 'ACTIVE' },
  });

  await assert.rejects(
    registry.upsertProcessingActivity({
      actor,
      data: {
        code: 'FINGERPRINT', module: 'ATTENDANCE', storageLocation: 'vendor template store', fieldName: 'fingerprintTemplate',
        dataCategory: 'HIGH_RISK_BIOMETRIC', principalType: 'EMPLOYEE', purpose: 'Attendance verification',
        lawfulBasis: 'EMPLOYMENT_LEGITIMATE_USE', securityClassification: 'RESTRICTED', processorIds: [processor.id],
      },
    }),
    /biometric.*DPIA.*alternative.*raw/i,
  );

  const activity = await registry.upsertProcessingActivity({
    actor,
    data: {
      code: 'FINGERPRINT', module: 'ATTENDANCE', storageLocation: 'vendor template store', fieldName: 'fingerprintTemplate',
      dataCategory: 'HIGH_RISK_BIOMETRIC', principalType: 'EMPLOYEE', purpose: 'Attendance verification',
      lawfulBasis: 'EMPLOYMENT_LEGITIMATE_USE', securityClassification: 'RESTRICTED', processorIds: [processor.id],
      retentionCategory: 'BIOMETRIC_ATTENDANCE',
      dpiaRequired: true, riskReviewStatus: 'APPROVED', biometricAlternativeAvailable: true, rawBiometricStored: false,
    },
  });

  assert.equal(activity.organizationId, org1.id);
  assert.equal((await registry.listProcessingActivities({ organizationId: org1.id })).length, 1);
  assert.equal((await registry.listProcessingActivities({ organizationId: org2.id })).length, 0);

  const foreignProcessor = await DpdpProcessor.create({ organizationId: org2.id, code: 'FOREIGN', name: 'Foreign Processor', status: 'ACTIVE' });
  await assert.rejects(
    registry.upsertProcessingActivity({ actor, data: { ...activity.toJSON(), id: undefined, code: 'FOREIGN_LINK', processorIds: [foreignProcessor.id] } }),
    /processor not found/i,
  );
});

test('sharing ledger is append-only and control assessments drive readiness dashboard', async () => {
  const activity = await DpdpProcessingActivity.findOne({ where: { organizationId: org1.id } });
  const processor = await DpdpProcessor.findOne({ where: { organizationId: org1.id } });

  const event = await registry.recordSharingEvent({
    actor,
    data: {
      principalType: 'EMPLOYEE', principalReference: 'EMP-101', processingActivityId: activity.id,
      processorId: processor.id, dataCategories: ['HIGH_RISK_BIOMETRIC'], purpose: 'Attendance verification',
      lawfulAuthority: 'EMPLOYMENT_LEGITIMATE_USE', sharedAt: '2026-11-18T10:00:00.000Z',
    },
  });
  assert.equal(event.organizationId, org1.id);
  assert.equal(typeof registry.updateSharingEvent, 'undefined');
  assert.equal((await registry.listSharingEvents({ organizationId: org1.id })).length, 1);

  await registry.upsertControlAssessment({
    actor,
    data: { controlCode: 'ENCRYPTION_AT_REST', title: 'Encryption at rest', status: 'IMPLEMENTED', evidenceReference: 'KMS review 2026-11', verifiedAt: '2026-11-18' },
  });
  await registry.upsertControlAssessment({
    actor,
    data: { controlCode: 'SIEM_FORWARDING', title: 'SIEM forwarding', status: 'PARTIAL', evidenceReference: 'Audit stream only' },
  });

  assert.equal((await registry.listControlAssessments({ organizationId: org2.id })).length, 0);
  const dashboard = await registry.dashboard(org1.id);
  assert.deepEqual(dashboard.processingActivities, { total: 1, ready: 1 });
  assert.deepEqual(dashboard.processors, { total: 1, current: 1 });
  assert.deepEqual(dashboard.controls, { total: 2, implemented: 1, gaps: 1 });
  assert.equal(dashboard.sharingEvents, 1);

  assert.ok(DpdpSharingEvent);
  assert.ok(DpdpControlAssessment);
});
