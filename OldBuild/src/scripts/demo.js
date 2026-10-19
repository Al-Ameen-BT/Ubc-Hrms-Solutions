'use strict';

/**
 * End-to-end demo of the framework's first slice:
 *   Organization -> Post/Cadre -> Pay Revision -> Pay Scale -> Pay Stage
 *   -> Increment Policy -> Pay Fixation Policy -> Employee
 *   -> Calculation Engines -> Transaction (Service Book)
 *
 * Run with: npm run demo
 * (Uses SQLite by default so it runs with zero external setup; point
 *  DB_DIALECT=mysql at a real MySQL instance for production.)
 */

const { sequelize, PayStage, EmployeeIncrementStatus, EmployeePayHistory } = require('../models');
const { seedDemoData } = require('../seed');
const { calculateIncrementStatus } = require('../services/incrementEngine');
const { calculatePayFixation } = require('../services/payFixationEngine');

function printTrace(title, trace) {
  console.log(`\n--- ${title} ---`);
  trace.forEach((line) => console.log('  · ' + line));
}

async function main() {
  await sequelize.sync({ force: true });
  console.log('Schema synced (fresh demo database).');

  const data = await seedDemoData();
  console.log(`\nSeeded organization "${data.org.name}" with employee ${data.employee.empCode} (${data.employee.name}).`);
  console.log('*** All data below is clearly-marked SAMPLE data — see src/seed/index.js header. ***');

  // ------------------------------------------------------------------
  // 1) INCREMENT DATE ENGINE
  // ------------------------------------------------------------------
  const serviceEvents = await data.employee.getEmployeeServiceEvents
    ? await data.employee.getEmployeeServiceEvents()
    : [];

  const incrementResult = calculateIncrementStatus({
    employee: data.employee,
    policy: data.incrementPolicy,
    serviceEvents,
    asOfDate: '2025-06-01',
  });

  printTrace('Increment Date Engine (as of 2025-06-01)', incrementResult.trace);
  console.log('  Result:', {
    currentIncrementDate: incrementResult.currentIncrementDate,
    previousIncrementDate: incrementResult.previousIncrementDate,
    nextIncrementDate: incrementResult.nextIncrementDate,
    eligibilityStatus: incrementResult.eligibilityStatus,
  });

  await EmployeeIncrementStatus.create({
    employeeId: data.employee.id,
    currentIncrementDate: incrementResult.currentIncrementDate,
    previousIncrementDate: incrementResult.previousIncrementDate,
    nextIncrementDate: incrementResult.nextIncrementDate,
    eligibilityStatus: incrementResult.eligibilityStatus,
    incrementPolicyId: incrementResult.incrementPolicyId,
    effectiveDate: incrementResult.effectiveDate,
    ruleReferenceId: incrementResult.ruleReferenceId,
    calculationTrace: incrementResult.trace,
  });
  console.log('  Saved to employee_increment_status.');

  // ------------------------------------------------------------------
  // 2) PAY FIXATION ENGINE — Option A: NOTIONAL_INCREMENT_THEN_FIX
  //    Scenario: employee promoted from Clerk -> Senior Clerk on 2025-07-01
  // ------------------------------------------------------------------
  const currentStage = await PayStage.findByPk(data.employee.currentStageId);

  const fixationResultA = calculatePayFixation({
    policy: data.fixationPolicyOptionA,
    employee: data.employee,
    currentStage,
    oldScaleStages: data.clerkStages,
    newScaleStages: data.seniorStages,
  });

  printTrace('Pay Fixation Engine — Option A (NOTIONAL_INCREMENT_THEN_FIX)', fixationResultA.trace);
  console.log('  Result:', {
    newStageNo: fixationResultA.newStageNo,
    newBasicPay: fixationResultA.newBasicPay,
    referencePay: fixationResultA.referencePay,
  });

  await EmployeePayHistory.create({
    employeeId: data.employee.id,
    eventType: 'PROMOTION',
    eventDate: '2025-07-01',
    previousPayScaleId: data.clerkScale.id,
    previousStageId: currentStage.id,
    previousBasicPay: data.employee.currentBasicPay,
    newPayScaleId: data.seniorClerkScale.id,
    newStageId: fixationResultA.newStageId,
    newBasicPay: fixationResultA.newBasicPay,
    postCadreId: data.seniorClerkPost.id,
    payFixationPolicyId: fixationResultA.payFixationPolicyId,
    ruleReferenceId: fixationResultA.ruleReferenceId,
    orderRef: '[SAMPLE] ORDER-DEMO-001',
    remarks: 'Demo promotion, Option A policy',
    calculationTrace: fixationResultA.trace,
    createdBy: 'demo-script',
  });
  console.log('  Saved to employee_pay_history (Service Book entry).');

  // ------------------------------------------------------------------
  // 3) PAY FIXATION ENGINE — Option B: DEFER_TO_NEXT_INCREMENT
  //    Same promotion scenario, but under the alternate configured policy —
  //    shown side by side to prove the same engine + same employee data
  //    produce a different outcome purely because the POLICY differs.
  // ------------------------------------------------------------------
  const fixationResultB = calculatePayFixation({
    policy: data.fixationPolicyOptionB,
    employee: data.employee,
    currentStage,
    oldScaleStages: data.clerkStages,
    newScaleStages: data.seniorStages,
    nextIncrementDate: incrementResult.nextIncrementDate,
  });

  printTrace('Pay Fixation Engine — Option B (DEFER_TO_NEXT_INCREMENT)', fixationResultB.trace);
  console.log('  Result:', { deferred: fixationResultB.deferred, targetDate: fixationResultB.targetDate });

  console.log('\nDemo complete. Same employee + same promotion event, two different');
  console.log('configured pay_fixation_policy rows produced two different, policy-driven');
  console.log('outcomes — proving fixation logic is not hard-coded to one bank\'s rule.');

  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
