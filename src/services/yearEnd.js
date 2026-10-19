'use strict';

/**
 * Year-End Process — lets an organisation close its books for a year, once
 * it has chosen (OrgPayrollSetting.yearType) whether "a year" means the
 * calendar year (1 Jan - 31 Dec) or the Indian financial year (1 Apr -
 * 31 Mar). See services/dateUtils.js yearBounds()/yearLabelFor() for the
 * boundary math this is built on.
 *
 * Closing a year is a governance action, not a data-deleting one: it
 * snapshots a summary of that year's payroll activity and flips the
 * YearEndClosure row to CLOSED, which routes/payroll.js then checks before
 * allowing a NEW payroll run to be processed for any month inside that
 * year — reopening (SUPER_ADMIN/ORG_ADMIN only) undoes that block.
 */

const { Op } = require('sequelize');
const { sequelize, YearEndClosure, PayrollRun } = require('../models');
const { yearBounds, yearLabelFor } = require('./dateUtils');
const { getSettings } = require('./payrollSettings');

class YearEndError extends Error {
  constructor(message, status) { super(message); this.status = status || 400; }
}

/** Every (year, month) calendar pair inside [startDate, endDate], as PayrollRun stores them. */
function monthsInBounds(startDate, endDate) {
  const [sy, sm] = startDate.split('-').map(Number);
  const [ey, em] = endDate.split('-').map(Number);
  const out = [];
  let y = sy; let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

async function getOrCreateYear(organizationId, year) {
  const settings = await getSettings(organizationId);
  const [row] = await YearEndClosure.findOrCreate({
    where: { organizationId, year },
    defaults: { organizationId, year, yearType: settings.yearType, ...yearBounds(settings.yearType, year) },
  });
  return row;
}

/** Aggregates payroll totals for every (year,month) inside this YearEndClosure's bounds. */
async function summary(organizationId, year) {
  const row = await getOrCreateYear(organizationId, year);
  const pairs = monthsInBounds(row.startDate, row.endDate);
  const runs = await PayrollRun.findAll({
    where: {
      organizationId,
      [Op.or]: pairs.map((p) => ({ year: p.year, month: p.month })),
      status: { [Op.in]: ['APPROVED', 'PAID'] },
    },
    order: [['year', 'ASC'], ['month', 'ASC']],
  });
  const totals = runs.reduce((acc, r) => ({
    grossEarnings: acc.grossEarnings + Number(r.totalGrossEarnings),
    deductions: acc.deductions + Number(r.totalDeductions),
    netPay: acc.netPay + Number(r.totalNetPay),
  }), { grossEarnings: 0, deductions: 0, netPay: 0 });
  return {
    closure: row,
    monthsInYear: pairs.length,
    payrollRunsIncluded: runs.length,
    payrollRunsExpected: pairs.length,
    totals,
    runs: runs.map((r) => ({ id: r.id, year: r.year, month: r.month, status: r.status, totalGrossEarnings: r.totalGrossEarnings, totalDeductions: r.totalDeductions, totalNetPay: r.totalNetPay })),
  };
}

async function closeYear(organizationId, year, userId, remarks) {
  const row = await getOrCreateYear(organizationId, year);
  if (row.status === 'CLOSED') throw new YearEndError('This year is already closed.', 409);
  const s = await summary(organizationId, year);
  return sequelize.transaction(async (t) => {
    await row.update({
      status: 'CLOSED', closedAt: new Date(), closedBy: userId || null,
      summaryJson: JSON.stringify(s.totals), remarks: remarks ? String(remarks).slice(0, 500) : row.remarks,
    }, { transaction: t });
    return row;
  });
}

async function reopenYear(organizationId, year) {
  const row = await getOrCreateYear(organizationId, year);
  if (row.status === 'OPEN') throw new YearEndError('This year is already open.', 409);
  await row.update({ status: 'OPEN', closedAt: null, closedBy: null });
  return row;
}

/** Refuses (throws 409) if the year containing this calendar month/year is CLOSED for this org. Used to gate a new payroll run. */
async function assertMonthOpen(organizationId, calendarYear, calendarMonth) {
  const settings = await getSettings(organizationId);
  const yearLabel = yearLabelFor(settings.yearType, calendarYear, calendarMonth);
  const row = await YearEndClosure.findOne({ where: { organizationId, year: yearLabel } });
  if (row && row.status === 'CLOSED') {
    throw new YearEndError(`Year-end processing has closed this year (${row.startDate} to ${row.endDate}) — no payroll run can be processed for it. Reopen the year first if this was a mistake.`, 409);
  }
}

async function listYears(organizationId) {
  return YearEndClosure.findAll({ where: { organizationId }, order: [['year', 'DESC']] });
}

module.exports = { YearEndError, getOrCreateYear, summary, closeYear, reopenYear, assertMonthOpen, listYears, monthsInBounds };
