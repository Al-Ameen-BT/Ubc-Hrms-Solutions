# Employee Self-Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give linked employees, including direct-pay staff, private pay, leave, policy, calendar, directory, time, and reimbursement workflows with staff controls.

**Architecture:** Use the existing React console and Express API. `/api/v1/me` derives employee and tenant identity from authenticated account data, while `/api/v1/org` exposes role-gated policy, holiday, time correction, and expense review actions. Existing payroll and leave services remain authoritative.

**Tech Stack:** Express, Sequelize/MySQL (SQLite tests), React, React Router, React Query, existing UI primitives; no new dependency.

**Spec:** `docs/superpowers/specs/2026-11-10-employee-self-service-design.md`

## Global Constraints

- Own-record and tenant checks happen on the server. Unknown or unlinked employee accounts receive a clear 409.
- Payslips are frozen and visible only when the run is `APPROVED` or `PAID`.
- New database tables are additive; do not reset, seed, or alter a live database.
- Reimbursement remains separate from payroll and uses positive whole rupees.
- Time entries use server timestamps and do not change monthly LOP automatically.
- Policy versions and acknowledgements are append-only; no policy access lock.
- Existing People, login/password/MFA, leave decisions, and UI primitives are reused.

## Review Focus

- A user linked to an employee in another tenant or a missing record receives 409 with no data (Task 1 test).
- A guessed payslip, receipt, leave application, or time entry ID from another employee returns 404 (Tasks 1, 3, 4 tests).
- Simultaneous or repeated check-in creates only one open entry per bank-local date (Task 3 test).
- A policy replacement makes the new version unacknowledged without deleting prior evidence (Task 2 test).
- A claim cannot be approved by its submitter or preparer or marked paid twice (Task 4 test).

---

### Task 1: Identity, account linking, pay, and leave

**Files:** Modify `src/services/userAdmin.js`, `src/routes/orgUsers.js`, `src/routes/index.js`, `frontend/src/features/org/UsersPage.jsx`, `frontend/src/features/employee/EmployeePortalPage.jsx`. Create `src/routes/me.js`, `frontend/src/api/employee.js`, `tests/employeeSelfService.test.js`.

**Interfaces:** `me` router provides `GET /context`, `/payslips`, `/payslips/:id/pdf`, `/leave/types`, `/leave/balances`, `/leave/applications`; `POST /leave/applications`, `/leave/applications/:id/cancel`. `loadOwnEmployee(req)` scopes by both employee and org and is reused in later tasks. The frontend `employeeApi` exports matching calls. Existing `leave.applyLeave` and `leave.cancelLeave` provide state changes.

- [ ] Write focused API tests for unlinked/wrong-org accounts; finalized-only own payslips and PDF; leave balance, application, and pending-only cancellation; and active duplicate link rejection.
- [ ] Run `node --test tests/employeeSelfService.test.js` and observe the new tests fail.
- [ ] Implement `/me` own-record loader and pay/leave routes; validate date/type inputs through the existing leave service, audit mutations, and return 404 for foreign child IDs.
- [ ] Remove the direct-pay account-link exclusion; validate same-tenant and single-active-link on create and update. Add employee selection/link editing in People Account access.
- [ ] Point dashboard leave balances to `/me` and expose the employee API client. Run the focused test until it passes.

### Task 2: Versioned policy and holiday calendar

**Files:** Create `src/models/employeePolicy.js`, `src/models/employeePolicyAcknowledgement.js`, `src/models/organizationHoliday.js`, `src/routes/orgEmployeePolicy.js`, `src/routes/orgHolidays.js`, `tests/employeePolicyCalendar.test.js`. Modify `src/models/index.js`, `src/routes/index.js`, `src/routes/me.js`, `src/sql/schema.sql`.

**Interfaces:** `/me/policy` returns current version plus this account's acknowledgement; `/me/policy/acknowledge` requires exact current policy ID/version. `/me/calendar?year=&month=` returns own leave/time and active holidays. Staff policy/holiday routes derive org from `req.user.organizationId` and use ORG_ADMIN, with HR_ADMIN also allowed for holidays.

- [ ] Write tests for initial empty policy, changed/unchanged save, stale acknowledgement, later-version pending state, tenant holiday isolation, and invalid month/year.
- [ ] Run `node --test tests/employeePolicyCalendar.test.js` and observe failure.
- [ ] Add additive models/associations and versioned policy + holiday staff handlers; audit all writes and reject duplicate dates.
- [ ] Add `/me` policy acknowledgement and calendar handlers, querying own records only. Run focused tests to pass.

### Task 3: Workplace directory and daily time

**Files:** Create `src/models/employeeTimeEntry.js`, `src/routes/orgTime.js`, `tests/employeeTimeWorkplace.test.js`. Modify `src/models/index.js`, `src/routes/index.js`, `src/routes/me.js`, `src/sql/schema.sql`.

**Interfaces:** `/me/workplace` returns only active same-organisation work identity (`name`, `empCode`, `branchName`, `department`, `designation`, `PostCadre.name`). `/me/time`, `/me/time/check-in`, `/me/time/check-out` use bank-local date and server UTC timestamps. `/org/time` reads org records; `/org/time/:id/correct` requires HR_ADMIN/HR_OFFICER/ORG_ADMIN, a reason, and audit of old/new timestamps.

- [ ] Write tests for directory field allowlist and cross-tenant isolation; check-in/out ordering, duplicate/concurrent check-in, month validation, foreign entry 404, and audited correction.
- [ ] Run `node --test tests/employeeTimeWorkplace.test.js` and observe failure.
- [ ] Add the additive time model and server handlers with a unique `(employee_id, local_date)` key; time correction preserves audit history. Run focused tests to pass.

### Task 4: Reimbursement claims and separate approval

**Files:** Create `src/models/expenseClaim.js`, `src/models/expenseReceipt.js`, `src/routes/orgExpenses.js`, `tests/employeeExpenses.test.js`. Modify `src/models/index.js`, `src/routes/index.js`, `src/routes/me.js`, `src/sql/schema.sql`.

**Interfaces:** `/me/expenses` list/create and `/me/expenses/:id/receipt|withdraw`; `/org/expenses` list and `/org/expenses/:id/prepare|decide|pay|receipt`. Submission accepts expense date/category/purpose/positive integer amount and a PDF/image data URL, using `documents.decodeUpload` exported from existing validation. `SUBMITTED → PREPARED → APPROVED/REJECTED → PAID`; withdrawal before approval. Prepare: ACCOUNTS_OFFICER/PAYROLL_OFFICER; decide: APPROVING_AUTHORITY/ORG_ADMIN excluding submitter/preparer; pay: ACCOUNTS_OFFICER excluding approver. All writes audited.

- [ ] Write tests for amount/receipt validation, tenant and receipt ownership, exact status transitions, self-approval, preparer-approval and double-payment rejection.
- [ ] Run `node --test tests/employeeExpenses.test.js` and observe failure.
- [ ] Add additive claim/receipt models and guarded employee/staff routes; reuse upload sniffing and authenticated byte response; never return bytes in lists. Run focused tests to pass.

### Task 5: Employee and staff experience

**Files:** Modify `frontend/src/App.jsx`, `frontend/src/components/Sidebar.jsx`, `frontend/src/api/employee.js`, `frontend/src/features/employee/EmployeePortalPage.jsx`, `frontend/src/features/org/SettingsPage.jsx` or add focused org page. Create focused React feature pages under `frontend/src/features/employee/` for pay, leave, policy, calendar, workplace, time, expenses; add org review/holiday/time pages under `frontend/src/features/org/` only as needed.

**Interfaces:** Route guards show employee pages only to EMPLOYEE; staff routes keep staff-only access. React Query keys include account/tenant, with invalidation after each mutation. File downloads use existing authenticated helpers. UI displays server errors and pending/empty states.

- [ ] Implement employee sidebar/routes and dashboard links, finalized pay/PDF, leave request and status, policy acknowledgement, month calendar, grouped workplace, check-in/out, and claim receipt/status.
- [ ] Implement ORG_ADMIN policy editing and holiday management, HR time review/correction, accounts preparation/payment, and authority decision screens with clear role-specific actions.
- [ ] Run `npm run version:check`, relevant `node --test` files, and `npm --prefix frontend run build`; fix failures.
- [ ] Inspect the main employee and staff flows in a browser if available, and record any runtime boundary honestly.

### Task 6: Final verification and review

**Files:** Only fixes required by the review and tests.

- [ ] Re-read the approved design against implementation for omissions and unauthorized exposure.
- [ ] Run focused test suite, frontend build, and `git diff --check`; inspect changed files and status.
- [ ] Request code review using `superpowers:requesting-code-review`, address findings, and repeat only checks affected by fixes.
