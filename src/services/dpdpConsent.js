'use strict';

const {
  DpdpConsentPurpose,
  DpdpConsentRecord,
  DpdpDocument,
  AuditLog,
} = require('../models');

function fail(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function required(value, name, max = 1000) {
  const clean = String(value || '').trim();
  if (!clean) fail(`${name} is required.`);
  if (clean.length > max) fail(`${name} is too long.`);
  return clean;
}

function orgOf(actor) {
  if (!actor?.organizationId) fail('Authenticated organisation user is required.', 401);
  return actor.organizationId;
}

async function upsertPurpose({ actor, id = null, data = {} }) {
  const organizationId = orgOf(actor);
  const code = required(data.code, 'code', 64).toUpperCase();
  const notice = await DpdpDocument.findOne({ where: { id: Number(data.noticeDocumentId), organizationId, ownerType: 'ORGANIZATION', state: 'PUBLISHED' } });
  if (!notice) fail('Published organisation notice not found.', 404);
  let row = id ? await DpdpConsentPurpose.findOne({ where: { id, organizationId } }) : await DpdpConsentPurpose.findOne({ where: { organizationId, code } });
  if (id && !row) fail('Consent purpose not found.', 404);
  const values = {
    organizationId,
    code,
    titleEn: required(data.titleEn, 'titleEn', 255),
    titleMl: data.titleMl ? String(data.titleMl).trim() : null,
    descriptionEn: required(data.descriptionEn, 'descriptionEn', 8000),
    descriptionMl: data.descriptionMl ? String(data.descriptionMl).trim() : null,
    dataCategories: Array.isArray(data.dataCategories) ? [...new Set(data.dataCategories.map(String))] : [],
    noticeDocumentId: notice.id,
    withdrawalConsequenceEn: data.withdrawalConsequenceEn ? String(data.withdrawalConsequenceEn).trim() : null,
    withdrawalConsequenceMl: data.withdrawalConsequenceMl ? String(data.withdrawalConsequenceMl).trim() : null,
    effectiveAt: data.effectiveAt ? new Date(data.effectiveAt) : new Date(),
    status: data.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
  };
  row = row ? await row.update(values) : await DpdpConsentPurpose.create(values);
  await AuditLog.create({ organizationId, actorUserId: actor.id, action: 'dpdp.consent_purpose.upsert', targetType: 'dpdp_consent_purpose', targetId: String(row.id), details: { code, status: row.status, noticeDocumentId: notice.id } });
  return row;
}

function listPurposes({ organizationId, status }) {
  return DpdpConsentPurpose.findAll({ where: { organizationId, ...(status ? { status } : {}) }, order: [['code', 'ASC']] });
}

async function recordChoice({ actor, employee, purposeCode, decision, channel = 'WEB', language = 'EN', ipReference = null, deviceReference = null }) {
  const organizationId = orgOf(actor);
  if (!employee || employee.organizationId !== organizationId) fail('Active linked employee record is required.', 409);
  if (!['GRANTED', 'WITHDRAWN'].includes(decision)) fail('Decision must be GRANTED or WITHDRAWN.');
  if (!['WEB', 'MOBILE'].includes(channel)) fail('Invalid consent channel.');
  if (!['EN', 'ML'].includes(language)) fail('Invalid consent language.');
  const purpose = await DpdpConsentPurpose.findOne({ where: { organizationId, code: String(purposeCode || '').toUpperCase(), status: 'ACTIVE' } });
  if (!purpose) fail('Optional consent purpose not found.', 404);
  const prior = await DpdpConsentRecord.findOne({ where: { organizationId, employeeId: employee.id, purposeId: purpose.id }, order: [['id', 'DESC']] });
  if (prior?.decision === decision) return prior;
  const row = await DpdpConsentRecord.create({
    organizationId,
    employeeId: employee.id,
    userId: actor.id,
    purposeId: purpose.id,
    noticeDocumentId: purpose.noticeDocumentId,
    decision,
    channel,
    language,
    ipReference: ipReference ? String(ipReference).slice(0, 128) : null,
    deviceReference: deviceReference ? String(deviceReference).slice(0, 128) : null,
    priorRecordId: prior?.id || null,
    recordedAt: new Date(),
  });
  await AuditLog.create({
    organizationId,
    actorUserId: actor.id,
    action: 'dpdp.consent.change',
    targetType: 'dpdp_consent_purpose',
    targetId: String(purpose.id),
    details: { purposeCode: purpose.code, decision, channel, language, noticeDocumentId: purpose.noticeDocumentId },
  });
  return row;
}

async function currentChoices({ actor, employee }) {
  const organizationId = orgOf(actor);
  if (!employee || employee.organizationId !== organizationId) fail('Active linked employee record is required.', 409);
  const purposes = await listPurposes({ organizationId, status: 'ACTIVE' });
  const records = await DpdpConsentRecord.findAll({ where: { organizationId, employeeId: employee.id }, order: [['id', 'DESC']] });
  const latest = new Map();
  records.forEach((row) => { if (!latest.has(row.purposeId)) latest.set(row.purposeId, row); });
  return purposes.map((purpose) => ({ ...purpose.toJSON(), decision: latest.get(purpose.id)?.decision || null, lastChangedAt: latest.get(purpose.id)?.recordedAt || null }));
}

module.exports = { upsertPurpose, listPurposes, recordChoice, currentChoices };
