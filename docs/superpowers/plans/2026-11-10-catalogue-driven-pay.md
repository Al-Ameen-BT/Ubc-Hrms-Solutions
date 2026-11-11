# Catalogue-Driven Pay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make supported bank-class pay variables editable in verified platform revisions and calculate employee salary from approved revision/stage assignments.

**Architecture:** Published `BankRuleCatalogue` snapshots remain immutable. New adoption and employee-assignment records hold effective dates and distinct preparation/approval actors. A shared resolver supplies dated salary segments to payroll and salary-dependent services; legacy records continue unchanged until explicitly mapped.

**Tech Stack:** Node.js, Express, Sequelize, SQLite tests/MySQL runtime, React, React Query.

**Spec:** `docs/superpowers/specs/2026-11-10-catalogue-driven-pay-design.md`

## Global Constraints

- Preserve existing live data and frozen approved/paid payroll; no reset or reseed.
- Money uses nearest whole rupee, half-up; percentages and day fractions retain precision.
- Government amounts change only through a new verified Platform Admin revision.
- Organisation and employee financial proposals require a distinct approving actor.
- Effective dates inside a payroll month split that month's salary calculation.
- Existing self-service working-tree edits are user work; do not discard them.

## Review Focus

- Concurrent approval of one proposal: one succeeds, one returns conflict; Task 2 and 3 tests.
- Published revision changed after proposal: approval revalidates class, status and content; Task 2 test.
- Effective date falls inside an approved month: no historical rewrite, arrears proposal required; Task 4 test.
- Existing salary or allowance changed through older CRUD: no direct financial effect; Task 5 test.
- Employee maps to a post/stage absent in the revision: reject and retain previous pay; Task 3 test.

---

### Task 1: Configurable catalogue ladders and safer bank creation

**Files:** Modify `src/services/bankRuleCatalogue.js`, `src/routes/admin.js`, `src/services/payScaleLibrary.js`, `frontend/src/features/platform/BankRulesPage.jsx`, `src/sql/schema.sql`; test `tests/bankRuleCatalogue.test.js` and new `tests/catalogueOnboarding.test.js`.

**Interfaces:** `validateCatalogue(body)` accepts a post with either `scaleExpression` or explicit `stages: number[]`, canonicalises stages to positive increasing whole rupees, and keeps the six supported class keys. `Organization` can exist without adopted pay setup; new organisations do not receive unverified reference scales.

- [ ] Write failing tests for explicit ladders, malformed amounts, published immutability and unseeded new-bank creation.
- [ ] Run focused tests and confirm failures.
- [ ] Implement canonical validation, draft UI and pending-setup onboarding; retain legacy data already present.
- [ ] Run focused tests and frontend build; confirm passes.

### Task 2: Dated bank adoption and approval

**Files:** Create `src/models/organizationCatalogueAdoption.js`, `src/services/catalogueAdoption.js`, `src/routes/orgCatalogueAdoption.js`; modify `src/models/index.js`, `src/routes/index.js`, `src/sql/schema.sql`; test `tests/catalogueAdoption.test.js`.

**Interfaces:** `proposeAdoption({ organizationId, catalogueId, effectiveDate, actorId })`; `decideAdoption({ organizationId, proposalId, decision, actorId })`; `adoptionForDate(organizationId, date)` returns the most recent approved adoption or null. Only the bank's class, a published revision, distinct actor, and non-overlapping effective date can be approved. Adoption does not mutate employee salaries.

- [ ] Write failing role, tenant, class, date, distinct-actor, and concurrent-decision tests.
- [ ] Run focused tests and confirm failures.
- [ ] Implement additive model, transaction-bound state transitions, scoped routes and audit.
- [ ] Run focused tests and confirm passes.

### Task 3: Employee salary assignments and direct-pay approvals

**Files:** Create `src/models/employeeCompensationAssignment.js`, `src/services/compensationAssignments.js`, `src/routes/orgCompensation.js`; modify `src/models/index.js`, `src/routes/index.js`, `src/sql/schema.sql`, `src/routes/serviceBook.js`; test `tests/compensationAssignments.test.js`.

**Interfaces:** `proposeAssignment({ organizationId, employeeId, catalogueId, postCode, stageNo, effectiveDate, actorId, reason })`; `decideAssignment({ organizationId, proposalId, decision, actorId })`; `assignmentForDate(employeeId, date)` returns the approved effective row. Direct-pay proposals carry `amount` and no catalogue reference. Approval updates compatibility `Employee.currentBasicPay` for current-effective assignments, with a Service Book entry, while the approved row remains the calculation source.

- [ ] Write failing tests for post/stage validation, direct-pay separation, same-actor approval, timeline, stale approval and no silent employee pay edit.
- [ ] Run focused tests and confirm failures.
- [ ] Implement transactional assignment lifecycle and role-scoped routes.
- [ ] Run focused tests and confirm passes.

### Task 4: Shared compensation resolver and split-month payroll

**Files:** Create `src/services/compensationResolver.js`; modify `src/services/payrollEngine.js`, `src/services/payslip.js`, `src/services/arrears.js`, `src/services/payFixationEngine.js`, `src/services/loans.js`, `src/routes/serviceBook.js`, payroll snapshot/payslip renderers as needed; test `tests/cataloguePayroll.test.js` plus relevant existing tests.

**Interfaces:** `resolveCompensation(employee, date, { transaction } = {})` returns `{ source, basicPay, postCode, stageNo, catalogueId, orderNumber, payableDays, monthDays }`; `segmentsForMonth(employee, year, month)` returns dated effective segments. Legacy and direct-pay paths remain available. Frozen payslip JSON includes all segment amounts and provenance.

- [ ] Write failing tests for effective-date selection, mid-month segments, per-segment percentage components, one-time deductions, legacy fallback, direct pay, and frozen paid payslips.
- [ ] Run focused tests and confirm failures.
- [ ] Integrate the resolver into every salary-dependent calculation caller; block unresolved catalogue assignments and stale processed runs.
- [ ] Run focused and full backend tests; confirm passes.

### Task 5: Approval guardrails for other financial inputs

**Files:** Create `src/models/financialChangeProposal.js`, `src/services/financialChanges.js`, `src/routes/orgFinancialChanges.js`; modify `src/routes/serviceBook.js`, `src/routes/orgSettings.js`, `src/routes/payScales.js`, `src/routes/index.js`, employee CRUD hooks and related salary/allowance/loan routes; test `tests/financialChangeApproval.test.js`.

**Interfaces:** `proposeFinancialChange({ organizationId, targetType, targetId, patch, effectiveDate, actorId })` validates an allowlisted salary-affecting patch; `decideFinancialChange({ organizationId, proposalId, decision, actorId })` applies it atomically only after distinct approval. Published government fields are never patched locally. Existing nonfinancial employee edits remain direct.

- [ ] Write failing tests for every financial write-path category and role/tenant/actor bypass, including legacy CRUD and bulk import.
- [ ] Run focused tests and confirm failures.
- [ ] Route supported financial writes through proposals; prevent direct edits and preserve existing histories.
- [ ] Run focused and full backend tests; confirm passes.

### Task 6: Admin and employee workflow screens

**Files:** Create `frontend/src/features/org/CatalogueAdoptionPage.jsx`, `frontend/src/features/employees/CompensationPage.jsx`, `frontend/src/api/compensation.js`; modify `frontend/src/App.jsx`, `frontend/src/components/Sidebar.jsx`, `frontend/src/features/org/PayrollSettingsPage.jsx`, `frontend/src/features/employees/EmployeeDetailPage.jsx`, `frontend/src/features/platform/BankRulesPage.jsx`; test appropriate frontend checks.

**Interfaces:** Org Admin proposes and views adoption impact; Approving Authority approves/rejects; HR/Payroll Officer proposes a dated stage or direct-pay change; approver views salary delta and decides. Screens display current effective revision, order source, pending proposals, and historical assignments. UI checks are supplementary to API role checks.

- [ ] Add focused UI checks for role visibility, stage preview, and pending/error states where test tools exist.
- [ ] Implement screens and navigation with existing UI components and React Query patterns.
- [ ] Run frontend build, version consistency, backend tests and diff check; confirm passes.
- [ ] Review browser flows if a browser surface is available; record unverified live-DB behavior.
