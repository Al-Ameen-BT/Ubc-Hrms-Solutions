'use strict';

/**
 * DEMO / SAMPLE DATA — NOT VERIFIED AGAINST ANY BANK'S ACTUAL SERVICE RULES.
 * ===========================================================================
 * Every value below (pay scale amounts, GO numbers, policy choices) is
 * placeholder data invented to exercise the framework end-to-end. None of it
 * should be treated as, or copied into, a real UCB's payroll configuration
 * until the corresponding service regulations / settlements / GOs have been
 * obtained and verified. All rows are tagged with rule_reference.is_verified
 * = false and titles prefixed "[SAMPLE/UNVERIFIED]" for this reason.
 */

const {
  Organization,
  GovernmentOrder,
  RuleReference,
  PostCadre,
  PayRevision,
  PayScale,
  PayStage,
  IncrementPolicy,
  PayFixationPolicy,
  Employee,
  EmployeeServiceEvent,
  EmployeePayHistory,
  EmployeeServiceHistory,
} = require('../models');

async function seedDemoData() {
  const org = await Organization.create({
    code: 'DEMO-UCB',
    name: '[SAMPLE/UNVERIFIED] Demo Urban Co-operative Bank Ltd.',
    shortName: 'Demo UCB',
  });

  // Sample GO — a placeholder register entry, not a real Government Order.
  const sampleGO = await GovernmentOrder.create({
    organizationId: org.id,
    goNumber: '[SAMPLE] GO-DEMO-2023-001',
    goDate: '2023-01-01',
    issuingAuthority: 'TBD — placeholder, not a real issuing authority',
    subject: '[SAMPLE/UNVERIFIED] Placeholder GO used only to exercise the government_orders register',
    status: 'DRAFT',
  });

  const incrementRule = await RuleReference.create({
    organizationId: org.id,
    ruleType: 'INCREMENT',
    title: '[SAMPLE/UNVERIFIED] Placeholder increment rule — replace with actual bank circular/GO',
    part: 'Part I',
    chapter: null,
    ruleNumber: '31', // shape only, per your brief's own example — not asserted as a real KSR rule
    calculationMethod: 'INCREMENT_ENGINE:STAGE_ADVANCE',
    governmentOrderId: sampleGO.id,
    issuingAuthority: 'TBD',
    description: 'Demo data only. Not sourced from any verified UCB service regulation.',
    isVerified: false,
    status: 'DRAFT',
  });

  const fixationRule = await RuleReference.create({
    organizationId: org.id,
    ruleType: 'PROMOTION',
    title: '[SAMPLE/UNVERIFIED] Placeholder promotion pay-fixation rule — replace with actual bank circular/GO',
    governmentOrderId: sampleGO.id,
    calculationMethod: 'PAY_FIXATION_ENGINE:NOTIONAL_INCREMENT_THEN_FIX',
    issuingAuthority: 'TBD',
    description: 'Demo data only. Does NOT represent KSR Rule 28A or any specific bank\'s adopted rule.',
    isVerified: false,
    status: 'DRAFT',
  });

  const revisionRule = await RuleReference.create({
    organizationId: org.id,
    ruleType: 'SETTLEMENT',
    title: '[SAMPLE/UNVERIFIED] Placeholder wage settlement',
    isVerified: false,
    status: 'DRAFT',
  });

  const payRevision = await PayRevision.create({
    organizationId: org.id,
    name: '[SAMPLE] Demo Wage Revision',
    effectiveDate: '2023-01-01',
    ruleReferenceId: revisionRule.id,
    status: 'ACTIVE',
  });

  // Two sample scales: the cadre an employee starts in, and the one they're promoted into.
  const clerkScale = await PayScale.create({
    organizationId: org.id,
    payRevisionId: payRevision.id,
    code: 'DEMO-CLERK-SCALE',
    name: '[SAMPLE] Clerk Scale',
    scaleExpression: '20200-800-24400-900-30100 (SAMPLE VALUES)',
    effectiveFrom: '2023-01-01',
  });

  const seniorClerkScale = await PayScale.create({
    organizationId: org.id,
    payRevisionId: payRevision.id,
    code: 'DEMO-SR-CLERK-SCALE',
    name: '[SAMPLE] Senior Clerk / Head Cashier Scale',
    scaleExpression: '24400-900-30100-1000-36100 (SAMPLE VALUES)',
    effectiveFrom: '2023-01-01',
  });

  const clerkStageAmounts = [20200, 21000, 21800, 22600, 23400, 24200, 25000, 25900, 26800];
  const clerkStages = await PayStage.bulkCreate(
    clerkStageAmounts.map((amount, i) => ({ payScaleId: clerkScale.id, stageNo: i + 1, amount })),
    { returning: true }
  );

  const seniorStageAmounts = [24400, 25300, 26200, 27100, 28000, 28900, 29800, 30800, 31800];
  const seniorStages = await PayStage.bulkCreate(
    seniorStageAmounts.map((amount, i) => ({ payScaleId: seniorClerkScale.id, stageNo: i + 1, amount })),
    { returning: true }
  );

  const clerkPost = await PostCadre.create({
    organizationId: org.id,
    code: 'CLERK',
    name: '[SAMPLE] Clerk',
    cadre: 'Clerical',
    cadreLevel: 1,
    defaultPayScaleId: clerkScale.id,
  });

  const seniorClerkPost = await PostCadre.create({
    organizationId: org.id,
    code: 'SR-CLERK',
    name: '[SAMPLE] Senior Clerk / Head Cashier',
    cadre: 'Clerical',
    cadreLevel: 2,
    parentPostId: clerkPost.id,
    defaultPayScaleId: seniorClerkScale.id,
  });

  // Increment policy: DOJ-anniversary based, annual cycle.
  const incrementPolicy = await IncrementPolicy.create({
    organizationId: org.id,
    policyName: '[SAMPLE] Annual Increment on DOJ Anniversary',
    dateBasis: 'DOJ_ANNIVERSARY',
    incrementFrequencyMonths: 12,
    effectiveFrom: '2023-01-01',
    ruleReferenceId: incrementRule.id,
    status: 'ACTIVE',
  });

  // A second policy to demonstrate the FIXED_COMMON_DATE basis (e.g. common 1-July date),
  // not applied to the demo employee by default, but seeded so it's visible in the data.
  await IncrementPolicy.create({
    organizationId: org.id,
    policyName: '[SAMPLE] Common Date Increment (1 July)',
    dateBasis: 'FIXED_COMMON_DATE',
    fixedCommonDate: '07-01',
    incrementFrequencyMonths: 12,
    effectiveFrom: '2023-01-01',
    ruleReferenceId: incrementRule.id,
    status: 'ACTIVE',
  });

  // Pay fixation policy: Option A (notional increment then fix), next-higher-stage selection.
  const fixationPolicyOptionA = await PayFixationPolicy.create({
    organizationId: org.id,
    policyName: '[SAMPLE] Promotion Fixation — Notional Increment Then Fix',
    effectiveFrom: '2023-01-01',
    promotionMethod: 'NOTIONAL_INCREMENT_THEN_FIX',
    notionalIncrementEnabled: true,
    notionalIncrementCount: 1,
    stageSelectionMethod: 'NEXT_HIGHER_STAGE',
    roundingMethod: 'NONE',
    ruleReferenceId: fixationRule.id,
    goReference: '[SAMPLE] GO-DEMO-001',
    status: 'ACTIVE',
  });

  // A second policy to demonstrate Option B (defer to next increment date),
  // seeded so both configured behaviours exist as data, not code.
  const fixationPolicyOptionB = await PayFixationPolicy.create({
    organizationId: org.id,
    policyName: '[SAMPLE] Promotion Fixation — Defer To Next Increment',
    effectiveFrom: '2023-01-01',
    promotionMethod: 'DEFER_TO_NEXT_INCREMENT',
    notionalIncrementEnabled: false,
    fixationMethod: 'DIRECT_NEXT_HIGHER_STAGE', // method used once the deferred date arrives
    nextIncrementOptionEnabled: true,
    optionDeadlineDays: 30,
    stageSelectionMethod: 'NEXT_HIGHER_STAGE',
    roundingMethod: 'NONE',
    ruleReferenceId: fixationRule.id,
    goReference: '[SAMPLE] GO-DEMO-002',
    status: 'ACTIVE',
  });

  // Demo employee: joined 4+ years ago, currently on Clerk scale, stage 4 (₹22,600).
  const employee = await Employee.create({
    organizationId: org.id,
    empCode: 'DEMO-0001',
    name: '[SAMPLE] A. Employee',
    doj: '2020-03-15',
    postCadreId: clerkPost.id,
    grade: 'Clerical',
    category: 'General',
    currentPayScaleId: clerkScale.id,
    currentStageId: clerkStages[3].id, // stage 4
    currentBasicPay: clerkStages[3].amount,
    incrementPolicyId: incrementPolicy.id,
    payFixationPolicyId: fixationPolicyOptionA.id,
    employmentStatus: 'ACTIVE',
  });

  // A sample service event: 40 days of extraordinary leave, falling inside the
  // employee's 2025-03-15 -> 2026-03-15 increment cycle, so the demo run
  // (as-of 2025-06-01) shows it pushing the NEXT increment date forward.
  await EmployeeServiceEvent.create({
    employeeId: employee.id,
    eventType: 'EXTRAORDINARY_LEAVE',
    startDate: '2025-04-01',
    endDate: '2025-05-11',
    affectsIncrementDate: true,
    daysCount: 40,
    remarks: '[SAMPLE] Extraordinary leave demonstrating increment-date push',
  });

  // Initial pay-history entry matching the employee's starting position, so
  // the Service Book timeline has something to link its APPOINTMENT event to
  // (employee.currentBasicPay alone is not a substitute for the ledger).
  const initialFixation = await EmployeePayHistory.create({
    employeeId: employee.id,
    eventType: 'INITIAL_FIXATION',
    eventDate: employee.doj,
    newPayScaleId: clerkScale.id,
    newStageId: clerkStages[3].id,
    newBasicPay: clerkStages[3].amount,
    postCadreId: clerkPost.id,
    orderRef: '[SAMPLE] APPT-ORDER-DEMO-0001',
    remarks: '[SAMPLE] Initial appointment fixation',
    createdBy: 'seed',
  });

  // Service Book timeline — the chronological spine the digital Service Book
  // screen renders (architecture doc §6). Appointment links back to the
  // pay-history row above; the increment/promotion events created by the
  // demo script (npm run demo) can add further rows to this same timeline.
  await EmployeeServiceHistory.bulkCreate([
    {
      employeeId: employee.id,
      eventType: 'APPOINTMENT',
      eventDate: employee.doj,
      orderRef: '[SAMPLE] APPT-ORDER-DEMO-0001',
      payHistoryId: initialFixation.id,
      remarks: '[SAMPLE] Joined as Clerk',
    },
    {
      employeeId: employee.id,
      eventType: 'CONFIRMATION',
      eventDate: '2021-03-15',
      orderRef: '[SAMPLE] CONF-ORDER-DEMO-0001',
      remarks: '[SAMPLE] Confirmed after probation',
    },
    {
      employeeId: employee.id,
      eventType: 'LWA',
      eventDate: '2025-04-01',
      remarks: '[SAMPLE] Extraordinary leave — see employee_service_event for the increment-date impact',
    },
  ]);

  return {
    sampleGO,
    org,
    clerkScale,
    seniorClerkScale,
    clerkStages,
    seniorStages,
    clerkPost,
    seniorClerkPost,
    incrementPolicy,
    fixationPolicyOptionA,
    fixationPolicyOptionB,
    employee,
  };
}

module.exports = { seedDemoData };

// Allow `node src/seed/index.js` / `npm run seed` to run this directly
// against whatever DB the current .env / env vars point at.
if (require.main === module) {
  const { sequelize } = require('../models');
  seedDemoData()
    .then((data) => {
      console.log(`Seeded organization "${data.org.name}" (id=${data.org.id}) with employee ${data.employee.empCode}.`);
      return sequelize.close();
    })
    .catch((err) => {
      console.error('Seed failed:', err.message);
      process.exit(1);
    });
}
