'use strict';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONTACT_TYPES = Object.freeze([
  ['residential', 'RESIDENTIAL', 'Residential'],
  ['permanent', 'PERMANENT', 'Permanent'],
  ['correspondence', 'CORRESPONDENCE', 'Correspondence'],
]);

const OFFICE_TEXT_FIELDS = Object.freeze([
  ['pensionNumber', 'Pension Number', 64], ['ptNumber', 'PT Number', 64],
  ['esicNumber', 'ESIC Number', 64], ['lwfNumber', 'LWF Number', 64],
  ['edliNumber', 'EDLI Number', 64], ['vcNumber', 'VC Number', 64],
  ['ppNumber', 'PP Number', 64], ['dlNumber', 'DL Number', 64],
  ['rcNumber', 'RC Number', 64], ['giNumber', 'GI Number', 64],
  ['payMode', 'Pay Mode', 32], ['salaryBankName', 'Bank', 255],
  ['cbsBranchCode', 'CBS Branch Code', 64], ['cbsAccountType', 'CBS Account Type', 64],
  ['salaryAccountNumber', 'Account Number', 64],
  ['pfApplicationNumber', 'PF Application Number', 64],
  ['ptApplicationNumber', 'PT Application Number', 64],
  ['esicApplicationNumber', 'ESIC Application Number', 64],
  ['lwfApplicationNumber', 'LWF Application Number', 64],
  ['vpfApplicationNumber', 'VPF Application Number', 64],
  ['handicapRemark', 'Handicap Remark', 500],
]);

const SERVICE_DATES = Object.freeze([
  ['probationDate', 'Probation Date'], ['confirmationDate', 'Confirmation Date'],
  ['lastIncrementDate', 'Last Increment Date'], ['lastPromotionDate', 'Last Promotion Date'],
  ['lastTransferDate', 'Last Transfer Date'], ['seniorityDate', 'Seniority Date'],
  ['retirementDate', 'Retirement Date'], ['resignationDate', 'Resignation Date'],
  ['serviceLastDate', 'Service Last Date'], ['pfJoiningDate', 'PF Joining Date'],
  ['pensionJoiningDate', 'Pension Joining Date'], ['pfExitDate', 'PF Exit Date'],
  ['pensionExitDate', 'Pension Exit Date'],
]);

function text(value, label, max, errors) {
  const result = value == null ? '' : String(value).trim();
  if (result.length > max) errors.push(`${label} must not exceed ${max} characters.`);
  return result || null;
}

function date(value, label, errors) {
  const result = value == null ? '' : String(value).trim();
  if (!result) return null;
  const parsed = DATE.test(result) ? new Date(`${result}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) {
    errors.push(`${label} must be a valid date in YYYY-MM-DD format.`);
    return null;
  }
  return result;
}

function optionalBoolean(value, label, errors) {
  if (value == null || String(value).trim() === '') return false;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toUpperCase();
  if (['YES', 'Y', 'TRUE', '1'].includes(normalized)) return true;
  if (['NO', 'N', 'FALSE', '0'].includes(normalized)) return false;
  errors.push(`${label} must be YES or NO.`);
  return false;
}

function nonNegativeNumber(value, label, maximum, errors) {
  if (value == null || String(value).trim() === '') return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || (maximum != null && result > maximum)) {
    errors.push(`${label} must be a number between 0 and ${maximum}.`);
    return null;
  }
  return result;
}

function period(value, label, errors) {
  if (value == null || String(value).trim() === '') return null;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0 || result > 3650) {
    errors.push(`${label} must be a whole number of days from 0 to 3650.`);
    return null;
  }
  return result;
}

function normalizeEmployeeMasterData(input = {}, employee = {}) {
  const errors = [];
  const office = {};
  for (const [key, label, max] of OFFICE_TEXT_FIELDS) office[key] = text(input[key], label, max, errors);
  office.selfHandicap = optionalBoolean(input.selfHandicap, 'Self Handicap', errors);
  office.familyHandicap = optionalBoolean(input.familyHandicap, 'Family Handicap', errors);
  office.vpfDeclaredAmount = nonNegativeNumber(input.vpfDeclaredAmount, 'VPF Amount', 100000000, errors);
  office.vpfDeclaredPercent = nonNegativeNumber(input.vpfDeclaredPercent, 'VPF Percentage', 100, errors);

  const service = {
    probationPeriodDays: period(input.probationPeriodDays, 'Probation Period', errors),
    confirmationPeriodDays: period(input.confirmationPeriodDays, 'Confirmation Period', errors),
    seniorityNumber: text(input.seniorityNumber, 'Seniority Number', 64, errors),
    resignationReason: text(input.resignationReason, 'Resignation Reason', 1000, errors),
  };
  for (const [key, label] of SERVICE_DATES) service[key] = date(input[key], label, errors);

  const joiningDate = date(employee.doj || input.doj, 'Joining Date', errors);
  for (const [key, label] of SERVICE_DATES) {
    if (joiningDate && service[key] && service[key] < joiningDate) errors.push(`${label} must not be before Date of Joining.`);
  }
  if (service.resignationDate && service.serviceLastDate && service.serviceLastDate < service.resignationDate) {
    errors.push('Service Last Date must not be before Resignation Date.');
  }
  if (service.pfJoiningDate && service.pfExitDate && service.pfExitDate < service.pfJoiningDate) errors.push('PF Exit Date must not be before PF Joining Date.');
  if (service.pensionJoiningDate && service.pensionExitDate && service.pensionExitDate < service.pensionJoiningDate) errors.push('Pension Exit Date must not be before Pension Joining Date.');

  const contacts = [];
  for (const [prefix, addressType, label] of CONTACT_TYPES) {
    const contact = { addressType };
    for (const [suffix, max] of [['Address1', 255], ['Address2', 255], ['Address3', 255], ['Landmark', 255], ['Area', 128], ['City', 128], ['Taluka', 128], ['State', 128]]) {
      const key = `${prefix}${suffix}`;
      contact[suffix[0].toLowerCase() + suffix.slice(1)] = text(input[key], `${label} ${suffix}`, max, errors);
    }
    contact.email = text(input[`${prefix}Email`], `${label} Email`, 255, errors);
    contact.website = text(input[`${prefix}Website`], `${label} Website`, 500, errors);
    contact.faxNumber = text(input[`${prefix}FaxNumber`], `${label} Fax Number`, 40, errors);
    contact.contactNumber = text(input[`${prefix}ContactNumber`], `${label} Contact Number`, 40, errors);
    if (contact.email && !EMAIL.test(contact.email)) errors.push(`${label} Email must be a valid email address.`);
    if (contact.website) {
      try {
        const parsed = new URL(contact.website);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
      } catch { errors.push(`${label} Website must be a valid HTTP or HTTPS URL.`); }
    }
    for (const [key, fieldLabel] of [['faxNumber', 'Fax Number'], ['contactNumber', 'Contact Number']]) {
      if (contact[key] && (!/^[+()\d .-]+$/.test(contact[key]) || (contact[key].match(/\d/g) || []).length < 6)) errors.push(`${label} ${fieldLabel} must contain at least 6 digits and only valid telephone characters.`);
    }
    const supplied = Object.keys(input).some(key => key.startsWith(prefix));
    if (supplied || Object.entries(contact).some(([key, value]) => key !== 'addressType' && value != null)) contacts.push(contact);
  }
  return { office, service, contacts, errors };
}

function hasValues(record) {
  return Object.entries(record || {}).some(([key, value]) => !['employeeId', 'addressType'].includes(key) && value !== null && value !== false && value !== '');
}

module.exports = { normalizeEmployeeMasterData, hasValues, CONTACT_TYPES };
