'use strict';

/**
 * Increment Date Calculation Engine
 * ----------------------------------
 * Resolves an employee's current / previous / next increment date purely
 * from the CONFIGURED increment_policy row (+ service events), never from a
 * hard-coded date or rule in application code.
 *
 * Supported increment_policy.date_basis values:
 *   FIXED_COMMON_DATE           -> policy.fixedCommonDate, 'MM-DD', same for every covered employee
 *   DOJ_ANNIVERSARY             -> anniversary of employee.doj
 *   DOA_ANNIVERSARY             -> anniversary of employee.doa (falls back to doj if doa is null)
 *   EMPLOYEE_SPECIFIC           -> employee.employeeSpecificIncrementDate (explicit per-employee override)
 *   RULE_GRADE_CATEGORY_SPECIFIC-> resolved like FIXED_COMMON_DATE when policy.fixedCommonDate is set for
 *                                  that grade/category combination, else falls back to DOJ_ANNIVERSARY.
 *                                  (Which policy row applies to a given employee's grade/category is a
 *                                  policy-SELECTION concern, handled by policyResolver.js, not by this engine.)
 *
 * Service events (LWA / SUSPENSION / BREAK_IN_SERVICE / EXTRAORDINARY_LEAVE) with
 * affectsIncrementDate = true push the next increment date forward by the number of
 * affected days that fall inside the current increment cycle. This is a configurable,
 * additive model — a bank whose service rules compute the shift differently can supply
 * a CUSTOM resolver without touching the rest of the framework.
 */

const { toDate, fmt, addMonths, addDays, diffInDays, nextOccurrenceOfMMDD, nextAnniversary } = require('./dateUtils');

function resolveBaseAnniversaryDate(employee, policy, onOrAfter) {
  switch (policy.dateBasis) {
    case 'FIXED_COMMON_DATE':
      if (!policy.fixedCommonDate) {
        throw new Error(`increment_policy ${policy.id} has date_basis=FIXED_COMMON_DATE but no fixedCommonDate set`);
      }
      return nextOccurrenceOfMMDD(policy.fixedCommonDate, onOrAfter);

    case 'DOJ_ANNIVERSARY':
      return nextAnniversary(employee.doj, onOrAfter);

    case 'DOA_ANNIVERSARY':
      return nextAnniversary(employee.doa || employee.doj, onOrAfter);

    case 'EMPLOYEE_SPECIFIC':
      if (!employee.employeeSpecificIncrementDate) {
        throw new Error(`Employee ${employee.id} has increment_policy date_basis=EMPLOYEE_SPECIFIC but no employeeSpecificIncrementDate set`);
      }
      return nextAnniversary(employee.employeeSpecificIncrementDate, onOrAfter);

    case 'RULE_GRADE_CATEGORY_SPECIFIC':
      if (policy.fixedCommonDate) {
        return nextOccurrenceOfMMDD(policy.fixedCommonDate, onOrAfter);
      }
      return nextAnniversary(employee.doj, onOrAfter);

    default:
      throw new Error(`Unknown increment_policy.date_basis: ${policy.dateBasis}`);
  }
}

/**
 * Sums the days from service events (affectsIncrementDate = true) that overlap
 * the [periodStart, periodEnd) window, and reports whether asOfDate currently
 * falls inside a still-open, increment-affecting event.
 */
function summarizeServiceEvents(serviceEvents, periodStart, periodEnd, asOfDate) {
  let affectedDays = 0;
  let currentlyAffected = false;
  const trace = [];

  for (const evt of serviceEvents || []) {
    if (!evt.affectsIncrementDate) continue;
    const evtStart = toDate(evt.startDate);
    const evtEnd = evt.endDate ? toDate(evt.endDate) : toDate(asOfDate);

    const overlapStart = evtStart > toDate(periodStart) ? evtStart : toDate(periodStart);
    const overlapEnd = evtEnd < toDate(periodEnd) ? evtEnd : toDate(periodEnd);
    const overlapDays = Math.max(0, diffInDays(overlapStart, overlapEnd));

    if (overlapDays > 0) {
      affectedDays += overlapDays;
      trace.push(`${evt.eventType} from ${fmt(evtStart)} to ${evt.endDate ? fmt(evtEnd) : 'ongoing'} overlaps cycle by ${overlapDays} day(s)`);
    }

    const isOpenEnded = !evt.endDate;
    const coversAsOf = evtStart <= toDate(asOfDate) && (isOpenEnded || evtEnd >= toDate(asOfDate));
    if (coversAsOf) currentlyAffected = true;
  }

  return { affectedDays, currentlyAffected, trace };
}

/**
 * @param {object} params
 * @param {object} params.employee        - Employee model instance (or plain object) with doj/doa/employeeSpecificIncrementDate
 * @param {object} params.policy          - IncrementPolicy model instance (or plain object)
 * @param {Array}  params.serviceEvents   - EmployeeServiceEvent rows for this employee
 * @param {Date|string} [params.asOfDate] - defaults to now
 * @returns {{currentIncrementDate: string, previousIncrementDate: string|null, nextIncrementDate: string, eligibilityStatus: string, effectiveDate: string, trace: string[]}}
 */
function calculateIncrementStatus({ employee, policy, serviceEvents = [], asOfDate = new Date() }) {
  const trace = [];
  const cycleMonths = policy.incrementFrequencyMonths || 12;
  const asOf = toDate(asOfDate);

  trace.push(`Resolving increment date using policy "${policy.policyName}" (date_basis=${policy.dateBasis}, cycle=${cycleMonths}mo)`);

  // Walk forward from the anchor (doj, doa, or employee-specific date) in whole
  // cycles until we find the increment date that is next-due on/after asOfDate.
  // The date immediately before that is "current"; the one before that, "previous".
  let anchor;
  if (policy.dateBasis === 'DOJ_ANNIVERSARY') anchor = employee.doj;
  else if (policy.dateBasis === 'DOA_ANNIVERSARY') anchor = employee.doa || employee.doj;
  else if (policy.dateBasis === 'EMPLOYEE_SPECIFIC') anchor = employee.employeeSpecificIncrementDate;
  else anchor = employee.doj; // FIXED_COMMON_DATE / RULE_GRADE_CATEGORY_SPECIFIC still need a starting point

  let next = resolveBaseAnniversaryDate(employee, policy, anchor);
  // Ensure we start strictly after the anchor/joining date
  while (next.getTime() <= toDate(anchor).getTime()) {
    next = addMonths(next, cycleMonths);
  }

  let current = null;
  let previous = null;
  let iterations = 0;
  while (next.getTime() <= asOf.getTime() && iterations < 1000) {
    previous = current;
    current = next;
    next = addMonths(current, cycleMonths);
    iterations++;
  }

  if (!current) {
    // No increment has fallen due yet — "current" is undefined; report first upcoming one.
    trace.push('No increment has fallen due yet; reporting first scheduled increment date.');
  }

  const periodStart = current || toDate(anchor);
  const { affectedDays, currentlyAffected, trace: eventTrace } = summarizeServiceEvents(
    serviceEvents,
    periodStart,
    next,
    asOf
  );
  trace.push(...eventTrace);

  if (affectedDays > 0) {
    const pushedNext = addDays(next, affectedDays);
    trace.push(`Next increment date pushed forward by ${affectedDays} day(s) due to service events: ${fmt(next)} -> ${fmt(pushedNext)}`);
    next = pushedNext;
  }

  const eligibilityStatus = currentlyAffected ? 'DEFERRED' : 'ELIGIBLE';
  if (currentlyAffected) {
    trace.push('Employee is currently within an increment-affecting service event window -> eligibility DEFERRED.');
  }

  return {
    currentIncrementDate: current ? fmt(current) : null,
    previousIncrementDate: previous ? fmt(previous) : null,
    nextIncrementDate: fmt(next),
    eligibilityStatus,
    effectiveDate: fmt(asOf),
    incrementPolicyId: policy.id,
    ruleReferenceId: policy.ruleReferenceId || null,
    trace,
  };
}

module.exports = { calculateIncrementStatus, resolveBaseAnniversaryDate, summarizeServiceEvents };
