'use strict';

const { OrgPayrollSetting } = require('../models');

const FIELDS = [
  'daPercent', 'hraType', 'hraPercent', 'hraFixedAmount', 'hraMaxAmount', 'pfEmployeePercent', 'pfEmployerPercent', 'pfCalculationBase',
  'gsliAmount', 'gsliCutoffDate', 'ptSchedule', 'ptMonth1', 'ptMonth2',
  'odMultiplier', 'odMaxAmount', 'odMaxRepayMonths', 'odInterestRatePercent',
  'festivalAdvanceRepayMonths', 'stagnationYears', 'stagnationExtraStages',
  'medicalAllowanceAmount', 'medicalAllowanceMonth',
  'bonusMonth', 'bonusResult', 'bonusProfitPercent', 'bonusProfitMaxAmount', 'bonusLossPercent', 'bonusLossMaxAmount',
  'ccaAmount', 'conveyanceAmount', 'vehicleLoanAllowMultiple', 'vehicleLoanInterestRatePercent',
  'retirementAge', 'yearType',
];

/** Get an organisation's payroll settings, creating the default row on first use. */
async function getSettings(organizationId) {
  const [row] = await OrgPayrollSetting.findOrCreate({ where: { organizationId }, defaults: { organizationId } });
  return row;
}

function normaliseUpdate(body) {
  const b = body || {};
  const out = {};
  for (const key of FIELDS) {
    if (b[key] === undefined) continue;
    out[key] = b[key] === '' ? null : b[key];
  }
  return out;
}

class PayrollSettingsInputError extends Error { constructor(m) { super(m); this.status = 400; } }

async function updateSettings(organizationId, body) {
  const row = await getSettings(organizationId);
  const update = normaliseUpdate(body);
  if (update.retirementAge != null) {
    const age = Number(update.retirementAge);
    if (!Number.isInteger(age) || age < 45 || age > 75) {
      throw new PayrollSettingsInputError('Retirement age must be a whole number of years between 45 and 75.');
    }
  }
  if (update.hraType != null && !['PERCENT', 'FIXED'].includes(update.hraType)) {
    throw new PayrollSettingsInputError('hraType must be PERCENT or FIXED.');
  }
  if (update.yearType != null && !['CALENDAR', 'FINANCIAL'].includes(update.yearType)) {
    throw new PayrollSettingsInputError('yearType must be CALENDAR or FINANCIAL.');
  }
  Object.assign(row, update);
  await row.save();
  return row;
}

module.exports = { getSettings, updateSettings, FIELDS, PayrollSettingsInputError };
