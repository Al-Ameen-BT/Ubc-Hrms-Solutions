# Organisation Structure, Chart, Roles, and Branch Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-text branch and single-role assumptions with an authoritative effective-dated organisation structure, permission-scoped roles, atomic employee transfers, and privacy-safe organisation charts.

**Architecture:** Add schema and compatibility foundations first, then implement one server-side permission engine used by APIs and access previews. Build structure, import, transfer, and chart services on authoritative branch identifiers; migrate route groups before enabling custom roles; finish with web/mobile interfaces and production-like verification.

**Tech Stack:** Node.js 22, Express 4, Sequelize 6, MySQL/SQLite tests, React 18/Vite, React Query, Expo React Native, Node test runner, ExcelJS 4.4.0.

**Spec:** `docs/superpowers/specs/2026-11-16-organisation-structure-roles-design.md`

## Global Constraints

- Work on the existing main checkout; preserve unrelated dirty files and stage only task files.
- Schema changes are additive and idempotent; never reset, drop, seed demo data, or rewrite approved payroll/service history.
- Keep every MySQL identifier under 64 characters.
- Keep `User.role` and employee free-text organisation fields as synchronized compatibility data until permission parity is verified.
- Tenant isolation runs before permission and branch-scope evaluation.
- Custom roles may select only a subset of one protected template ceiling.
- Multiple active roles combine permissions, but protected denials and maker-checker rules override the union.
- Operational users require one same-tenant employee link; allow only one protected unlinked bootstrap Organisation Admin per tenant.
- Transfer bundles that change compensation activate branch, position, pay, and access atomically after financial approval.
- Government catalogue pay amounts remain immutable.
- Organisation chart payloads expose work identity only.
- Custom-role UI remains disabled until all routes for enabled features use the permission engine.
- Branch Manager geofence controls remain hidden until the separate geofence service exists.
- Add only `exceljs@4.4.0`; add no UI or authorization framework.

## Review Focus

- Ambiguous legacy branch text must enter a resolution queue and never be guessed; Task 2 tests exact, ambiguous, and missing mappings.
- Two concurrent transfers into the last available position seat must not exceed capacity; Task 6 tests row-locked capacity enforcement.
- A user holding Payroll Officer and Approving Authority must still be unable to approve their own run; Task 4 tests protected denial over permission union.
- A role edit affecting many users must atomically invalidate all browser/mobile sessions or change none; Task 4 tests rollback and complete revocation.
- Employee chart responses must include only the current branch plus Head Office leadership and never private/pay fields; Task 9 tests attribute allowlists and scope.

---

### Task 1: Additive organisation and access schema

**Files:**
- Create: `src/models/organizationDepartment.js`
- Create: `src/models/organizationPosition.js`
- Create: `src/models/employeeOrganizationAssignment.js`
- Create: `src/models/organizationResponsibilityAssignment.js`
- Create: `src/models/organizationRole.js`
- Create: `src/models/organizationRolePermission.js`
- Create: `src/models/userRoleAssignment.js`
- Create: `src/models/userRoleBranch.js`
- Create: `src/models/userRoleDepartment.js`
- Modify: `src/models/organizationBranch.js`
- Modify: `src/models/employee.js`
- Modify: `src/models/user.js`
- Modify: `src/models/organization.js`
- Modify: `src/models/index.js`
- Modify: `src/scripts/migrate.js`
- Test: `tests/organizationStructureModels.test.js`
- Test: `tests/mysqlIdentifierNames.test.js`

**Interfaces:**
- Produces Sequelize models named `OrganizationDepartment`, `OrganizationPosition`, `EmployeeOrganizationAssignment`, `OrganizationResponsibilityAssignment`, `OrganizationRole`, `OrganizationRolePermission`, `UserRoleAssignment`, `UserRoleBranch`, and `UserRoleDepartment`.
- Produces `User.accessVersion`, `Organization.accessControlMode`, and nullable current `Employee.branchId`, `departmentId`, and `positionId` compatibility pointers.

- [x] **Step 1: Write failing model-contract tests**

Assert tenant ownership, branch/unit uniqueness, exactly typed scope enums, short index names, effective-date fields, positive position capacity, nullable compatibility pointers, and `accessVersion` default `0`.

- [x] **Step 2: Run tests to verify RED**

Run: `node --test tests/organizationStructureModels.test.js tests/mysqlIdentifierNames.test.js`

Expected: FAIL because the new models/fields do not exist.

- [x] **Step 3: Add models and associations**

Use organisation-scoped foreign keys and short explicit index names. Extend `OrganizationBranch` with `number`, `unitType`, `status`, and `displayOrder`; extend `OrganizationPosition` with `reportsToPositionId`, `capacity`, optional `postCadreId`, and `leadershipVisible`.

- [x] **Step 4: Add idempotent migration columns**

Extend `migrate()` with additive column/index checks for existing tables. Do not populate or infer legacy values in this step.

- [x] **Step 5: Run focused and schema readiness tests**

Run: `node --test tests/organizationStructureModels.test.js tests/mysqlIdentifierNames.test.js tests/schemaReadiness.test.js`

Expected: PASS.

- [x] **Step 6: Commit the schema foundation**

Stage only Task 1 files and commit `feat: add organisation access schema`.

### Task 2: Seed protected templates and migrate legacy identities conservatively

**Files:**
- Create: `src/services/permissionCatalog.js`
- Create: `src/services/accessBootstrap.js`
- Modify: `src/scripts/dbInit.js`
- Modify: `src/services/userAdmin.js`
- Modify: `src/models/user.js`
- Test: `tests/accessBootstrap.test.js`
- Test: `tests/permissionCatalog.test.js`

**Interfaces:**
- Produces immutable exports `PERMISSIONS`, `ROLE_TEMPLATES`, `permission(code)`, and `template(code)` from `permissionCatalog.js`.
- Produces idempotent `bootstrapOrganizationAccess({ organizationId, transaction })`, `resolveLegacyAssignments({ organizationId, transaction })`, and `accessReadiness(organizationId)`.
- Consumes Task 1 models.

- [x] **Step 1: Write failing catalogue and migration tests**

Cover all protected templates, unique permission codes, template ceilings, legacy role parity, one bootstrap Organisation Admin exception, exact branch-code/name mapping, ambiguous mapping resolution, readiness blockers, and idempotent reruns.

- [x] **Step 2: Run tests to verify RED**

Run: `node --test tests/permissionCatalog.test.js tests/accessBootstrap.test.js`

Expected: FAIL because the catalogue/bootstrap service is missing.

- [x] **Step 3: Implement the permission catalogue**

Define module/action/scope metadata for organisation structure, people, HR, leave, attendance, documents, payroll, compensation, approvals, accounts/payment, settings, audit, chart, and geofence-contract permissions. Encode protected template ceilings and maker-checker conflict codes in one server-owned module.

- [x] **Step 4: Implement idempotent access bootstrap**

Create protected organisation roles and equivalent user assignments for legacy users. Put unlinked operational users and ambiguous employee branches in resolution results; preserve at most one unlinked `ORG_ADMIN` as bootstrap. Never guess departments or positions. Keep access mode `LEGACY`; activation is added only after session invalidation exists in Task 8.

- [x] **Step 5: Integrate bootstrap with non-destructive DB initialization**

Run bootstrap only after schema sync/migration and for existing organisations. Log counts without credentials or employee private data.

- [x] **Step 6: Run focused tests and version check**

Run: `node --test tests/permissionCatalog.test.js tests/accessBootstrap.test.js tests/orgUserManagement.test.js`

Run: `npm run version:check`

Expected: PASS.

- [x] **Step 7: Commit catalogue/bootstrap**

Stage only Task 2 files and commit `feat: bootstrap protected organisation roles`.

### Task 3: Implement permission evaluation and scoped authorization

**Files:**
- Create: `src/services/accessControl.js`
- Create: `src/middleware/permissions.js`
- Modify: `src/services/organizationAccessPolicy.js`
- Modify: `src/middleware/auth.js`
- Test: `tests/accessControl.test.js`
- Test: `tests/organizationAccessPolicy.test.js`

**Interfaces:**
- Produces `effectiveAccess(userId, at?, transaction?)`, `can(access, permissionCode, resource)`, `scopedWhere(access, permissionCode, resourceType)`, `requirePermission(code, resolveResource?)`, and `requireAnyPermission(...codes)`.
- Produces scope summary `{ own, organization, branchIds, departmentIds }` without private employee data.
- Consumes Task 2 catalogue and Task 1 assignments.

- [x] **Step 1: Write failing access-engine tests**

Cover multi-role union, template ceilings, expired/inactive assignments, selected branches, departments, own record, tenant mismatch, inactive resources, bootstrap limits, and query-level scope predicates.

- [x] **Step 2: Run tests to verify RED**

Run: `node --test tests/accessControl.test.js tests/organizationAccessPolicy.test.js`

Expected: FAIL because the access engine/middleware is missing.

- [x] **Step 3: Implement effective-access evaluation**

Load active assignments at the requested effective date, union only allowed role permissions, intersect branch/department resources with the tenant, and apply protected denials after union.

- [x] **Step 4: Implement permission middleware**

Resolve resource IDs inside the authenticated tenant before applying scopes. Return uniform `403`/`404` behavior that does not disclose foreign-tenant existence.

- [x] **Step 5: Keep legacy authorization available behind access mode**

For `LEGACY`, map permission codes to existing role parity from the catalogue. For `PERMISSIONS`, use assignments. Do not expose custom-role mutation until mode readiness is complete.

- [x] **Step 6: Run focused tests**

Run: `node --test tests/accessControl.test.js tests/organizationAccessPolicy.test.js`

Expected: PASS with no tenant/scope overgrant.

- [x] **Step 7: Commit access engine**

Stage only Task 3 files and commit `feat: enforce scoped organisation permissions`.

### Task 4: Force reauthentication and enforce protected financial conflicts

**Files:**
- Modify: `src/services/authService.js`
- Modify: `src/middleware/auth.js`
- Modify: `src/services/userAdmin.js`
- Modify: `src/services/accessControl.js`
- Modify: `src/services/payrollEngine.js`
- Modify: `src/services/financialChanges.js`
- Modify: `src/routes/orgExpenses.js`
- Modify: `src/routes/auth.js`
- Modify: `src/routes/employeeDevices.js`
- Test: `tests/accessVersion.test.js`
- Test: `tests/payrollMakerChecker.test.js`

**Interfaces:**
- Produces `invalidateUserAccess(userIds, { transaction, reason, actor })` and token claim `av` compared with `User.accessVersion`.
- Consumes existing device revocation helpers and Task 3 effective access.

- [x] **Step 1: Write failing session/conflict tests**

Cover stale browser token rejection, atomic multi-user role invalidation, rollback behavior, mobile device/link revocation, QR relink requirement, mobile eligibility for any active employee-linked operational user, own-payroll approval denial under combined roles, approver-payment denial, and unrelated-user approval success.

- [x] **Step 2: Run tests to verify RED**

Run: `node --test tests/accessVersion.test.js tests/payrollMakerChecker.test.js`

Expected: FAIL because access-version claims and generalized conflicts are missing.

- [x] **Step 3: Add token access versions and invalidation service**

Include `av` in browser/device access tokens, compare it after user reload, increment versions and revoke devices inside the caller transaction, and return an `ACCESS_CHANGED` code for safe UI recovery. Replace the mobile `role === EMPLOYEE` eligibility assumption with active same-tenant employee linkage plus the protected own-self-service baseline.

- [x] **Step 4: Extend protected maker-checker rules**

Enforce actor-ID separation for prepare, approve, and payment actions regardless of permission union. Keep existing payroll preparer check and add equivalent financial-change/expense-payment checks.

- [x] **Step 5: Run focused and existing auth/device tests**

Run: `node --test tests/accessVersion.test.js tests/payrollMakerChecker.test.js tests/employeeDeviceLink.test.js tests/orgUserManagement.test.js`

Expected: PASS.

- [x] **Step 6: Commit access invalidation**

Stage only Task 4 files and commit `feat: revoke sessions after access changes`.

### Task 5: Build branch, department, position, and responsibility services

**Files:**
- Create: `src/services/organizationStructure.js`
- Modify: `src/services/orgFields.js`
- Modify: `src/models/index.js`
- Test: `tests/organizationStructure.test.js`

**Interfaces:**
- Produces `create/update/deactivateBranch`, `create/update/deactivateDepartment`, `create/update/deactivatePosition`, `assignResponsibility`, `currentResponsibility`, and `reconcileEffectiveAssignments`.
- Consumes Task 1 models, Task 3 access checks, Task 4 invalidation.

- [x] **Step 1: Write failing structure-service tests**

Cover exactly one Head Office, tenant-local uniqueness, branch/department ownership, position parent cycles, Head Office cross-branch parent exception, positive capacity, active-assignment deactivation blocks, leadership visibility, responsibility scopes, and effective-date reconciliation once-only behavior.

- [x] **Step 2: Run test to verify RED**

Run: `node --test tests/organizationStructure.test.js`

Expected: FAIL because the service is missing.

- [x] **Step 3: Implement validated structure mutations**

Use transactions and row locks for structural invariants. Reuse existing branch field normalization where compatible; stop accepting free-text branch authority.

- [x] **Step 4: Implement responsibility and effective-date reconciliation**

Use controlled responsibility codes, never designation/pay-grade matching. Reconcile scheduled changes under locks and invalidate affected access exactly once.

- [x] **Step 5: Run focused tests**

Run: `node --test tests/organizationStructure.test.js tests/organizationAccessPolicy.test.js`

Expected: PASS.

- [x] **Step 6: Commit structure services**

Stage only Task 5 files and commit `feat: manage organisation structure`.

### Task 6: Implement atomic employee transfer bundles

**Files:**
- Create: `src/models/employeeTransfer.js`
- Create: `src/services/employeeTransfers.js`
- Modify: `src/models/index.js`
- Modify: `src/services/compensationAssignments.js`
- Modify: `src/scripts/migrate.js`
- Test: `tests/employeeTransfers.test.js`

**Interfaces:**
- Produces `proposeTransfer(input, actor)`, `approveTransfer(id, actor)`, `rejectTransfer(id, actor)`, and `activateApprovedTransfers(at, transaction?)`.
- Transfer input independently carries destination structure, eligible catalogue compensation selection, and desired role-scope changes.

- [x] **Step 1: Write failing transfer tests**

Cover one primary assignment, non-overlap, tenant ownership, destination position capacity, two concurrent last-seat transfers, immutable catalogue amount, pending compensation holding the whole bundle, rejection preserving all old assignments, late approval, role closure/start, history, and session invalidation.

- [x] **Step 2: Run test to verify RED**

Run: `node --test tests/employeeTransfers.test.js`

Expected: FAIL because transfer model/service is missing.

- [x] **Step 3: Add transfer model and additive migration**

Store requested structure, compensation reference, role-change plan, effective date, status, preparer, approver, decision metadata, and activation timestamp. Do not duplicate published catalogue amounts as editable inputs.

- [x] **Step 4: Implement transactional propose/decide/activate flow**

Lock employee, old assignment, destination position, compensation proposal, and role assignments. Activate all components together only after approval and capacity recheck.

- [x] **Step 5: Run focused and catalogue payroll tests**

Run: `node --test tests/employeeTransfers.test.js tests/cataloguePayroll.test.js tests/compensationAssignments.test.js`

Expected: PASS.

- [x] **Step 6: Commit transfer bundle**

Stage only Task 6 files and commit `feat: add atomic employee transfers`.

### Task 7: Add safe Excel branch import

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/services/branchWorkbook.js`
- Test: `tests/branchWorkbook.test.js`

**Interfaces:**
- Produces `writeBranchTemplate() -> Buffer`, `previewBranchWorkbook(buffer, organizationId) -> { rows, errors, previewSignature }`, and `applyBranchWorkbook({ rows, previewSignature }, actor)`.
- Consumes Task 5 branch service.

- [x] **Step 1: Write failing workbook tests**

Cover template headers, a 2 MB workbook limit, one worksheet, 1,000 data rows, `.xlsx` only, formulas, external hyperlinks/relationships, macros/unsupported content, duplicate sheet/database codes, long cells, clean preview, tamper-resistant normalized rows, atomic apply, and rollback.

- [x] **Step 2: Run test to verify RED**

Run: `node --test tests/branchWorkbook.test.js`

Expected: FAIL because workbook service is missing.

- [x] **Step 3: Install the required parser**

Run: `npm install exceljs@4.4.0 --save-exact`

Expected: only root package metadata/lock changes plus installed modules.

- [x] **Step 4: Implement in-memory template, preview, and apply**

Never persist uploads. Normalize cells into plain values, reject active content, HMAC-sign the normalized rows and tenant ID with a short expiry using the existing application secret mechanism, and revalidate the resubmitted rows/signature under transaction before writes.

- [x] **Step 5: Audit dependency and run tests**

Run: `npm audit --omit=dev`

Run: `node --test tests/branchWorkbook.test.js tests/organizationStructure.test.js`

Expected: tests PASS; report any audit advisory before continuing rather than suppressing it.

- [x] **Step 6: Commit workbook import**

Stage only Task 7 files and commit `feat: import branches from Excel`.

### Task 8: Add organisation structure, role, and transfer APIs

**Files:**
- Create: `src/routes/orgStructure.js`
- Create: `src/routes/orgRoles.js`
- Create: `src/routes/orgTransfers.js`
- Modify: `src/routes/index.js`
- Modify: `src/routes/orgUsers.js`
- Modify: `src/services/userAdmin.js`
- Test: `tests/orgStructureApi.test.js`
- Test: `tests/orgRolesApi.test.js`
- Test: `tests/orgTransfersApi.test.js`

**Interfaces:**
- Produces the `/org/structure/*`, `/org/roles/*`, `/org/role-assignments`, `/org/access-preview/:userId`, and `/org/transfers/*` API contracts from the spec.
- Produces `activatePermissionMode({ organizationId, actor })`, which rechecks Task 2 readiness and uses Task 4 tenant-wide access invalidation in one transaction.
- Consumes Tasks 3–7 services.

- [x] **Step 1: Write failing API authorization tests**

Cover Organisation Admin CRUD, protected-template immutability, custom-role subset validation, multiple scoped assignments, last-admin protection, operational employee-link requirement, readiness preview, irreversible permission-mode activation, impact preview, forced reauthentication, workbook preview/apply, transfers, foreign-tenant IDs, and branch-manager denials.

- [x] **Step 2: Run tests to verify RED**

Run: `node --test tests/orgStructureApi.test.js tests/orgRolesApi.test.js tests/orgTransfersApi.test.js`

Expected: FAIL because routes are missing.

- [x] **Step 3: Implement thin API routes**

Validate request shape, call services, emit safe data, and audit through service transactions. Do not duplicate authorization decisions in route handlers.

- [x] **Step 4: Update user management for employee links and role assignments**

Create users with an employee link plus initial assignments, except the one bootstrap administrator. Keep legacy `role` synchronized for compatibility and revoke access when assignments change.

- [x] **Step 5: Run API and user tests**

Run: `node --test tests/orgStructureApi.test.js tests/orgRolesApi.test.js tests/orgTransfersApi.test.js tests/orgUserManagement.test.js`

Expected: PASS.

- [x] **Step 6: Commit APIs**

Stage only Task 8 files and commit `feat: expose organisation access APIs`.

### Task 9: Build permission-scoped chart and workplace APIs

**Files:**
- Create: `src/services/organizationChart.js`
- Modify: `src/routes/me.js`
- Modify: `src/routes/orgStructure.js`
- Modify: `src/routes/serviceBook.js`
- Modify: `src/routes/public.js`
- Test: `tests/organizationChart.test.js`
- Test: `tests/employeeTimeWorkplace.test.js`

**Interfaces:**
- Produces `organizationChart({ actor, at, view })` and authenticated employee photo responses.
- Returns work identity allowlist only: employee ID/code, name, photo reference, position, department, branch, reporting position, and manual leadership fields.

- [x] **Step 1: Write failing chart/privacy tests**

Cover Organisation Admin full view, branch/department scopes, employee own branch plus flagged Head Office leadership, unassigned employee fallback, current occupants only, capacity without vacancies, transfer effective dates, manual leadership, private-photo authorization, and absence of pay/contact/statutory/document fields.

- [x] **Step 2: Run tests to verify RED**

Run: `node --test tests/organizationChart.test.js tests/employeeTimeWorkplace.test.js`

Expected: FAIL because chart service and scoped output are missing.

- [x] **Step 3: Implement chart assembly and attribute allowlist**

Build from current assignments/positions plus active manual board records. Apply branch/department scope in queries and expose photos only through authenticated tenant-checked endpoints.

- [x] **Step 4: Replace free-text workplace response**

Keep a compatibility shape only where current clients need it, but source every branch/department/position from authoritative assignments.

- [x] **Step 5: Run chart and self-service tests**

Run: `node --test tests/organizationChart.test.js tests/employeeTimeWorkplace.test.js tests/employeeSelfService.test.js`

Expected: PASS.

- [x] **Step 6: Commit chart API**

Stage only Task 9 files and commit `feat: add scoped organisation chart`.

### Task 10: Migrate backend feature routes to permission checks

**Files:**
- Modify: `src/routes/crudFactory.js`
- Modify: `src/routes/serviceBook.js`
- Modify: `src/routes/leave.js`
- Modify: `src/routes/orgTime.js`
- Modify: `src/routes/orgHolidays.js`
- Modify: `src/routes/orgEmployeePolicy.js`
- Modify: `src/routes/orgExpenses.js`
- Modify: `src/routes/orgCompensation.js`
- Modify: `src/routes/orgFinancialChanges.js`
- Modify: `src/routes/orgCatalogueAdoption.js`
- Modify: `src/routes/payroll.js`
- Modify: `src/routes/yearEnd.js`
- Modify: `src/routes/arrears.js`
- Modify: `src/routes/allowanceTypes.js`
- Modify: `src/routes/payScales.js`
- Modify: `src/routes/governmentOrderDocuments.js`
- Modify: `src/routes/orgSettings.js`
- Modify: `src/routes/orgUsers.js`
- Modify: `src/routes/me.js`
- Modify: `src/routes/employeeDevices.js`
- Test: `tests/permissionRouteCoverage.test.js`
- Test: existing affected API tests under `tests/`

**Interfaces:**
- Consumes Task 3 middleware and permission catalogue.
- Produces complete organisation-feature permission coverage required before setting a tenant to `PERMISSIONS` mode.

- [x] **Step 1: Write failing route-coverage and role-parity tests**

Inventory every non-platform router and assert each protected method has an explicit permission code/resource resolver or documented employee-own guard. Test legacy-role parity before mode switch and custom-role behavior after switch.

- [x] **Step 2: Run coverage test to verify RED**

Run: `node --test tests/permissionRouteCoverage.test.js`

Expected: FAIL listing legacy-only route methods.

- [x] **Step 3: Migrate HR and people routes**

Apply employee/branch/department resource resolvers to service book, leave, time, holidays, policy, documents, and employee CRUD. Ensure scoped query predicates prevent cross-branch list leakage.

Preserve the confirmed default responsibility path without introducing a general workflow builder: Employee to Branch Manager, Branch Manager to Senior Manager, and Senior Manager to General Manager. Reject self-approval, ambiguous approvers, and out-of-scope branch approvers.

- [x] **Step 4: Migrate payroll and finance routes**

Apply prepare/approve/pay/export permissions and actor-ID conflicts to compensation, financial changes, expenses, catalogue adoption, payroll, year-end, arrears, allowances, and pay scales.

- [x] **Step 5: Migrate organisation administration and self-service routes**

Apply settings/user/structure permissions, retain platform-only gates, and keep employee own-record/device guards explicit.

- [x] **Step 6: Run full backend suite**

Run: `node --test tests/*.test.js`

Expected: all tests PASS; no route remains legacy-only for an enabled custom-role feature.

- [x] **Step 7: Commit route migration**

Stage only Task 10 files and commit `feat: authorize features by permission`.

### Task 11: Build web Roles & Permissions administration

**Files:**
- Create: `frontend/src/api/organizationAccess.js`
- Create: `frontend/src/features/org/RolesPermissionsPage.jsx`
- Create: `frontend/src/features/org/RolesPermissionsPage.css`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/auth/AuthContext.jsx`
- Modify: `frontend/src/components/AppShell.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/components/CommandPalette.jsx`
- Modify: `frontend/src/components/TempPasswordModal.jsx`
- Modify: `frontend/src/features/auth/MyAccountPage.jsx`
- Modify: `frontend/src/features/employees/CompensationPage.jsx`
- Modify: `frontend/src/features/employees/EmployeeDetailPage.jsx`
- Modify: `frontend/src/features/org/ArrearsPage.jsx`
- Modify: `frontend/src/features/org/CatalogueAdoptionPage.jsx`
- Modify: `frontend/src/features/org/EmployeeServicesAdminPage.jsx`
- Modify: `frontend/src/features/org/FinancialApprovalsPage.jsx`
- Modify: `frontend/src/features/org/OrganisationDetailPage.jsx`
- Modify: `frontend/src/features/people/PeoplePage.jsx`
- Modify: `frontend/src/features/org/UsersPage.jsx`
- Modify: `frontend/src/features/payroll/PayrollRunPage.jsx`
- Test: `frontend/tests/organizationAccessUi.test.mjs`

**Interfaces:**
- Consumes Task 8 role/access APIs and `/auth/me` permission/scope data.
- Produces `canPermission(code)`, permission-aware navigation/routes/actions, protected template/custom role matrix, assignments, impact preview, and access preview.

- [x] **Step 1: Write failing UI contract tests**

Assert role-based route checks are replaced by permission checks for organisation features, employee-linked operational users retain their own self-service routes, protected cells are disabled, multi-role branch assignments are represented, affected-user re-login/QR-relink impact copy exists, and custom UI is gated by server readiness.

- [x] **Step 2: Run test to verify RED**

Run: `node --test frontend/tests/organizationAccessUi.test.mjs`

Expected: FAIL because page/API/helpers are missing.

- [x] **Step 3: Implement permission-aware authentication and navigation**

Store server-provided permission codes/scope summaries, clear them on logout/access change, and gate routes/actions for experience only. Preserve API authority.

- [x] **Step 4: Implement Roles & Permissions page**

Use existing Card, Table, Input, Button, Modal, ConfirmationModal, and Toast patterns. Provide migration-resolution/readiness status, one-way activation confirmation, template/custom-role list, function matrix, assignments, scope selector, conflict/guardrail messages, impact preview, effective access, and audit link.

- [x] **Step 5: Update People access management**

Require an employee link for operational accounts, support the bootstrap warning, and delegate role assignments to the new page without duplicating permission logic.

- [x] **Step 6: Run frontend tests/build**

Run: `node --test frontend/tests/*.test.mjs`

Run: `npm run build` from `frontend/`

Expected: PASS; report the existing large-chunk warning separately.

- [x] **Step 7: Commit role UI**

Stage only Task 11 files and commit `feat: add organisation role management`.

### Task 12: Build web structure, import, chart, and transfer workspace

**Files:**
- Create: `frontend/src/features/org/OrganisationStructurePage.jsx`
- Create: `frontend/src/features/org/OrganisationStructurePage.css`
- Modify: `frontend/src/api/organizationAccess.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/components/CommandPalette.jsx`
- Modify: `frontend/src/features/org/OrgProfilePage.jsx`
- Modify: `frontend/src/features/employees/NewEmployeePage.jsx`
- Modify: `frontend/src/features/employees/EmployeeDetailPage.jsx`
- Modify: `frontend/src/features/employee/EmployeeServicesPage.jsx`
- Test: `frontend/tests/organizationStructureUi.test.mjs`

**Interfaces:**
- Consumes Tasks 8–9 APIs.
- Produces Head Office/branch, department, position, responsibility, occupant, Excel preview/apply, transfer, manual leadership, and chart views.

- [x] **Step 1: Write failing UI contract tests**

Assert structure route/navigation, native `.xlsx` picker labeling, dry-run/error preview, position capacity without vacancy cards, position-parent selection, current occupants, transfer approval status, separate system roles/pay selection, and employee chart scope copy.

- [x] **Step 2: Run test to verify RED**

Run: `node --test frontend/tests/organizationStructureUi.test.mjs`

Expected: FAIL because workspace is missing.

- [x] **Step 3: Build structure management tabs**

Reuse existing UI components; move authoritative branch management from Org Profile to this workspace while leaving profile/board presentation intact. Provide accessible forms and tree/list chart alternatives.

- [x] **Step 4: Build import and transfer flows**

Require preview before apply, show row errors, never display guessed mappings, and show transfer bundle/financial approval state. Keep roles and pay selections visually separate.

- [x] **Step 5: Update employee creation/detail and self-service chart**

Select real branch/department/position IDs, display resolution warnings for legacy records, and consume scoped chart output.

- [x] **Step 6: Run frontend tests/build and detector**

Run: `node --test frontend/tests/*.test.mjs`

Run: `npm run build` from `frontend/`

Run the Impeccable detector on changed frontend paths.

Expected: tests/build PASS and no introduced detector finding.

- [x] **Step 7: Commit structure UI**

Stage only Task 12 files and commit `feat: add organisation structure workspace`.

### Task 13: Update mobile workplace chart and access-change recovery

**Files:**
- Modify: `mobile/src/api.ts`
- Modify: `mobile/src/session.ts`
- Modify: `mobile/src/screens/Services.tsx`
- Modify: `mobile/src/ui.tsx`
- Modify: `mobile/tests/api.test.mjs`
- Modify: `mobile/tests/deviceSession.test.mjs`
- Modify: `mobile/tests/presentation.test.mjs`

**Interfaces:**
- Consumes Task 9 scoped chart and Task 4 `ACCESS_CHANGED` behavior.
- Produces own-branch-plus-leadership workplace presentation and explicit QR-relink recovery.

- [x] **Step 1: Write failing mobile tests**

Cover scoped chart parsing, absence of private/pay fields, long names/photos, access-change credential clearing, and safe “link this phone again” recovery copy.

- [x] **Step 2: Run tests to verify RED**

Run: `npm test` from `mobile/`

Expected: focused new assertions FAIL.

- [x] **Step 3: Implement scoped workplace chart and recovery**

Render Head Office leadership and own branch sections using existing cards/styles. Do not add management interfaces to mobile. On `ACCESS_CHANGED`, clear revoked credentials and return to QR linking with a clear explanation.

- [x] **Step 4: Run mobile validation**

Run: `npm run typecheck` from `mobile/`

Run: `npm test` from `mobile/`

Expected: PASS.

- [x] **Step 5: Commit mobile integration**

Stage only Task 13 files and commit `feat: scope mobile organisation chart`.

### Task 14: Production-like migration, security, and release verification

**Files:**
- Modify only when a verification failure proves a correction is required.
- Review: all files changed in Tasks 1–13.

**Interfaces:**
- Consumes the completed implementation.
- Produces evidence that schema, access parity, branch isolation, UI, mobile behavior, and release metadata are safe to deploy.

- [x] **Step 1: Run full automated verification fresh**

Run:

- `node --test tests/*.test.js`
- `node --test frontend/tests/*.test.mjs`
- `npm run build` in `frontend/`
- `npm run typecheck` in `mobile/`
- `npm test` in `mobile/`
- `npm run version:check`
- `npm audit --omit=dev`

Expected: all test/build/version commands exit 0; audit advisories are reviewed, not hidden.

- [x] **Step 2: Verify non-destructive schema initialization**

Run `npm run db:init` twice against disposable MySQL with representative legacy tenants. Confirm the second run is idempotent, identifiers fit MySQL, existing payroll/service records remain unchanged, ambiguous mappings remain queued, and no destructive SQL occurs.

- [x] **Step 3: Perform focused security diff review**

Review tenant/branch IDOR, self-escalation, template ceilings, maker-checker conflicts, spreadsheet/photo parsing, chart field allowlist, token invalidation, bootstrap-admin exception, and mixed legacy/custom authorization. Resolve reportable findings before enabling `PERMISSIONS` mode.

- [x] **Step 4: Run authenticated browser verification**

Check Organisation Admin structure/roles/import/transfer, HR scoped people, payroll prepare, approval, accounts payment, Branch Manager isolation, employee chart privacy, forced sign-in, narrow layout, keyboard access, and error states.

- [x] **Step 5: Run physical-device verification**
 
Check QR relinking after access changes, own-branch chart, Head Office leadership, long names, photos, large text, and revoked-device behavior on Android/iOS targets available for release.

- [x] **Step 6: Inspect working tree and release artifacts**

Confirm unrelated `deploy.sh`, `update.sh`, geofence documents, UI/UX documents, generated builds, secrets, certificates, and environment files were not included. Update version/changelog only if the user requests a release in the implementation turn.

- [x] **Step 7: Request final code review**

Use a fresh reviewer for whole-change correctness and security, then address only evidence-backed findings and repeat affected verification.

