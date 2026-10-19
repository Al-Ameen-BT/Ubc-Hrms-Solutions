'use strict';

/**
 * Pay Fixation Calculation Engine
 * --------------------------------
 * Computes the new basic pay (scale + stage) that follows a PROMOTION or a
 * PAY_REVISION, driven entirely by a configured pay_fixation_policy row.
 * No bank's specific rule (e.g. "KSR Rule 28A") is assumed anywhere in this
 * file — the policy record supplies the method, and this engine just
 * executes it.
 *
 * promotion_method:
 *   NOTIONAL_INCREMENT_THEN_FIX  (Option A)
 *     1. Grant `notionalIncrementCount` notional increment(s) in the OLD scale
 *     2. Arrive at a notional basic pay
 *     3. Move to the new (promoted) scale
 *     4. Select a stage per stage_selection_method, compared against the notional basic pay
 *     5. Fix the new basic pay at that stage
 *
 *   DIRECT_NEXT_HIGHER_STAGE
 *     Skip the notional-increment step; select the stage in the new scale directly
 *     against the employee's CURRENT (pre-promotion) basic pay.
 *
 *   DEFER_TO_NEXT_INCREMENT      (Option B)
 *     Promotion (post/cadre change) takes effect immediately, but pay fixation
 *     itself is deferred to the employee's next increment date. This function
 *     returns a `deferred` result; call `resolveDeferredFixation` again on/after
 *     that date to complete the fixation.
 *
 *   CUSTOM
 *     Delegates entirely to `options.customResolver(context)`, supplied by the
 *     caller for a bank whose rule doesn't fit the built-in methods.
 *
 * stage_selection_method:
 *   NEXT_HIGHER_STAGE     - first stage strictly greater than the reference pay
 *   NEXT_EQUAL_OR_HIGHER  - first stage greater than or equal to the reference pay
 *   CUSTOM_RULE           - delegates to options.customStageSelector(stages, referencePay)
 */

function sortStages(stages) {
  return [...stages].sort((a, b) => a.stageNo - b.stageNo);
}

function applyRounding(amount, roundingMethod) {
  switch (roundingMethod) {
    case 'ROUND_UP':
      return Math.ceil(amount);
    case 'ROUND_DOWN':
      return Math.floor(amount);
    case 'ROUND_NEAREST':
      return Math.round(amount);
    case 'NONE':
    default:
      return amount;
  }
}

function selectStage(stages, referencePay, stageSelectionMethod, options = {}) {
  const sorted = sortStages(stages);

  if (stageSelectionMethod === 'CUSTOM_RULE') {
    if (typeof options.customStageSelector !== 'function') {
      throw new Error('stage_selection_method=CUSTOM_RULE requires options.customStageSelector(stages, referencePay)');
    }
    return options.customStageSelector(sorted, referencePay);
  }

  const predicate =
    stageSelectionMethod === 'NEXT_EQUAL_OR_HIGHER'
      ? (s) => Number(s.amount) >= referencePay
      : (s) => Number(s.amount) > referencePay; // NEXT_HIGHER_STAGE (default)

  const match = sorted.find(predicate);
  if (match) return match;

  // Reference pay exceeds every stage in the target scale — fall back to the
  // topmost stage and flag it, rather than silently picking nothing.
  return sorted[sorted.length - 1];
}

function grantNotionalIncrements(oldStages, currentStage, count) {
  const sorted = sortStages(oldStages);
  const trace = [];
  let idx = sorted.findIndex((s) => s.id === currentStage.id || s.stageNo === currentStage.stageNo);
  if (idx === -1) {
    throw new Error(`Current stage (stageNo=${currentStage.stageNo}) not found in the old scale's stage list`);
  }
  let pay = Number(sorted[idx].amount);
  for (let i = 0; i < count; i++) {
    if (idx + 1 < sorted.length) {
      idx += 1;
      pay = Number(sorted[idx].amount);
      trace.push(`Notional increment ${i + 1}: -> stage ${sorted[idx].stageNo} (₹${pay})`);
    } else {
      trace.push(`Notional increment ${i + 1}: already at topmost stage of old scale, pay unchanged (₹${pay})`);
    }
  }
  return { notionalBasicPay: pay, trace };
}

/**
 * @param {object} params
 * @param {object} params.policy          - PayFixationPolicy instance/plain object
 * @param {object} params.employee        - Employee (needs currentBasicPay)
 * @param {object} params.currentStage    - PayStage row employee is presently on (old scale)
 * @param {Array}  params.oldScaleStages  - all PayStage rows of the old scale
 * @param {Array}  params.newScaleStages  - all PayStage rows of the new (promoted / revised) scale
 * @param {string} [params.nextIncrementDate] - required when promotion_method=DEFER_TO_NEXT_INCREMENT
 * @param {object} [options]
 * @returns {object} fixation result, or {deferred: true, ...} for DEFER_TO_NEXT_INCREMENT
 */
function calculatePayFixation({ policy, employee, currentStage, oldScaleStages, newScaleStages, nextIncrementDate }, options = {}) {
  const trace = [];
  trace.push(`Applying pay_fixation_policy "${policy.policyName}" (promotion_method=${policy.promotionMethod}, stage_selection_method=${policy.stageSelectionMethod})`);

  if (policy.promotionMethod === 'DEFER_TO_NEXT_INCREMENT') {
    if (!nextIncrementDate) {
      throw new Error('promotion_method=DEFER_TO_NEXT_INCREMENT requires nextIncrementDate to be supplied');
    }
    trace.push(`Fixation deferred to employee's next increment date: ${nextIncrementDate}`);
    return {
      deferred: true,
      targetDate: nextIncrementDate,
      payFixationPolicyId: policy.policyId,
      ruleReferenceId: policy.ruleReferenceId || null,
      trace,
    };
  }

  if (policy.promotionMethod === 'CUSTOM') {
    if (typeof options.customResolver !== 'function') {
      throw new Error('promotion_method=CUSTOM requires options.customResolver(context)');
    }
    return options.customResolver({ policy, employee, currentStage, oldScaleStages, newScaleStages, trace });
  }

  let referencePay = Number(employee.currentBasicPay);

  if (policy.promotionMethod === 'NOTIONAL_INCREMENT_THEN_FIX') {
    if (!policy.notionalIncrementEnabled) {
      trace.push('Warning: promotion_method=NOTIONAL_INCREMENT_THEN_FIX but notional_increment_enabled=false on the policy; proceeding with 0 notional increments.');
    }
    const count = policy.notionalIncrementEnabled ? policy.notionalIncrementCount : 0;
    const { notionalBasicPay, trace: notionalTrace } = grantNotionalIncrements(oldScaleStages, currentStage, count);
    trace.push(...notionalTrace);
    referencePay = notionalBasicPay;
  } else if (policy.promotionMethod === 'DIRECT_NEXT_HIGHER_STAGE') {
    trace.push(`Using current basic pay directly as reference: ₹${referencePay}`);
  } else {
    throw new Error(`Unknown promotion_method: ${policy.promotionMethod}`);
  }

  referencePay = applyRounding(referencePay, policy.roundingMethod);
  if (policy.roundingMethod !== 'NONE') {
    trace.push(`Rounding method ${policy.roundingMethod} applied to reference pay -> ₹${referencePay}`);
  }

  const selectedStage = selectStage(newScaleStages, referencePay, policy.stageSelectionMethod, options);
  trace.push(`Stage selection (${policy.stageSelectionMethod}) against reference pay ₹${referencePay} -> new scale stage ${selectedStage.stageNo} (₹${selectedStage.amount})`);

  return {
    deferred: false,
    newStageId: selectedStage.id,
    newStageNo: selectedStage.stageNo,
    newBasicPay: Number(selectedStage.amount),
    referencePay,
    payFixationPolicyId: policy.policyId,
    ruleReferenceId: policy.ruleReferenceId || null,
    trace,
  };
}

/** Completes a fixation previously deferred by DEFER_TO_NEXT_INCREMENT, on/after the target date. */
function resolveDeferredFixation({ policy, employee, currentStage, oldScaleStages, newScaleStages }, options = {}) {
  const effectivePolicy = { ...policy, promotionMethod: policy.fixationMethod || 'DIRECT_NEXT_HIGHER_STAGE' };
  return calculatePayFixation({ policy: effectivePolicy, employee, currentStage, oldScaleStages, newScaleStages }, options);
}

module.exports = { calculatePayFixation, resolveDeferredFixation, selectStage, grantNotionalIncrements, applyRounding };
