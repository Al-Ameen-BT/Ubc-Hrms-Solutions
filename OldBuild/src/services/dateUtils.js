'use strict';

/** Small dependency-free date helpers (avoid pulling in a date library for the first slice). */

function toDate(d) {
  return d instanceof Date ? d : new Date(`${d}T00:00:00Z`);
}

function fmt(d) {
  return toDate(d).toISOString().slice(0, 10); // YYYY-MM-DD
}

function addMonths(date, months) {
  const d = toDate(date);
  const result = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
  return result;
}

function addDays(date, days) {
  const d = toDate(date);
  const result = new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
  return result;
}

function diffInDays(a, b) {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / (24 * 60 * 60 * 1000));
}

/** Returns the next occurrence of an 'MM-DD' calendar date on or after `onOrAfter`. */
function nextOccurrenceOfMMDD(mmdd, onOrAfter) {
  const [mm, dd] = mmdd.split('-').map(Number);
  const ref = toDate(onOrAfter);
  let year = ref.getUTCFullYear();
  let candidate = new Date(Date.UTC(year, mm - 1, dd));
  if (candidate.getTime() < ref.getTime()) {
    candidate = new Date(Date.UTC(year + 1, mm - 1, dd));
  }
  return candidate;
}

/** Anniversary of `anchorDate` occurring in the same year as (or the year after) `onOrAfter`, whichever is the first anniversary on/after `onOrAfter`. */
function nextAnniversary(anchorDate, onOrAfter) {
  const anchor = toDate(anchorDate);
  const ref = toDate(onOrAfter);
  let year = ref.getUTCFullYear();
  let candidate = new Date(Date.UTC(year, anchor.getUTCMonth(), anchor.getUTCDate()));
  if (candidate.getTime() < ref.getTime()) {
    candidate = new Date(Date.UTC(year + 1, anchor.getUTCMonth(), anchor.getUTCDate()));
  }
  return candidate;
}

/**
 * The [startDate, endDate] boundaries (both YYYY-MM-DD strings) of the
 * organisation's "year", for year-end processing (services/yearEnd.js).
 * CALENDAR: `year` itself, 1 Jan - 31 Dec.
 * FINANCIAL: the Indian financial year STARTING in `year` — 1 Apr `year` -
 * 31 Mar `year+1`. So FY2025-26 is referenced as year=2025.
 */
function yearBounds(yearType, year) {
  const y = Number(year);
  if (yearType === 'FINANCIAL') {
    return { startDate: `${y}-04-01`, endDate: `${y + 1}-03-31` };
  }
  return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
}

/** Which year label (per yearBounds above) a given calendar year/month falls in, for the org's yearType. */
function yearLabelFor(yearType, calendarYear, calendarMonth) {
  if (yearType === 'FINANCIAL') {
    return calendarMonth >= 4 ? calendarYear : calendarYear - 1;
  }
  return calendarYear;
}

module.exports = {
  toDate, fmt, addMonths, addDays, diffInDays, nextOccurrenceOfMMDD, nextAnniversary,
  yearBounds, yearLabelFor,
};
