# Task 12 implementer report

## Delivered

- Added the Organisation Structure workspace for Head Office and branches, departments, positions, reporting parents, capacity, staffing, responsibilities, branch workbook import, transfers, and current chart/list views.
- Moved branch configuration out of Organisation Profile. Profile branding, board records, and leadership presentation remain there with a link to the structure workspace.
- Added a distinct confirmed Head Office configuration flow. Branch create/import stays disabled until exactly one active Head Office is visible; server validation remains authoritative.
- Added permission-aware navigation and actions using `canPermission(code, legacyRoles)`, while retaining API authorization as the source of truth.
- Updated permission-mode onboarding to require a real branch and effective date, employee details to show current assignments and legacy-resolution warnings, and self-service Workplace to use the scoped `/me/chart` payload.
- Added safe transfer-history serialization for persisted role-scope IDs and scopes. The sanitizer omits unknown fields such as nested proposal payload, actor data inside role changes, and rupee amounts.
- Geofence controls remain hidden because the separate service is not implemented.

## Verification

- `node --test frontend/tests/*.test.mjs`: 3 files passed, 0 failed.
- `node --test tests/orgTransferSafeResponse.test.js`: passed. Confirms safe normalization of role, branch, department, and assignment identifiers while excluding nested fields.
- `npm run build` in `frontend/`: passed. Vite reports a 747.92 kB JavaScript chunk above its 500 kB advisory threshold. The environment also printed three `Failed to create stream fd: Operation not permitted` messages before the successful build.
- `npm run version:check`: passed; version 0.2.2 is consistent.
- `git diff --check`: passed.
- Impeccable detector ran once on the changed JSX/CSS files. It found two side-tab border patterns in the new structure stylesheet; both were replaced with full subtle outlines. The detector was not rerun.
- The focused endpoint integration test `tests/orgTransfersApi.test.js` was not rerun because its local HTTP server previously failed to bind with sandbox `listen EPERM`. The response sanitizer has focused unit coverage; list/detail HTTP serialization is not confirmed in this sandbox.
- Browser/CUA was unavailable. No browser flow or screenshot verification is claimed.

## Files staged for Task 12

- `frontend/src/App.jsx`
- `frontend/src/api/employee.js`
- `frontend/src/api/organizationAccess.js`
- `frontend/src/components/CommandPalette.jsx`
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/features/employee/EmployeeServices.css`
- `frontend/src/features/employee/EmployeeServicesPage.jsx`
- `frontend/src/features/employees/EmployeeDetailPage.jsx`
- `frontend/src/features/employees/NewEmployeePage.jsx`
- `frontend/src/features/org/OrgProfilePage.jsx`
- `frontend/src/features/org/OrganisationStructurePage.css`
- `frontend/src/features/org/OrganisationStructurePage.jsx`
- `frontend/tests/organizationStructureUi.test.mjs`
- `src/routes/orgTransfers.js`
- `tests/orgTransfersApi.test.js`
- `tests/orgTransferSafeResponse.test.js`
- This report.

Unrelated deploy/update scripts and other dirty specs/plans remain unstaged.

## Review fixes

Applied the four Task 12 review findings:

1. Permissions-mode onboarding now builds an explicit identity/service allowlist with `organizationAssignment`; it does not send pay or bank keys. Its Bank step and bank review row are omitted. The existing legacy onboarding flow still includes Bank. RED: `employeeOnboardingPayload.test.mjs` failed because the policy functions were missing. GREEN: both behavior tests pass, including a payload with populated bank/pay fields that are absent from the result.
2. Added `GET /org/structure/branch-options`, guarded by `people.create`. It returns active branch IDs, names, and statuses through the existing effective-scope query. HR Officers only receive selected branches; HR Admins receive organisation branches. It does not grant `branches.view` or branch management. Onboarding now uses this endpoint in permission mode. RED: `orgBranchOptions.test.js` failed because the reader was missing. GREEN: the database-backed test passes for both roles, confirms safe fields, and confirms `branches.view` and `branches.manage` remain denied. An HTTP regression was also added to `permissionFeatureRoutes.test.js`; its listener-based suite cannot start in this sandbox (`listen EPERM` on `127.0.0.1`), so that route-level assertion remains unexecuted here.
3. Structure profile links now require profile viewing permission; the board management link additionally requires settings configuration permission. RED: `orgProfileLinkAccess.test.mjs` failed because the link policy was missing. GREEN: chart-only, view-only, and manager policy cases pass, and the page consumes the policy for both links.
4. Transfer compensation references now include exact-date pending proposals and, for direct-pay employees, only the latest approved assignment on or before the transfer date. RED: `transferCompensationOptions.test.mjs` failed because the filter policy was missing. GREEN: its behavior test excludes older, future, and wrong-date pending assignments while retaining the current approved and exact-date pending rows.

### Review-fix verification

- `node --test frontend/tests/*.mjs`: 6 files passed, 0 failed.
- `node tests/organizationStructure.test.js`: 17 passed; `node tests/organizationStructureModels.test.js`: 6 passed.
- `node tests/orgBranchOptions.test.js`: passed; `node tests/orgTransferSafeResponse.test.js`: passed.
- `node --test tests/permissionFeatureRoutes.test.js` could not initialize its pre-existing local HTTP server because the sandbox denies loopback `listen` with `EPERM`. The new branch-scope unit test runs the real access resolver, permission middleware, and scoped database reader without a socket.
- `npm run build` in `frontend/`: passed. Vite reported the large-chunk advisory (748.77 kB); the environment printed three `Failed to create stream fd: Operation not permitted` messages before the successful build.
- `npm run version:check`: passed at 0.2.2. `git diff --check`: passed.
- Impeccable detector was not rerun, as directed; it had already run once for Task 12. Browser/CUA verification remains unavailable.
