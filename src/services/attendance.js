'use strict';

/**
 * Monthly attendance / Loss-of-Pay (LOP) days — see models/employeeAttendance.js
 * for what's actually stored. The payslip (services/payslip.js) only needs
 * the LOP-day count for the month it's computing; this module is the one
 * place that resolves "which calendar year" a payslip's `forMonth` (1-12)
 * means, matching services/loans.js's asOfForMonth (current calendar year).
 */
const { EmployeeAttendance } = require('../models');

function yearForMonth() {
  return new Date().getUTCFullYear();
}

/** The attendance record for one employee/month (current year), or null if none was ever marked (= full pay, no LOP). */
async function getForMonth(employeeId, month) {
  return EmployeeAttendance.findOne({ where: { employeeId, year: yearForMonth(), month: month || (new Date().getUTCMonth() + 1) } });
}

/** All records for one employee in a given year, keyed by month (1-12). */
async function listForYear(employeeId, year) {
  const rows = await EmployeeAttendance.findAll({ where: { employeeId, year }, order: [['month', 'ASC']] });
  const byMonth = {};
  rows.forEach((r) => { byMonth[r.month] = r; });
  return byMonth;
}

/** Create-or-update the one row for employee/year/month. */
async function upsert(employeeId, year, month, { lopDays, remarks }, markedBy) {
  const [row] = await EmployeeAttendance.findOrCreate({
    where: { employeeId, year, month },
    defaults: { employeeId, year, month, lopDays: 0 },
  });
  row.lopDays = lopDays != null ? Number(lopDays) : 0;
  row.remarks = remarks ? String(remarks).slice(0, 500) : null;
  row.markedBy = markedBy || null;
  await row.save();
  return row;
}

module.exports = { getForMonth, listForYear, upsert, yearForMonth };
