# Task 11 implementer report

## Verification

- `node --test frontend/tests/*.test.mjs`: 2 passed, 0 failed.
- `npm run build` in `frontend/`: passed. Vite reports the existing large chunk at 672.86 kB (gzip 180.71 kB), above the 500 kB advisory threshold.
- `node --test tests/*.test.js`: 275 passed, 0 failed. The first run was attempted in the restricted sandbox; the successful rerun used normal loopback access for the local HTTP integration tests.
- `npm run version:check`: passed; version 0.2.2 is consistent.
- `git diff --check` and staged diff check: passed.
- Impeccable detector: prior implementer ran it once on 23 JSX/CSS targets and reported no findings. Not rerun.
- Browser/CUA was unavailable. No browser flow or screenshot verification is claimed.

## Fixture adjustment

`tests/accessControl.test.js` now derives its reference date from the current UTC day and uses relative dates for expired and future assignments. This keeps bootstrap-created assignments (which use the current day) aligned with the test evaluation date and avoids a one-day stale fixture. Test-only; no production access-control behavior changed.

## Files staged for Task 11

- `frontend/src/App.jsx`
- `frontend/src/api/client.js`
- `frontend/src/api/organizationAccess.js`
- `frontend/src/auth/AuthContext.jsx`
- `frontend/src/components/AppShell.jsx`
- `frontend/src/components/CommandPalette.jsx`
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/components/TempPasswordModal.jsx`
- `frontend/src/features/auth/MyAccountPage.jsx`
- `frontend/src/features/employees/CompensationPage.jsx`
- `frontend/src/features/employees/EmployeeDetailPage.jsx`
- `frontend/src/features/org/ArrearsPage.jsx`
- `frontend/src/features/org/CatalogueAdoptionPage.jsx`
- `frontend/src/features/org/EmployeeServicesAdminPage.jsx`
- `frontend/src/features/org/FinancialApprovalsPage.jsx`
- `frontend/src/features/org/OrganisationDetailPage.jsx`
- `frontend/src/features/org/RolesPermissionsPage.css`
- `frontend/src/features/org/RolesPermissionsPage.jsx`
- `frontend/src/features/org/UsersPage.jsx`
- `frontend/src/features/payroll/PayrollRunPage.jsx`
- `frontend/src/features/people/PeoplePage.jsx`
- `frontend/tests/organizationAccessUi.test.mjs`
- `src/routes/auth.js`
- `src/routes/orgRoles.js`
- `src/services/permissionCatalog.js`
- `src/services/userAdmin.js`
- `tests/accessControl.test.js`
- `tests/orgRolesApi.test.js`
- `tests/organizationAccessUiMetadata.test.js`

Deployment scripts, unrelated specs/plans, and unrelated UI edits remain unstaged.

## Addendum: remaining permission-aware UI actions

Completed the Task 11 permission-gate tail in `EmployeeAttendanceTab.jsx`, `EmployeeBankAccountsTab.jsx`, `EmployeeDocumentsTab.jsx`, `EmployeeLoansTab.jsx`, `EmployeesPage.jsx`, `ResourceSection.jsx`, `ArrearsCasePage.jsx`, `DaRevisionPage.jsx`, and `PayrollPage.jsx`. These actions use `canPermission(code, legacyRoles)` with existing legacy role allowlists, preserve own-document access through `self.documents`, and retain the existing arrears preparer/approver separation.

Validation: `node --test frontend/tests/*.test.mjs` passed (2 passed, 0 failed); `npm run build` passed; `npm run version:check` passed (version 0.2.2 consistent); and `git diff --check` passed. Vite reported the existing 672.86 kB JavaScript chunk (180.71 kB gzip), above its 500 kB advisory threshold.

## Fix Round 1

- Added focused UI contract tests for payment-only reimbursement projection and optional role-assignment query failures.
- RED: `node frontend/tests/organizationAccessUi.test.mjs` failed the two new tests against the prior implementation (11 passed, 2 failed).
- GREEN: `node --test frontend/tests/*.test.mjs` passed (2 files, 2 passed, 0 failed; the organization access file contains 13 passing checks).
- Reimbursement receipts now require `expenses.view` with the backend's existing legacy role allowlist. Payment-only rows show restricted text for omitted fields; API permissions are unchanged.
- Readiness, role, and catalogue errors remain in the core page error state. User, assignment, branch, and department query errors stay inside User assignments; only dependent assignment controls are disabled. Effective-access preview loads only after a user record is available.
- `npm run build` passed. Vite reports a 674.70 kB JavaScript chunk (181.07 kB gzip), above the 500 kB advisory threshold. Build output also printed three `Failed to create stream fd: Operation not permitted` messages before completing successfully.
- `npm run version:check` passed (0.2.2 consistent); `git diff --check` passed.
- No browser flow was run. The Impeccable detector was not manually rerun.
