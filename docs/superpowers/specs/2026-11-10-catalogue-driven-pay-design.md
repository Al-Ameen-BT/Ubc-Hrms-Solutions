# Catalogue-driven bank pay and salary stages

Status: Approved by the user and implemented locally, 11 November 2026. Live MySQL and browser flows remain unverified.

## Intent

Platform Admin must be able to enter and publish the government-prescribed values for every supported bank class: posts, scale expressions and stages, effective dates, and supported payroll rule parameters. A bank must adopt a published revision and assign its employees to its posts and stages. Payroll must calculate from that immutable revision and the employee's approved assignment. No code or seed-file edit should be needed when the government changes a supported value.

The user chose direct catalogue calculation. Published stage amounts may change only through a new Platform Admin revision. Organisations cannot edit those amounts. Direct-pay employees remain supported, but have a separate approved bank-set salary.

## Current state and gap

`BankRuleCatalogue` already stores draft and published class-specific posts, scale expressions, expanded stages, rule references, and a set of payroll defaults. Published records are immutable. It is currently informational: `payScaleLibrary.provisionForOrganization()` still copies a hard-coded reference library into a new bank, `PayScale`/`PayStage` are maintained separately, and `Employee.currentBasicPay` is the amount payroll reads. The catalogue has no adoption or employee-assignment link. Several payroll settings and employee salary fields can be changed directly by existing admin routes without a distinct financial approval.

## Approaches considered

1. **Copy a published revision into each bank's pay tables.** Fits existing payroll with fewer changes, but creates another mutable copy of government amounts. The user declined this.
2. **Calculate from the published catalogue.** Keep the government revision immutable, and store only the bank's adoption and each employee's assignment to a revision, post, and stage. The user selected this.

## Data and authority

- Keep `BankRuleCatalogue` as the sole source of government stage amounts. Platform Admin edits drafts and publishes verified successors with order number, source, effective date, and verification record.
- The six government bank-class identifiers remain fixed; their published post lists, scale expressions, stage amounts, day bases, and supported rate/limit values are editable in drafts. Stage preview shows every derived amount before publication. A scale that cannot be expressed by the current increment syntax needs explicit stage amounts in the draft, validated as a positive increasing whole-rupee ladder.
- Add an organisation adoption record for a specific published catalogue revision. Only a revision for that organisation's bank class may be proposed. Organisation Admin selects the revision and effective date; a separate Approving Authority approves it. The record keeps both actors, timestamps, and status. A later adoption never edits an earlier one.
- Add employee compensation assignments with organisation, employee, catalogue revision, post code, stage number, effective date, and preparation/approval details. Validate that post and stage exist in the *published* revision and match the organisation's adopted class. A Payroll Officer or authorised HR preparer proposes; a different Approving Authority approves. Rejecting preserves the previous assignment. Approved assignments form a dated timeline; conflicting changes at the same effective instant are rejected.
- Employees already assigned to an earlier revision keep that assignment until a separately approved move. Once a successor is adopted, new assignments select the successor only. This avoids an implicit bank-wide salary increase.
- Use the existing direct-pay employee type. Its salary change gets the same prepare/approve separation, reason, and effective date. It never has a government stage.
- Continue storing a rounded whole-rupee `currentBasicPay` as a compatibility display/cache value after approval, but it is not the calculation source for catalogue-linked employees. Its value must be derived from the approved assignment and validated against the selected stage. Percentage and fractional-day precision remain as currently defined.
- Mark existing organisational scales and employee salaries as legacy. Do not infer a catalogue link from matching names or amounts. Existing banks keep their current payroll path until an admin explicitly maps and approves each employee. This avoids altering historical pay. New banks use a published catalogue revision and are not silently seeded from unverified hard-coded amounts.
- A new bank may be created before its class has a published revision. It enters a pending payroll-setup state: users and nonfinancial employee details can be onboarded, but staged salary assignment and payroll processing require approved adoption. This avoids blocking platform onboarding while preventing unverified salary calculations.

## Runtime calculation

- Introduce one compensation resolver that accepts employee, organisation, and calculation date. For catalogue-linked employees it reads the approved assignment and immutable catalogue JSON, returns the stage amount, post/scale label, payable-day basis, and revision/order provenance. For direct-pay and unmigrated legacy employees it returns their existing approved bank-set or legacy salary path.
- Use that resolver in monthly payroll, payslip generation, arrears estimates/calculation, fixation and increment actions, service-book salary display, and salary-based advance/loan limits. Any operation that cannot resolve a valid effective assignment stops with an actionable error rather than falling back to an unrelated amount.
- If an approved change takes effect during a month, divide that month at the effective date. Calculate salary and salary-dependent percentage earnings/deductions using the applicable rate for each segment and the bank's configured day basis. Pay one-off earnings, recoveries, and fixed monthly deductions once, not once per segment. Keep segment provenance in the payslip snapshot. The user selected this over starting changes at the next full month.
- Backdated approvals do not mutate approved or paid payroll. Show the resulting difference as a separately prepared arrears adjustment requiring approval. A processed but unapproved run becomes stale and must be rerun before approval when a relevant assignment or setting changes.
- At payroll approval, keep the calculated salary, revision ID, post/stage, and rule references in the already frozen payslip/run snapshot. A successor revision never recalculates an approved or paid run.
- Apply a catalogue payroll setting only when that published revision explicitly specifies it; otherwise use the bank's existing setting. A bank cannot override a government-controlled setting supplied by its adopted revision. Bank-only settings remain editable through the current settings screen, but changes with financial effect require preparation and a separate approval before taking effect.
- Cover every current write path for salary-affecting fields: employee basic pay, stage and scale, DA/HRA and allowance overrides, deductions and contributions, organisation payroll rates and limits, bonus result, and direct-pay salary. HR may prepare a change, but only a distinct Approving Authority can activate its financial effect. Nonfinancial identity, contact, and posting details keep their existing edit paths. An approved assignment or setting change must never silently rewrite an approved or paid payroll run.

## Screens and API

- Platform Bank Classes & Rules: retain current draft editor and stage preview; show which published revision is current for each class and the banks using each revision. Clearly label references as documentary versus executable settings. No free-form executable formulas.
- Organisation payroll setup: show current adoption, available published revisions of its class, an impact preview of changed posts/stages/settings, proposal, approval or rejection, and an adoption history.
- Employee salary: choose an adopted revision's post and stage; show calculated basic pay and change from current salary; submit for approval; show assignment history and pending changes. Direct-pay salary uses the same approval workflow without a stage picker.
- Keep legacy pay-scale screens read-only for catalogue-linked employees. Manual stage edits cannot change a published catalogue stage or bypass the approval workflow. Preserve the legacy screen for unmigrated records until migration is complete.
- API enforces roles, tenant and class boundaries, distinct preparer/approver, effective dates, status transitions, revision immutability, and audit records. UI gating is supplementary.

## Validation and rollout

- Add focused tests for class mismatch, unpublished revision, wrong/absent stage, duplicate/overlapping assignment, same-user approval, stale concurrent approval, direct-pay separation, effective-date selection, legacy fallback, and immutable historical payslips.
- Reuse the current half-up whole-rupee policy for money; leave percentage and day fractions precise. Verify every calculation entry point named above against both catalogue and legacy employees.
- Add schema changes without resetting or reseeding live data. Existing organisations and payroll runs remain untouched. A bank moves to catalogue calculation only through reviewed adoption and employee assignment.
- Validate with the backend test suite, frontend build, version consistency, and browser review if browser access is available. Live MySQL and production payroll require separate validation before deployment.

## Scope limits

This does not let banks rewrite government scales, execute arbitrary user-entered formulas, auto-migrate existing employees by guessing their stage, or reopen approved payroll runs. New rule *types* beyond the existing catalogue field set need a later reviewed engine change; their values can be customised once supported.

Implementation ruling: Existing loan and custom-allowance edits are included in a fingerprint of a processed catalogue-bank payroll run. A different Approving Authority must approve that run, and any intervening edit requires reprocessing. These records use run-level signoff rather than separate per-record proposals. Employee pay, payroll settings, adoption and salary assignments retain separate proposals.

## Decisions left to implementation

Use the existing Sequelize/Express/React structure and current audit and payroll snapshot patterns. Choose small additive tables and an explicit migration workflow. Keep employee assignment and adoption operations transactional, with conflict responses for stale edits.
