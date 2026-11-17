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

## Position-derived onboarding follow-up

Inspection confirmed `Employee.postCadreId` is non-null and `designation` is mandatory by default. The existing reconciliation path already maps `Position.name` to employee designation. Permission-mode onboarding now requires an active position matching the selected branch and department, verifies its post/cadre belongs to the same organisation, derives both fields from that position, and runs permission-mode mandatory-field validation inside the transaction before `Employee.create`. Client attempts to supply either field are rejected. The legacy creation path is unchanged.

HR Admin and HR Officer templates have `people.create` without `positions.view`, so the required selector could not use the existing positions endpoint. Added `GET /org/structure/position-options` under `people.create`; it returns only active, post-backed positions in the caller's effective scope with safe option fields. The frontend now uses that reader, requires a selected post-backed position, and clears it when branch or department changes. This does not grant `positions.view` or `positions.manage`.

RED/GREEN evidence:

- `permissionOnboardingPosition.test.js` first failed on the exact frontend helper payload with `Employee.postCadreId cannot be null`. It now passes 6 database-backed cases: derived fields and assignment, missing/mismatched position, branch-scope denial, inactive/no-post position, client overrides, and scoped option listing for HR Officer versus HR Admin.
- The new position-readiness case in `employeeOnboardingPayload.test.mjs` first failed because the readiness policy was absent. It now confirms an active post-backed position in the selected unit and effective date are required. Frontend wiring checks cover the required selector and branch/department dependent resets.
- `permissionFeatureRoutes.test.js` was updated to exercise derived fields and the read endpoint over HTTP, but its pre-existing local listener cannot start in this sandbox (`listen EPERM` on `127.0.0.1`). The service-level database tests run without a socket.

### Follow-up verification

- `node --test frontend/tests/*.mjs`: 6 files passed, 0 failed.
- `node tests/permissionOnboardingPosition.test.js`: 6 passed; `node tests/organizationStructure.test.js`: 17 passed; `node tests/organizationStructureModels.test.js`: 6 passed.
- `node tests/orgBranchOptions.test.js` and `node tests/orgTransferSafeResponse.test.js`: passed.
- `npm run build` in `frontend/`: passed. Vite reported a 749.71 kB chunk advisory; three stream-FD permission messages appeared before the successful build.
- `npm run version:check`: passed at 0.2.2. `git diff --check`: passed.
- Impeccable detector was not rerun, as directed.
