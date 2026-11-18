'use strict';

const { Employee, AuditLog } = require('../models');
const { can } = require('./accessControl');

const FIELD_GROUPS = Object.freeze({
  IDENTITY: Object.freeze(['dob', 'panNumber', 'aadhaarNumber', 'uanNumber', 'pfNumber']),
  CONTACT: Object.freeze(['personalEmail', 'residenceAddress', 'emergencyContactName', 'emergencyContactNumber', 'emergencyContactRelation']),
  BANK: Object.freeze(['bankName', 'bankAccountNumber', 'bankIfsc']),
  MEDICAL: Object.freeze(['bloodGroup']),
});
const PURPOSES = Object.freeze([
  'IDENTITY_VERIFICATION',
  'STATUTORY_REPORTING',
  'PAYROLL_VERIFICATION',
  'HR_RECORD_MAINTENANCE',
  'EMERGENCY_RESPONSE',
  'DATA_RIGHTS_CASE',
  'SECURITY_INVESTIGATION',
]);

function fail(message, status) { return Object.assign(new Error(message), { status }); }
function maskedLastFour(value) { return value ? `••••${String(value).slice(-4)}` : value; }
function maskedEmail(value) { return value ? `••••${String(value).includes('@') ? String(value).slice(String(value).indexOf('@')) : ''}` : value; }

function maskEmployeeSensitive(employee) {
  const out = employee?.toJSON ? employee.toJSON() : { ...employee };
  for (const field of FIELD_GROUPS.IDENTITY) if (out[field] != null) out[field] = field === 'dob' ? 'Masked' : maskedLastFour(out[field]);
  for (const field of FIELD_GROUPS.CONTACT) if (out[field] != null) out[field] = field === 'personalEmail' ? maskedEmail(out[field]) : 'Masked';
  for (const field of FIELD_GROUPS.BANK) if (out[field] != null) out[field] = field === 'bankAccountNumber' ? maskedLastFour(out[field]) : 'Masked';
  for (const field of FIELD_GROUPS.MEDICAL) if (out[field] != null) out[field] = 'Masked';
  return out;
}

async function audit(actor, employeeId, action, details) {
  if (!actor?.id) return;
  await AuditLog.create({
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action,
    targetType: 'employee',
    targetId: employeeId == null ? null : String(employeeId),
    details,
  });
}

async function reveal({ actor, access, employeeId, fieldGroup, purpose, justification }) {
  const group = String(fieldGroup || '').toUpperCase();
  const reason = String(justification || '').trim();
  const context = { fieldGroup: group || null, purpose: purpose || null };
  if (!FIELD_GROUPS[group]) {
    await audit(actor, employeeId, 'dpdp.sensitive.denied', { ...context, outcome: 'DENIED', reason: 'INVALID_FIELD_GROUP' });
    throw fail('A valid sensitive field group is required.', 400);
  }
  if (!PURPOSES.includes(purpose)) {
    await audit(actor, employeeId, 'dpdp.sensitive.denied', { ...context, outcome: 'DENIED', reason: 'INVALID_PURPOSE' });
    throw fail('A valid access purpose is required.', 400);
  }
  if (reason.length < 12 || reason.length > 500) {
    await audit(actor, employeeId, 'dpdp.sensitive.denied', { ...context, outcome: 'DENIED', reason: 'INVALID_JUSTIFICATION' });
    throw fail('A justification of 12 to 500 characters is required.', 400);
  }

  const employee = await Employee.findOne({ where: { id: employeeId, organizationId: actor.organizationId } });
  if (!employee) {
    await audit(actor, employeeId, 'dpdp.sensitive.denied', { ...context, outcome: 'DENIED', reason: 'NOT_FOUND' });
    throw fail('Employee not found.', 404);
  }
  if (!can(access, 'dpdp.sensitive.view', employee)) {
    await audit(actor, employeeId, 'dpdp.sensitive.denied', { ...context, outcome: 'DENIED', reason: 'PERMISSION' });
    throw fail('Permission denied.', 403);
  }

  const values = Object.fromEntries(FIELD_GROUPS[group].map(field => [field, employee[field]]));
  await audit(actor, employee.id, 'dpdp.sensitive.view', {
    ...context,
    fields: FIELD_GROUPS[group],
    justification: reason,
    outcome: 'ALLOWED',
  });
  return { employeeId: employee.id, fieldGroup: group, purpose, values };
}

module.exports = { FIELD_GROUPS, PURPOSES, maskEmployeeSensitive, reveal };
