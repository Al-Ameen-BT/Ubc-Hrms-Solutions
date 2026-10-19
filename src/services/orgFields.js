'use strict';

/**
 * Validation + normalisation of organisation fields coming from the Super
 * Admin (profile + licence) and the Org Admin (contact details only).
 */

const PLANS = ['TRIAL', 'STANDARD', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM'];

// The 6 Kerala UCB licensing classes (Annexure-1 of the KSR pay-scale
// circular). Chosen once, at organisation-creation time — see
// services/payScaleLibrary.js for the class label text and the reference
// pay-scale/post library each one provisions.
const BANK_CLASSES = ['SPECIAL_GRADE', 'CLASS_I', 'CLASS_II', 'CLASS_III', 'CLASS_IV', 'CLASS_V'];

class OrgFieldError extends Error { constructor(m) { super(m); this.status = 400; } }

const ymd = /^\d{4}-\d{2}-\d{2}$/;

function dateOrNull(v, label) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (!ymd.test(v) || Number.isNaN(Date.parse(v))) throw new OrgFieldError(`${label} must be a date (YYYY-MM-DD) or empty`);
  return v;
}

function limitOrNull(v, label) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 1000000) throw new OrgFieldError(`${label} must be a whole number of at least 1, or empty for unlimited`);
  return n;
}

function textOrNull(v, max) {
  if (v === undefined) return undefined;
  const t = String(v == null ? '' : v).trim();
  return t ? t.slice(0, max) : null;
}

function normaliseCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(c)) {
    throw new OrgFieldError('Organisation code must be 2–32 characters: letters, digits, hyphen or underscore. It becomes part of the bank\'s login address, so keep it short (e.g. TUCB).');
  }
  return c;
}

/**
 * Validates + normalises an organisation's custom domain — the client's own
 * subdomain that they point at this application with a DNS CNAME (e.g.
 * "hrms.theirbank.in"). A pasted URL is reduced to a bare, lower-case
 * hostname; empty clears it (returns null). Rejects anything that isn't a
 * plain multi-label hostname (no scheme, path, port, IP or wildcard) so the
 * value is safe to interpolate into a DNS record and a login URL.
 */
function normaliseDomain(value) {
  if (value === undefined) return undefined;
  const raw = String(value == null ? '' : value).trim().toLowerCase();
  if (!raw) return null;
  const host = raw
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '') // scheme
    .replace(/[/?#].*$/, '')               // path / query / fragment
    .replace(/:\d+$/, '')                  // port
    .replace(/\.+$/, '');                  // trailing dot(s)
  if (host.length > 255 || !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)) {
    throw new OrgFieldError('Custom domain must be a plain hostname such as hrms.yourbank.in — no http://, port or path.');
  }
  return host;
}

/** Licence + profile fields a Super Admin may set. Returns only keys present in body. */
function superAdminFields(body) {  const b = body || {};
  const out = {};
  const set = (k, v) => { if (v !== undefined) out[k] = v; };

  if (b.name !== undefined) {
    const n = String(b.name || '').trim();
    if (!n) throw new OrgFieldError('Registered name cannot be empty');
    out.name = n.slice(0, 255);
  }
  set('shortName', textOrNull(b.shortName, 64));
  set('regulator', textOrNull(b.regulator, 128));
  set('address', textOrNull(b.address, 2000));
  set('contactEmail', textOrNull(b.contactEmail, 255));
  set('contactPhone', textOrNull(b.contactPhone, 64));
  set('website', textOrNull(b.website, 255));

  if (b.status !== undefined) {
    if (!['ACTIVE', 'INACTIVE'].includes(b.status)) throw new OrgFieldError("status must be 'ACTIVE' or 'INACTIVE'");
    out.status = b.status;
  }
  if (b.licensePlan !== undefined) {
    if (b.licensePlan === null || b.licensePlan === '') out.licensePlan = null;
    else if (!PLANS.includes(b.licensePlan)) throw new OrgFieldError(`licensePlan must be one of ${PLANS.join(', ')}`);
    else out.licensePlan = b.licensePlan;
  }
  set('licenseStartsAt', dateOrNull(b.licenseStartsAt, 'Licence start date'));
  set('licenseExpiresAt', dateOrNull(b.licenseExpiresAt, 'Licence expiry date'));
  set('maxUsers', limitOrNull(b.maxUsers, 'Maximum users'));
  set('maxEmployees', limitOrNull(b.maxEmployees, 'Maximum employees'));
  set('licenseNotes', textOrNull(b.licenseNotes, 500));
  if (b.bankClass !== undefined) {
    if (!BANK_CLASSES.includes(b.bankClass)) {
      throw new OrgFieldError(`bankClass must be one of ${BANK_CLASSES.join(', ')}`);
    }
    out.bankClass = b.bankClass;
  }
  set('customDomain', normaliseDomain(b.customDomain));
  return out;
}

/** The subset an Org Admin may change about their own bank. */
function orgAdminFields(body) {
  const b = body || {};
  const out = {};
  const set = (k, v) => { if (v !== undefined) out[k] = v; };
  set('shortName', textOrNull(b.shortName, 64));
  set('address', textOrNull(b.address, 2000));
  set('contactEmail', textOrNull(b.contactEmail, 255));
  set('contactPhone', textOrNull(b.contactPhone, 64));
  set('website', textOrNull(b.website, 255));
  if (out.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.contactEmail)) throw new OrgFieldError('Contact email is not valid');
  return out;
}

function checkDateOrder(org) {
  if (org.licenseStartsAt && org.licenseExpiresAt && String(org.licenseExpiresAt) < String(org.licenseStartsAt)) {
    throw new OrgFieldError('Licence expiry date cannot be before its start date');
  }
}

// ---------------------------------------------------------------------
// Per-organisation mandatory Employee fields. Emp Code, Name, Date of
// Joining and Post are structural (NOT NULL at the database level, or
// otherwise foundational) and are always required — not included here, and
// never toggleable. Date of Retirement isn't listed either: it's now
// auto-calculated from Date of Birth (services/loans.js retirementDate()),
// so requiring it just means requiring DOB, already covered below.
//
// The original 9 fields (through 'gender' below) default to mandatory, same
// as always — an Org Admin may switch individual ones off for their own
// bank only (Organization.mandatoryEmployeeFields). Task 78 expanded the
// TOGGLEABLE list to 21 so there's more to choose from, but a field added
// here afterwards defaults OFF (defaultOn: false) unless an Org Admin
// opts in — flipping it on for everyone by default would silently block
// employee creation for every existing organisation that's never entered
// things like Blood Group or UAN. The frontend's per-field asterisk/
// validation mirrors this list one for one — see
// MANDATORY_FIELD_APPLY_MAP in public/js/views-master.js.
// ---------------------------------------------------------------------
const MANDATORY_FIELD_DEFS = [
  { key: 'panNumber', label: 'PAN' },
  { key: 'aadhaarNumber', label: 'Aadhaar' },
  { key: 'personalEmail', label: 'Personal email' },
  { key: 'dob', label: 'Date of Birth' },
  { key: 'currentPayScaleId', label: 'Grade' },
  { key: 'designation', label: 'Designation' },
  { key: 'bankDetails', label: 'Bank account details' }, // bankName + bankAccountNumber + bankIfsc together
  { key: 'currentStageId', label: 'Stage' },
  { key: 'gender', label: 'Gender' },
  // ---- added in task 78, "need more fields to select from" — default OFF ----
  { key: 'fatherName', label: "Father's Name", defaultOn: false },
  { key: 'officeEmail', label: 'Office email', defaultOn: false },
  { key: 'residenceAddress', label: 'Residence address', defaultOn: false },
  { key: 'emergencyContactName', label: 'Emergency contact name', defaultOn: false },
  { key: 'emergencyContactNumber', label: 'Emergency contact number', defaultOn: false },
  { key: 'emergencyContactRelation', label: 'Emergency contact relation', defaultOn: false },
  { key: 'branchName', label: 'Branch name', defaultOn: false },
  { key: 'department', label: 'Department', defaultOn: false },
  { key: 'uanNumber', label: 'UAN', defaultOn: false },
  { key: 'pfNumber', label: 'PF Number', defaultOn: false },
  { key: 'educationalQualification', label: 'Educational Qualification', defaultOn: false },
  { key: 'bloodGroup', label: 'Blood Group', defaultOn: false },
];
const MANDATORY_FIELD_KEYS = MANDATORY_FIELD_DEFS.map((f) => f.key);

function defaultMandatoryConfig() {
  const out = {};
  MANDATORY_FIELD_DEFS.forEach((f) => { out[f.key] = f.defaultOn !== false; });
  return out;
}

/** Merges an organisation's saved overrides onto the all-mandatory default. */
function mandatoryConfigFor(org) {
  return Object.assign(defaultMandatoryConfig(), (org && org.mandatoryEmployeeFields) || {});
}

/** Validates + normalises a PUT body for Organization.mandatoryEmployeeFields. */
function normaliseMandatoryConfig(body) {
  const b = body || {};
  const out = {};
  for (const key of Object.keys(b)) {
    if (!MANDATORY_FIELD_KEYS.includes(key)) throw new OrgFieldError(`Unknown field "${key}"`);
    out[key] = !!b[key];
  }
  return out;
}

/**
 * `effective` is the employee's field values AFTER this request's changes
 * are applied (the caller merges payload onto the existing row) — throws
 * naming every currently-mandatory field left empty.
 */
function validateEmployeeMandatoryFields(org, effective) {
  const config = mandatoryConfigFor(org);
  const missing = [];
  for (const f of MANDATORY_FIELD_DEFS) {
    if (!config[f.key]) continue;
    if (f.key === 'bankDetails') {
      if (!effective.bankName || !effective.bankAccountNumber || !effective.bankIfsc) missing.push(f.label);
      continue;
    }
    const v = effective[f.key];
    if (v === undefined || v === null || v === '') missing.push(f.label);
  }
  if (missing.length) {
    throw new OrgFieldError(`This organisation requires: ${missing.join(', ')}.`);
  }
}

// ---------------------------------------------------------------------
// Organisation Profile — bank identity fields an Org Admin may enter
// about their own bank (task 75). Distinct from orgAdminFields() above
// (contact details) and superAdminFields() (licence/plan) — these are
// purely descriptive/statutory fields with no licensing effect.
// ---------------------------------------------------------------------
function orgProfileFields(body) {
  const b = body || {};
  const out = {};
  const set = (k, v) => { if (v !== undefined) out[k] = v; };

  if (b.establishedYear !== undefined) {
    if (b.establishedYear === null || b.establishedYear === '') out.establishedYear = null;
    else {
      const y = Number(b.establishedYear);
      const thisYear = new Date().getFullYear();
      if (!Number.isInteger(y) || y < 1800 || y > thisYear) throw new OrgFieldError(`Established year must be between 1800 and ${thisYear}`);
      out.establishedYear = y;
    }
  }
  set('registrationNumber', textOrNull(b.registrationNumber, 128));
  set('rbiLicenseNumber', textOrNull(b.rbiLicenseNumber, 128));
  set('rbiLicenseDate', dateOrNull(b.rbiLicenseDate, 'RBI licence date'));
  set('gstn', textOrNull(b.gstn, 32));
  set('panNumber', textOrNull(b.panNumber, 16));
  // Organisation / Head Office address — same column used on document
  // headers/footers (services/documentHeader.js) and Settings → Organisation
  // (orgAdminFields above); editable directly from this page too (task 79)
  // so an Org Admin doesn't have to leave Organisation Profile to set it.
  set('address', textOrNull(b.address, 2000));
  return out;
}

// ---------------------------------------------------------------------
// Organisation Profile — statutory document uploads (task 79): RBI
// licence, incorporation/registration certificate, PAN, GSTN, TAN, or
// anything else the bank wants on file (OTHER, with its own free-text
// label). Stored as bytes in OrganizationDocument, same pattern as
// OrganizationBoardMember's photo / GovernmentOrderDocument.
// ---------------------------------------------------------------------
const ORG_DOC_TYPES = [
  { key: 'RBI_LICENSE', label: 'RBI Licence' },
  { key: 'INCORPORATION_CERTIFICATE', label: 'Incorporation / Registration Certificate' },
  { key: 'PAN', label: 'PAN Card' },
  { key: 'GSTN', label: 'GST Registration Certificate' },
  { key: 'TAN', label: 'TAN Allotment Letter' },
  { key: 'OTHER', label: 'Other' },
];
const ORG_DOC_TYPE_KEYS = ORG_DOC_TYPES.map((t) => t.key);

/** Validates + normalises a POST body for OrganizationDocument (bytes handled separately). */
function orgDocumentFields(body) {
  const b = body || {};
  if (!ORG_DOC_TYPE_KEYS.includes(b.docType)) throw new OrgFieldError(`docType must be one of ${ORG_DOC_TYPE_KEYS.join(', ')}`);
  const out = { docType: b.docType };
  const label = textOrNull(b.label, 128);
  if (b.docType === 'OTHER' && !label) throw new OrgFieldError('Please give a label for "Other"');
  out.label = label || null;
  return out;
}

/**
 * Validates + normalises a POST/PUT body for OrganizationBranch. Accepts
 * the request body's `branchCode` (what the frontend/API callers send) and
 * maps it onto the model's actual column, `code`.
 */
function branchFields(body) {
  const b = body || {};
  const out = {};
  if (b.name !== undefined) {
    const n = String(b.name || '').trim();
    if (!n) throw new OrgFieldError('Branch name cannot be empty');
    out.name = n.slice(0, 255);
  }
  const set = (k, v) => { if (v !== undefined) out[k] = v; };
  set('code', textOrNull(b.branchCode, 32));
  set('address', textOrNull(b.address, 2000));
  set('phone', textOrNull(b.phone, 64));
  return out;
}

// Matches OrganizationBoardMember's `role` ENUM. MEMBER covers a generic
// "board member"; OTHER is a free-text role via roleOther (e.g. a bank that
// also wants to list a Company Secretary).
const BOARD_ROLES = ['CHAIRMAN', 'VICE_CHAIRMAN', 'MEMBER', 'MANAGING_DIRECTOR', 'GENERAL_MANAGER', 'ASSISTANT_GENERAL_MANAGER', 'OTHER'];

/**
 * Validates + normalises a POST/PUT body for OrganizationBoardMember
 * (photo handled separately via brandAssets). Does NOT enforce the
 * "OTHER requires roleOther" rule itself — on an update, only the caller
 * knows the row's pre-existing role/roleOther when the body doesn't touch
 * one of them, so routes/orgSettings.js checks that against the merged,
 * effective values (see assertBoardRoleOther below).
 */
function boardMemberFields(body) {
  const b = body || {};
  const out = {};
  if (b.name !== undefined) {
    const n = String(b.name || '').trim();
    if (!n) throw new OrgFieldError('Name cannot be empty');
    out.name = n.slice(0, 255);
  }
  if (b.role !== undefined) {
    if (!BOARD_ROLES.includes(b.role)) throw new OrgFieldError(`role must be one of ${BOARD_ROLES.join(', ')}`);
    out.role = b.role;
    if (b.role !== 'OTHER') out.roleOther = null; // a role other than OTHER never carries a free-text designation
  }
  if (b.roleOther !== undefined) out.roleOther = textOrNull(b.roleOther, 128);
  if (b.displayOrder !== undefined) {
    const n = Number(b.displayOrder);
    out.displayOrder = Number.isInteger(n) && n >= 0 ? n : 0;
  }
  return out;
}

/** effective = { role, roleOther } AFTER this request's changes are applied. Throws if role is OTHER with no designation. */
function assertBoardRoleOther(effective) {
  if (effective.role === 'OTHER' && !effective.roleOther) {
    throw new OrgFieldError('Please give a designation for "Other"');
  }
}

module.exports = {
  PLANS, BANK_CLASSES, superAdminFields, orgAdminFields, normaliseCode, normaliseDomain, checkDateOrder, OrgFieldError,
  MANDATORY_FIELD_DEFS, defaultMandatoryConfig, mandatoryConfigFor, normaliseMandatoryConfig, validateEmployeeMandatoryFields,
  orgProfileFields, branchFields, boardMemberFields, assertBoardRoleOther, BOARD_ROLES,
  ORG_DOC_TYPES, ORG_DOC_TYPE_KEYS, orgDocumentFields,
};
