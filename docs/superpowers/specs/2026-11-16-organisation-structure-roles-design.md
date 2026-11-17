# Organisation Structure, Chart, Roles, and Branch Access Design

## Intent

Build one authoritative organisation model for each bank so its Head Office, branches, departments, positions, employees, system roles, and access scopes remain consistent. Organisation Admins manage the structure and create bank-specific roles from protected templates. Employees and organisation users receive only the functions and records allowed by their active assignments.

This design replaces branch-name and single-role assumptions with effective-dated organisational assignments and permission-based authorization. It preserves the government catalogue as the authority for pay-scale amounts.

## Confirmed product decisions

- A user may hold multiple system roles simultaneously.
- Each role assignment is independently scoped to one branch, selected branches, a department, own record, or the entire organisation only when its protected template allows that scope.
- Organisation Admins customize copies of protected role templates; protected templates and security guardrails cannot be changed.
- Role and permission changes take effect immediately, are audited, revoke browser and mobile sessions, and force affected users to sign in again.
- HR Admin has organisation-wide employee and HR-policy management.
- HR Officers manage non-financial employee records, attendance, leave, and documents only within assigned branches.
- Payroll Officers prepare calculations; Approving Authorities approve; Accounts Officers process approved payroll and reimbursement payments.
- Branch Managers operate only within assigned branches. They cannot edit branch identity or structure.
- Organisation Admins create and configure branches manually or through a validated Excel import.
- Branch Managers may manage geofences only for their assigned branches; Organisation Admins retain organisation-wide visibility and override authority.
- An employee has one primary branch at an effective date. Transfers preserve history.
- Organisation Admins select the destination branch, department, position, eligible post/pay stage, and separate system-role assignments during a transfer.
- When a transfer changes compensation, branch, position, pay, and access remain one pending bundle and activate together only after financial approval.
- Every operational organisation user must link to exactly one employee record. One protected unlinked bootstrap Organisation Admin is permitted during onboarding until an employee link is configured.
- Reporting lines are position-based. Employees occupy positions through effective-dated assignments.
- A position has configurable capacity and may have multiple current occupants. The normal chart displays current occupants only, without empty vacancy cards.
- Departments belong to the organisation and are classified under either Head Office or one branch. The same department name may exist in different units.
- The chart is hybrid: employee nodes are generated from assignments; board/external leadership nodes are maintained manually.
- Ordinary employees see their own branch plus Head Office leadership only.
- A general workflow builder for approval chains above General Manager is explicitly deferred.

## Goals

1. Make Head Office and branch records authoritative and tenant-scoped.
2. Categorize every employee and organisation user through real branch assignments rather than free-text labels.
3. Represent departments, positions, capacity, reporting lines, occupants, transfers, and history.
4. Render a clear organisation chart with names, photographs, positions, branches, and departments.
5. Support protected role templates, bank-specific custom roles, multiple user-role assignments, function permissions, and selected-branch scopes.
6. Tailor navigation, pages, actions, and API data to effective permissions.
7. Enforce strict tenant, branch, department, and own-record isolation on the server.
8. Preserve maker-checker financial separation even when one person holds several roles.
9. Force re-authentication whenever an affected user’s access changes.
10. Migrate existing branches, employees, users, and roles conservatively without guessing ambiguous mappings.

## Non-goals

- A general drag-and-drop approval-workflow builder.
- Automatically deriving system access from pay grade, designation, post, or chart position.
- Allowing Organisation Admins to edit government pay-stage amounts.
- Replacing the existing employee, payroll, service-book, board-profile, or geofence domains.
- Giving Branch Managers authority to edit branch number, name, structure, departments, positions, or employee transfers.
- Displaying salary, bank account, personal contact, statutory, identity, or private document data on the organisation chart.
- Empty position placeholders in the normal employee-facing chart.
- Arbitrary permissions invented by a bank; the platform owns the permission catalogue.

## Approaches considered

### 1. Unified organisational assignment model — selected

Head Office, branches, departments, positions, employee occupancy, system-role assignments, and permission scopes share authoritative identifiers and effective dates. The chart, access enforcement, transfers, geofences, and future workflows consume the same assignments.

This costs more migration work but prevents chart, payroll, and access data from disagreeing.

### 2. Separate chart overlay — rejected

Keep current free-text employee branch fields and build a separate chart mapping. This is quicker initially but creates duplicate data and stale mappings after transfers.

### 3. Fully generic tree — rejected

Store arbitrary node types and edges. This is visually flexible but weakens validation, branch isolation, transfer rules, bulk import, payroll connections, and reporting.

## Core concepts and data ownership

### Organisation unit and branch

Reuse `OrganizationBranch` as the authoritative organisational unit for both Head Office and ordinary branches. Extend it with:

- unique organisation-scoped branch number/code;
- unit type `HEAD_OFFICE` or `BRANCH` rather than relying only on a display flag;
- active/inactive status;
- display order;
- audit metadata where the existing audit service cannot infer it.

Each organisation must have exactly one active Head Office. Branch identity and structural configuration are writable only by an Organisation Admin. Branch Manager geofence permissions operate through the separate geofence service and never grant branch-master edit permission.

### Department

Add an organisation department record containing:

- `organizationId`;
- `branchId`, pointing to Head Office or an ordinary branch;
- code and name, unique within that branch;
- active status and display order.

Department Head authority is limited to explicitly assigned departments and their owning branch. A Head Office department does not automatically confer organisation-wide access.

### Organisational position

Add a position record containing:

- organisation, branch, and department ownership;
- name/code;
- optional linked `PostCadre` for eligibility and display, not authorization;
- reporting parent position;
- positive capacity;
- display order and active status.

Reporting edges must stay inside one organisation and must be acyclic. A position may report across branch boundaries only when the parent is a Head Office leadership position. Position capacity is enforced for overlapping current assignments.

### Employee organisational assignment

Add an effective-dated assignment ledger containing:

- organisation and employee;
- branch, department, and position;
- effective-from and optional effective-to dates;
- transfer reference and actor;
- active/current derivation.

An employee may have only one active primary organisational assignment on a date. Assignments may not overlap. The position must belong to the selected department and branch. Current branch/department/position foreign keys may be retained on `Employee` as synchronized read optimizations, while the assignment ledger remains the history authority.

Legacy `branchName`, `branchCode`, `department`, and `designation` fields remain readable during migration and are synchronized for compatibility until every consumer uses identifiers.

### Organisational responsibility assignment

Add a separate effective-dated responsibility assignment for controlled responsibilities such as `BRANCH_MANAGER`, `SENIOR_MANAGER`, and `GENERAL_MANAGER`. It links an employee/user to organisation, branch or organisation-wide scope, effective dates, and active status. Leave routing and future workflows consume these records; they never infer authority from free-text designation, position name, pay grade, or pay scale.

Head Office positions also carry a controlled `leadershipVisible` flag. Only current occupants of flagged positions and active manual board/leadership records appear in the employee-facing Head Office leadership section.

### Board and manual leadership nodes

Reuse `OrganizationBoardMember` for manual board, Managing Director, General Manager, adviser, and other external leadership profiles. It already supports name, role, display order, photograph, and tenant ownership.

Manual nodes appear in the Head Office leadership section. They do not receive application access unless separately linked through an employee and user account. Photograph validation continues to use the existing sniffed-image and size-limited asset behavior.

## Branch creation and Excel import

Organisation Admins receive:

- manual branch creation and editing;
- a downloadable `.xlsx` template;
- Excel upload with preview/dry-run;
- row-level validation and error export;
- an explicit apply step after a clean preview.

The template contains branch number, branch code, branch name, address, and phone. Normal imports create `BRANCH` rows only. Head Office creation or replacement is a separate, strongly confirmed Organisation Admin action so an import cannot violate the exactly-one-Head-Office invariant. The importer trims cells, caps lengths, rejects formulas and unsupported types, detects duplicates inside the sheet and database, and validates the full workbook before writes. It applies all accepted rows in one transaction; no partial import occurs on validation failure.

The implementation plan selects one maintained server-side `.xlsx` parser used only for this boundary. Only `.xlsx` is accepted. Workbooks are limited by bytes, rows, and sheet count; formulas, macros, external relationships, and unsupported cell types are rejected. Uploaded workbooks are never executed or persisted after processing.

## Employee transfer behavior

The Organisation Admin transfer form selects independently:

1. effective date;
2. destination branch;
3. destination department;
4. destination organisational position;
5. eligible government-catalogue post and pay stage or approved direct-pay arrangement;
6. system-role assignments and selected-branch scopes to start or end.

System roles are never automatically derived from position or pay scale. The UI may suggest the previous role configuration but requires explicit confirmation.

On the effective date:

- the old organisational assignment closes;
- the new assignment becomes current;
- old branch-scoped system-role assignments close unless explicitly retained for still-authorized selected branches;
- new role assignments become active;
- affected sessions are revoked;
- the chart and access scopes update;
- transfer history remains immutable and auditable.

If a transfer changes compensation, the pay selection creates or references the existing financial-change/compensation approval flow. Government amounts are calculated from the adopted catalogue and cannot be edited. A salary-impacting transfer does not activate its financial portion before approval. Effective-month payroll splitting continues to follow the approved catalogue-driven payroll design.

A transfer bundle that changes compensation remains wholly pending until approval: branch, department, position, pay, and access do not activate separately. Rejection leaves the employee on the previous approved organisational, compensation, and access assignments. After approval, the complete bundle activates atomically on the effective date; approval after that date activates it through the effective-date reconciler with the established payroll treatment.

## Role and permission model

### Platform permission catalogue

The platform owns a stable permission catalogue. Each permission has:

- immutable code;
- feature/module;
- action such as view, create, edit, prepare, approve, export, configure, pay, or manage;
- allowed data scopes;
- risk classification and protected guardrail metadata.

Organisation Admins cannot create new permission codes.

### Protected templates

Provide protected templates for:

- Organisation Admin;
- HR Admin;
- HR Officer;
- Accounts Officer;
- Payroll Officer;
- Approving Authority;
- Department Head;
- Branch Manager;
- Employee.

Templates define the maximum permissions and scopes available to their copies. Organisation Admins create custom roles by copying one template, renaming it, and selecting a subset of its permitted functions. Assigning multiple custom roles is the supported way to combine responsibilities from different templates.

Protected templates cannot be edited or deleted. Custom roles cannot exceed their source template ceiling.

### Default responsibility boundaries

- **Organisation Admin:** organisation structure, branches, departments, positions, users, roles, assignments, settings, audit, and organisation-wide visibility. Protected tenant and financial guardrails remain enforced.
- **HR Admin:** organisation-wide employee and HR-policy management, attendance oversight, leave, documents, departments, and reporting views; no financial powers unless separately assigned.
- **HR Officer:** non-financial employee records, attendance, leave, and documents within selected branches.
- **Payroll Officer:** prepare payroll, arrears, payslips, and financial-change proposals; cannot approve or record payment for the same transaction.
- **Approving Authority:** approve or reject financial proposals and payroll; cannot prepare or record payment for the same transaction.
- **Accounts Officer:** access approved payment totals and permitted masked payment data, process payroll/reimbursement payments, and record payment references; cannot change salary rules or approvals.
- **Department Head:** view assigned department members and relevant attendance/leave information; workflow recommendation authority may be added later but is not a default final approval in this scope.
- **Branch Manager:** operational employee/attendance/leave visibility and existing leave authority within assigned branches, plus geofence management for assigned branches; no branch-master, role, salary, payroll, or organisation-setting authority unless separately assigned.
- **Employee:** own self-service records and the scoped organisation chart; no management functions.

### Role assignments and scopes

A user may have several active effective-dated role assignments. Each assignment records:

- organisation, user, and custom/protected role;
- scope type `OWN`, `DEPARTMENT`, `SELECTED_BRANCHES`, or `ORGANISATION`;
- selected department and/or branches as applicable;
- effective-from, optional effective-to, status, and actor.

Effective permissions are the union of active assignments, limited by template ceilings and overridden by protected denials. An assignment referencing an inactive branch, inactive role, or expired date contributes no access.

No explicit custom deny system is added. Protected security rules always deny unsafe combinations; ordinary customization works by selecting fewer allowed permissions.

Every HR, payroll, accounts, approval, management, Branch Manager, Department Head, and employee account must link to exactly one active employee in the same organisation. The one exception is a protected unlinked bootstrap Organisation Admin created during onboarding. Only one such exception may exist per organisation; it cannot receive non-administrative operational roles, and the administration UI keeps a visible resolution warning until it is linked to an employee. Once linked, it cannot return to bootstrap status.

Every employee-linked account receives a protected own-record self-service baseline, regardless of its additional operational roles. HR, payroll, accounts, approval, and management users therefore retain their own payslips, leave, time, policies, claims, profile, and QR-linked mobile access. Management authority is still supplied only by explicit role assignments and scopes.

Branches, departments, positions, custom roles, and responsibility records cannot be deactivated while active assignments depend on them. Administrators must reassign occupants or close assignments with an effective date; destructive cascades are not used. A custom role cannot be deactivated until its assignments are ended or atomically replaced.

## Non-bypassable guardrails

1. Tenant isolation is enforced before any branch or permission evaluation.
2. Only Organisation Admins manage organisation roles, permissions, and assignments.
3. An Organisation Admin cannot remove or deactivate the final active Organisation Admin assignment.
4. Users cannot grant themselves access through ordinary account-edit endpoints.
5. Payroll preparers cannot approve the same run or financial proposal.
6. Approvers cannot record payment for the same transaction they approved.
7. Branch and department scopes are applied in database queries, not filtered only after loading.
8. Navigation visibility never substitutes for server authorization.
9. Inactive, expired, ambiguous, or unmapped assignments fail closed.
10. Every structural, role, assignment, transfer, import, and geofence change is audited.

## Session revocation and force re-login

Add a monotonically increasing access/session version to each user. Browser and device access tokens include that version. Authentication reloads the user and rejects tokens whose version is stale.

When a user’s effective role, permission, branch, department, employee link, or status changes, the same transaction increments the access version, revokes linked mobile devices/device-link attempts, and records the audit event. The next browser request receives an access-changed response and returns the user to sign-in. Mobile requires a new portal-confirmed link when its device session is revoked.

Changes to a role definition identify all active assignees, update their access versions, and revoke their sessions atomically with the role change.

A request-time effective-date reconciler activates scheduled transfers and role/responsibility assignments under row locks. The first request after an effective boundary applies the change once, increments affected access versions, and revokes sessions. A background scheduler is not introduced solely for this feature.

## Authorization architecture

Introduce permission middleware that accepts a permission code and a resource-scope resolver. It:

1. authenticates and reloads the user;
2. verifies tenant status and access version;
3. loads effective assignments and permissions;
4. resolves the target employee/branch/department/transaction inside the tenant;
5. enforces scope and protected guardrails;
6. rejects before the handler when unauthorized.

Existing single-role `requireRole` routes migrate to permission checks. `SUPER_ADMIN` remains a separate platform identity and does not inherit organisation permissions implicitly. Platform operations continue to use explicit platform authorization.

Custom permissions for a feature remain disabled until every backend route and frontend entry point for that feature has migrated from legacy `User.role` checks. A feature-level rollout gate prevents mixed legacy/custom authorization from overgranting access during migration.

Existing organisations remain in `LEGACY` access mode after schema deployment. Once their resolution queue is empty and every operational user has an employee/branch assignment, an Organisation Admin may run an access-readiness preview and explicitly activate `PERMISSIONS` mode. Activation revalidates the tenant under lock, cannot be reversed through the UI, audits the transition, and invalidates all tenant sessions. New organisations use the same bootstrap flow and activate after the protected bootstrap administrator is linked.

The frontend receives effective permission codes and safe scope summaries from `/auth/me`. Sidebar, command palette, routes, buttons, and queries use these values for user experience, while the API remains authoritative.

## Roles & Permissions page

Add an Organisation Admin-only page with:

### Role templates and custom roles

- protected template cards;
- copy-template action;
- custom role name, description, source template, status, and assignee count;
- deactivate protection when assignments exist, with impact preview.

### Function matrix

- functions grouped by application module;
- action columns such as View, Create, Edit, Prepare, Approve, Export, Configure, Pay, and Manage;
- disabled protected cells with explanations;
- scope ceiling and security-conflict warnings;
- clear unsaved-change and save states.

### Assignments

- search/select a linked organisation user;
- assign several roles;
- choose own, department, one branch, selected branches, or organisation scope where permitted;
- effective dates;
- impact preview listing users who will be forced to sign in again.

The impact copy states that browser users must sign in again and QR-only mobile users must relink their phone from the self-service portal.

### Access preview

Show the selected user’s effective permissions, menus, functions, branch/department scope, role sources, conflicts, and protected denials. This is explanatory only; authorization is calculated by the same server service used by middleware.

### Audit history

Show role, permission, scope, assignment, actor, timestamp, and before/after values without exposing credentials or tokens.

## Organisation Structure and Chart page

Add an Organisation Admin workspace for:

- Head Office and branch management;
- Excel template download, preview, and import;
- department management under each unit;
- position management, capacity, ordering, and reporting parent;
- current employee occupancy and transfer initiation;
- manual board/external leadership records with photos;
- chart preview.

The chart renders:

- Head Office leadership and manual board/external nodes;
- branches and their departments;
- occupied positions and current employees;
- employee photo, name, employee code, position, department, and branch;
- configured ordering and reporting connections.

The normal chart does not render unused capacity or vacant position cards. Organisation Admins may view staffing capacity in the management workspace, not the employee-facing chart.

## Chart visibility

- **Organisation Admin and explicitly organisation-scoped roles:** full chart permitted by their role.
- **Branch/department-scoped management roles:** Head Office leadership plus assigned branches/departments.
- **Employee:** Head Office leadership plus their own current branch.
- **Unassigned employee:** Head Office leadership and a clear request-to-HR state; no guessed branch access.
- **Platform Super Admin:** no routine employee chart access unless using an explicit audited tenant-support path defined separately.

Only work identity fields appear. Personal contact, salary, bank, statutory, identity, leave details, attendance details, and documents never appear on chart cards.

## Geofence ownership

Branch Managers may create and update geofence location/radius only for branches covered by their active Branch Manager assignments. Organisation Admins can view and override all branch geofences. Geofence changes are audited and do not grant access to branch identity or structure configuration.

The geofence service uses authoritative branch IDs. Employees check in against the geofence for their current effective primary branch.

No geofence model, service, or routes are currently implemented in this checkout. This project defines the permission and branch-scope contract, but exposes Branch Manager geofence controls only after the separately approved geofence implementation is present and passes the same tenant/scope middleware.

## Leave responsibility compatibility

This phase stores the organisational responsibilities required by the existing/default leave path:

- Employee requests route to the assigned Branch Manager.
- Branch Manager requests route to Senior Manager responsibility.
- Senior Manager requests route to General Manager responsibility.

The general customizable approval-workflow builder, top-level board escalation rules, delegation, and arbitrary multi-step approval configuration remain a separate future design. This phase must not hard-code pay-grade matching as approval authority.

## Migration and compatibility

1. Create new tables and nullable foreign keys without deleting existing fields.
2. Convert existing `OrganizationBranch` rows into typed active units; create or require resolution of exactly one Head Office.
3. Match employee branch code/name only when there is exactly one unambiguous tenant-local match.
4. Produce an Organisation Admin resolution queue for unmapped or ambiguous employees; do not guess.
5. Create departments and positions only from explicit administrator input, not arbitrary free-text values during migration.
6. Seed protected role templates and organisation role copies.
7. Convert each existing `User.role` into an equivalent effective role assignment and preserve `User.role` temporarily for compatibility.
8. Place existing unlinked operational users in a migration-resolution queue with access held fail-closed; preserve at most one unlinked Organisation Admin as the protected bootstrap exception.
9. Migrate route and UI authorization feature by feature to permission codes.
10. Keep legacy branch/department/designation display fields synchronized until all consumers use IDs.
11. Remove legacy authorization dependence only after parity tests and production migration verification.

Migration and schema initialization remain idempotent. MySQL identifiers stay below the 64-character limit. Existing approved payroll and historical service records are never rewritten.

## API groups

- `/org/structure/branches` — branch/Head Office management and import.
- `/org/structure/departments` — department management.
- `/org/structure/positions` — positions, capacity, reporting, and ordering.
- `/org/structure/assignments` — occupancy and transfers.
- `/org/structure/chart` — permission-scoped current chart.
- `/org/roles` — protected templates and custom roles.
- `/org/roles/:id/permissions` — allowed permission subset.
- `/org/role-assignments` — effective-dated user assignments and scopes.
- `/org/access-preview/:userId` — server-calculated effective access.

Every endpoint is tenant-scoped and uses permission middleware. IDs supplied by clients are reloaded and checked against the authenticated organisation before use.

## Validation and concurrency

- Unique organisation-scoped branch number/code and department code constraints.
- Position parent and ownership checks; cycle rejection.
- Positive capacity and transactionally locked occupancy-count enforcement.
- One non-overlapping primary employee assignment per date.
- Role/template ceiling validation on every permission write.
- Branch/department scope ownership validation on every role assignment.
- Last-Organisation-Admin protection under a database transaction and row lock.
- Role edits lock the role and active assignees before session-version changes.
- Transfers lock the employee, current assignment, destination capacity, and related role assignments.
- Excel apply rechecks uniqueness inside its transaction after preview.

## Audit events

Record at minimum:

- branch import preview/apply and branch create/update/deactivate;
- department and position create/update/deactivate/reparent;
- employee assignment and transfer scheduling/activation;
- board/manual-node changes and photo changes;
- custom role create/update/deactivate;
- permission matrix change;
- role assignment create/update/end;
- access-version/session revocation;
- geofence change;
- denied cross-tenant or cross-branch administrative attempts where existing security logging supports it.

Audit details include affected tenant, target IDs, actor, before/after safe values, effective dates, and affected user count. Never store tokens, passwords, MFA secrets, QR secrets, complete bank account numbers, or private document contents.

## Security and privacy

- Server-enforced tenant and scope checks protect every read and mutation.
- Permission and chart APIs select only allowed attributes.
- Excel and photo uploads are size/type limited and validated from content, not filename alone.
- Spreadsheet formulas, macros, external links, and unsupported worksheets are rejected or ignored safely.
- Manual node text is rendered as text; no raw HTML.
- Access changes invalidate existing sessions immediately.
- Employee photographs are authenticated tenant assets, not public predictable URLs.
- Role changes cannot bypass maker-checker constraints.
- Bulk operations are transactional and auditable.
- Error responses do not reveal whether foreign-tenant IDs exist.

## Testing strategy

### Model and service tests

- tenant-local uniqueness and foreign-key ownership;
- position cycle and capacity validation;
- non-overlapping assignments and effective-date selection;
- conservative legacy mapping;
- template ceilings and multi-role permission union;
- branch/department/own scopes;
- last-Organisation-Admin and self-escalation protection;
- maker-checker overrides;
- access-version invalidation and mobile revocation;
- chart visibility and field allowlist;
- Excel validation, duplicates, formula rejection, dry-run, atomic apply;
- transfer concurrency and compensation-approval linkage.
- atomic transfer-bundle approval, rejection, and late activation;
- required operational employee links and the one bootstrap Organisation Admin exception.

### API tests

- cross-tenant and cross-branch IDOR attempts;
- Organisation Admin management paths;
- Branch Manager geofence-only configuration within assigned branches;
- HR, payroll, approval, accounts, department, and employee defaults;
- custom role subsets and selected-branch assignments;
- forced re-login after role edits;
- chart results for full, branch, department, employee, and unassigned scopes.

### Frontend tests and verification

- permission-driven navigation and action visibility;
- role matrix protected states and conflict messages;
- assignment impact preview;
- responsive structure/chart views;
- accessible tree/list alternative, keyboard navigation, labels, focus, and upload errors;
- Excel preview/error presentation;
- current occupants only, with no empty capacity cards;
- real authenticated browser checks at desktop and narrow widths.

### Mobile verification

- employee chart shows own branch plus Head Office leadership;
- transfer/session invalidation requires relinking as designed;
- no salary or private fields appear in workplace data;
- physical-device checks for long names, photographs, and large text.

## Rollout

1. Ship additive schema and seed permission catalogue/templates.
2. Migrate branches and legacy users conservatively; expose resolution queues.
3. Add organisation structure administration and branch Excel import.
4. Add departments, positions, occupancy, chart, and transfers.
5. Add custom roles, permission matrix, assignments, access preview, and session versioning.
6. Migrate backend routes and frontend navigation from legacy role checks to permissions in bounded groups.
7. Enable scoped employee/mobile chart after access parity tests.
8. Verify on production-like MySQL with existing tenant data before removing legacy compatibility paths.

## Success criteria

- Every active employee has one authoritative current branch assignment or appears in an explicit resolution queue.
- Branch-scoped users cannot read or mutate another branch’s operational records.
- Organisation Admins can create branches manually or import a clean Excel workbook atomically.
- Departments, positions, capacity, reporting, and current occupancy produce the chart without duplicate entry.
- Employees see only their branch and Head Office leadership.
- Organisation Admins can create safe custom roles, assign several roles/scopes, preview effective access, and force affected users to re-authenticate on change.
- Payroll preparation, approval, and payment remain separated regardless of combined roles.
- Transfers preserve history and never edit published government pay amounts.
- Existing payroll history and service records remain intact.
- Full backend tests, frontend build/tests, mobile typecheck/tests, MySQL schema initialization, and authenticated runtime checks pass before release.

