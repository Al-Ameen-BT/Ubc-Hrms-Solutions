# Employee Self-Service Portal — Design

Date: 2026-10-28
Status: Draft for approval
Scope: React console (`frontend/`) + Express API (`src/`)

## Intent

Employees today have a login but no workspace: `EMPLOYEE` users can only see
"My account", and every payroll/leave/employee endpoint rejects them. This
feature gives an employee a private, read-mostly workspace for their own pay,
leave, calendar, service book, loans, documents and bank details, plus the
ability to request leave that lands in the organisation's existing approval
queue.

The bank's own policy must be acknowledged before the workspace opens. This is
a deliberate access gate: payroll and personal data are sensitive, and the bank
needs a recorded acknowledgement of its acceptable-use / data-privacy policy.

## Goals

- An `EMPLOYEE` user can sign in and immediately reach a self-service portal.
- They can view every approved/paid payslip and download its PDF.
- They can see leave balances, file leave, track status, and cancel a pending
  request.
- They can see a calendar containing only their own leave and the bank's
  published holidays.
- They can read their own service book, loans/advances, documents and bank
  details.
- They can never see another employee's data, or another organisation's data.
- Until the current policy version is acknowledged, the portal is blocked with
  a clear acknowledgement screen.

## Non-goals

- No employee editing of bank details, documents, loans or service book.
  Those remain HR-controlled.
- No new leave approval engine. HR / Org Admin approvals keep using the
  existing Leave screen.
- No employee access to payroll runs, registers, other employees, or any
  org-wide list.
- No changes to the legacy vanilla SPA (`public/js`). The API still works for
  any client, but only the React console gets screens.
- No payslips from `PROCESSED` (draft) or `REJECTED` runs.
- No notification email when leave is decided (existing behaviour unchanged).

## Decisions made by the human partner

- **Holidays:** add a simple per-organisation holiday list managed in the
  console; the employee calendar shows own leave + holidays + weekends.
- **Policy content:** each organisation writes its own policy. The Org Admin
  edits title and body; the version increments on save.
- **Payslip scope:** only `APPROVED` and `PAID` payroll runs.
- **Frontend:** React console only.

## Decisions made by the builder (flagged for review)

- Employee screens live under a distinct `/my/*` prefix. The existing staff
  `/leave` screen is untouched, and an `EMPLOYEE` visiting `/` is redirected to
  `/my`.
- If an organisation has never saved a policy, a platform-written default
  policy (version 0) is shown so the portal is usable on day one. Saving the
  org's own policy creates version 1 and re-prompts every employee.
- Policy rows are append-only, one row per version. The current policy is the
  highest version, and a historical acknowledgement still resolves to the exact
  text that was accepted. A save that changes neither title nor body does not
  create a version and does not re-prompt.
- Acknowledgement is per user **and** per version. Bumping the policy version
  re-prompts everyone.
- Employees may cancel only `PENDING` requests themselves. HR keeps the ability
  to cancel approved leave through the existing screen.
- The backend gate is authoritative; the frontend redirect is a convenience.
- Holidays are soft-deleted (`INACTIVE`) like other master data.
- `/me/*` is restricted to the `EMPLOYEE` role only, matching the request. Staff
  linked to employee records keep using the existing HR screens.
- **Linking a user to an employee record is part of this work.** Today the
  Users screen cannot set `employeeId`, and `POST` does not verify the employee
  belongs to the org. Without this, the portal is unusable and mis-linking is a
  cross-tenant risk.
- A `HR_ADMIN` gets a dedicated Holidays page (`/holidays`); the policy editor
  stays in Org Admin Settings. Settings itself remains `ORG_ADMIN`-only.
- An employee with no linked record sees a clear "not linked — contact HR"
  screen, not the policy gate. They may still acknowledge the policy.

## Data model

Three new tables. All are created automatically by `sequelize.sync()` on a new
database; existing deployments get them on the next sync/init. SQL reference
blocks are added to `src/sql/schema.sql`.

### `holiday`

| Column | Type | Notes |
| --- | --- | --- |
| id | INT UNSIGNED PK | |
| organization_id | INT UNSIGNED | tenant |
| date | DATEONLY | the holiday date |
| name | VARCHAR(255) | e.g. "Onam" |
| remarks | VARCHAR(500) NULL | optional |
| status | ENUM('ACTIVE','INACTIVE') | soft delete |
| created_at / updated_at | DATETIME | |

Unique index on `(organization_id, date)`.

### `employee_portal_policy`

One row per organisation **per version** (append-only history).

| Column | Type | Notes |
| --- | --- | --- |
| id | INT UNSIGNED PK | |
| organization_id | INT UNSIGNED | tenant |
| version | INT UNSIGNED | starts at 1 when an admin first saves |
| title | VARCHAR(255) | |
| body | TEXT | plain text, line breaks preserved |
| updated_by | INT UNSIGNED NULL | user id |
| created_at / updated_at | DATETIME | |

Unique index on `(organization_id, version)`. Current policy = highest version
for the org. No rows = platform default policy, version 0. Saving never updates
an old row; it inserts the next version (only when title or body changed).

### `employee_policy_acknowledgement`

| Column | Type | Notes |
| --- | --- | --- |
| id | INT UNSIGNED PK | |
| user_id | INT UNSIGNED | unique with version |
| employee_id | INT UNSIGNED NULL | copied from the user at the time |
| organization_id | INT UNSIGNED | tenant |
| policy_version | INT UNSIGNED | the version acknowledged |
| acknowledged_at | DATETIME | |
| ip_address | VARCHAR(64) NULL | request IP |

Unique index on `(user_id, policy_version)`.

Associations: `User.hasMany(EmployeePolicyAcknowledgement)`,
`Organization.hasMany(Holiday)`, `Organization.hasMany(EmployeePortalPolicy)`,
`EmployeePortalPolicy.hasMany(EmployeePolicyAcknowledgement, { foreignKey: 'policyVersion', sourceKey: 'version' })`
is **not** used — acknowledgements store the scalar version and the API joins on
it explicitly.

## Backend

### Shared pieces

- `middleware/auth.js` — add `employeeId` to `req.user` (currently omitted).
- `services/employeePortalPolicy.js` — default policy text/version, load current
  policy for an org, append a new version (only when title/body changed),
  acknowledgement lookup/record.
- `services/serviceBookView.js` — extract the existing `/employees/:id/service-book`
  assembly so HR and self-service share one implementation.
- `middleware/employeeSelfService.js` — `requireEmployee`, `loadOwnEmployee`,
  `requirePolicyAcknowledged`.
- `routes/orgUsers.js` / `services/userAdmin.js` — accept `employeeId` on create
  **and** update. Validate that the employee exists, belongs to the same
  organisation, and is not already linked to another active user. Clearing the
  link (`employeeId: null`) is allowed. Audit the link change.
- `middleware/auth.js` — expose `employeeId`; `/me` resolves the employee with
  **both** `id` and `organizationId` (never `id` alone).

### Self-service router — `/api/v1/me`

All routes: `authenticate` + `requireEmployee`. Every query derives the employee
from `req.user.employeeId` **and** `req.user.organizationId`, never from a URL
parameter. `GET /me/context` and the two policy routes always answer `200`; every
other route returns `409 { code: 'EMPLOYEE_NOT_LINKED' }` when the account has no
valid link, or `403 { code: 'POLICY_NOT_ACKNOWLEDGED', data: { policy } }` when
the current policy version has not been acknowledged.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/me/context` | One-call bootstrap: `{ hasEmployeeLink, employee?, policy, acknowledgement }`. Always `200`, including for unlinked accounts. |
| GET | `/me/policy` | Current policy + acknowledgement state. Always allowed. |
| POST | `/me/policy/acknowledge` | `{ version }`; must match current version; idempotent. Audited. |
| GET | `/me/profile` | Own employee record (personal, posting, contact, PAN/Aadhaar/PF/UAN, joined post/scale/stage). |
| GET | `/me/payslips` | Frozen lines joined to runs where run status is `APPROVED` or `PAID`. Newest first. |
| GET | `/me/payslips/:lineId` | Full frozen `payslipJson`. 404 unless the line belongs to the caller and run is approved/paid. |
| GET | `/me/payslips/:lineId/pdf` | Payslip PDF, same ownership + status checks. |
| GET | `/me/leave/types` | Active leave types for own org. |
| GET | `/me/leave/balances?year=` | Own balances (defaults to org year label). |
| GET | `/me/leave/applications` | Own applications, newest first. |
| POST | `/me/leave/applications` | `{ leaveTypeId, fromDate, toDate, reason }` via existing `leave.applyLeave`. Audited. |
| POST | `/me/leave/applications/:id/cancel` | Own **PENDING** only, via `leave.cancelLeave`. Audited. |
| GET | `/me/calendar?year=&month=` | Own leave applications overlapping the month + active holidays in the month. |
| GET | `/me/service-book` | Own service book using the extracted service. |
| GET | `/me/loans` | Own festival advances, overdrafts, recurring deposits, LIC, housing, vehicle loans, each with its live schedule status. Read-only. |
| GET | `/me/documents` | Own document metadata (no bytes). |
| GET | `/me/documents/:id/file` | Own document bytes (existing `documents.get`/`send`). |
| GET | `/me/bank-accounts` | Own bank accounts + salary credit account id. Note: the employee master's legacy single-account fields are also returned in `/me/profile`. |

Payroll query: `PayrollRunLine.findAll({ where: { employeeId }, include: [{ model: PayrollRun, where: { status: { [Op.in]: ['APPROVED','PAID'] } } }] })`.
Draft lines never leave the server.

### Organisation admin routers

Policy — `ORG_ADMIN` only:

- `GET /org/employee-portal/policy` → current policy (or default) with version
  and a small version history (`version`, `updatedAt`, `updatedBy`).
- `PUT /org/employee-portal/policy` → `{ title, body }`; trims, validates
  non-empty. If unchanged, returns the current version and inserts nothing. If
  changed, inserts the next version, audits, returns the new version. Old
  versions stay queryable for acknowledgement evidence.

An acknowledgement response joins the version the employee accepted to the
policy row of that version, so the UI can show exactly what was agreed to even
after the bank edits the policy.

Holidays — `ORG_ADMIN` and `HR_ADMIN`:

- `GET /org/holidays?year=`
- `POST /org/holidays` → `{ date, name, remarks }`
- `PUT /org/holidays/:id` → `{ date, name, remarks }`
- `POST /org/holidays/:id/status` → `{ status: 'ACTIVE'|'INACTIVE' }` (soft delete)
- Duplicate date in the same org returns 409.
- All audited.

### Error shape

Consistent with the rest of the API:
`{ status: 'error', code?: string, message: string, data?: object }`.

## Frontend (React)

### API layer

`frontend/src/api/employee.js`:

- `employeeApi.context/policy/acknowledge/profile`
- `payslips`, `payslip(lineId)`, `payslipPdfUrl(lineId)`
- `leaveTypes`, `leaveBalances(year)`, `leaveApplications`, `applyLeave`,
  `cancelLeave`
- `calendar(year, month)`, `serviceBook`, `loans`, `documents`, `documentFileUrl`,
  `bankAccounts`

Org admin additions in `extended.js`: `portalPolicyApi` and `holidayApi`.

### Routing / shell

- `App.jsx`: adds employee routes inside `AppShell`:
  `/payslips`, `/leave`, `/calendar`, `/service-book`, `/loans`, `/documents`,
  `/bank-details`, plus `/policy` (full page, no shell).
- `HomeRoute` stays: `EMPLOYEE` → `EmployeePortalPage`.
- A small `EmployeeGuard` wraps employee routes: if `user.role !== 'EMPLOYEE'`
  redirect to `/`; if the policy is unacknowledged redirect to `/policy`.
  `/policy` and `/account` remain reachable so the employee can read/sign out.
  Staff visiting employee routes are redirected to `/`.
- `Sidebar.jsx`: employee group becomes:
  My Dashboard, My Payslips, Leave, Calendar, Service Book, Loans, Documents,
  Bank Details, My Account.
- The policy acknowledgement is fetched once in `AuthContext` for `EMPLOYEE`
  users (`context` query) and exposed as `policy` + `refreshPolicy`, so the
  guard does not flash. Failure to fetch shows a retry state, not an open gate.

### Screens

1. **Dashboard** (`EmployeePortalPage`) — greeting, employee code/designation,
   latest net pay, leave balance total, next approved leave, policy status,
   quick links. Uses `/me/context` + `/me/leave/balances` + `/me/payslips`.
2. **Policy** (`EmployeePolicyPage`) — full policy text, checkbox "I have read
   and agree", disabled confirm until checked, sign-out link. On success,
   refresh context and go to `/`.
3. **Payslips** (`EmployeePayslipsPage`) — table of year/month, gross,
   deductions, net, run status; expand a row to show earnings/deductions
   breakdown from `/me/payslips/:lineId`; download PDF button.
4. **Leave** (`EmployeeLeavePage`) — balances table, "Apply for leave" modal
   (type, from, to, reason; shows available days), application history with
   status badges and Cancel on `PENDING`.
5. **Calendar** (`EmployeeCalendarPage`) — month grid, prev/next, weekends
   shaded, holidays and own leave labelled; list of that month's holidays.
6. **Service Book** (`EmployeeServiceBookPage`) — chronological timeline with
   event type, date, order reference, pay change and attached-document link.
7. **Loans** (`EmployeeLoansPage`) — cards per loan type with amount, EMI,
   start/end/closure, repaid/outstanding; empty state per section.
8. **Documents** (`EmployeeDocumentsPage`) — metadata list, Open button via
   authenticated blob URL, empty state.
9. **Bank Details** (`EmployeeBankDetailsPage`) — salary credit account,
   account list, and the legacy master account fields; read-only notice.
10. **Settings → Employee portal** (Org Admin) — policy editor (title, body,
    current version, save bumps + warns), holiday list with add/edit/
    deactivate.

All screens follow existing UI primitives (`Card`, `Table`, `Button`, `Input`,
`Modal`, `Badge`, `EmptyState`, `StatLedger`, `useToast`,
`@tanstack/react-query`) and existing CSS classes. No new design system.

## Security

- Tenant + ownership enforced server-side on every route; no `:employeeId`
  parameter exists on `/me`.
- `EMPLOYEE` only; `requireRole` runs before any handler.
- Payslip/document/bank-account lookups include `employeeId` in the `WHERE`.
- Policy acknowledgement compares the latest version; acknowledging an old
  version is rejected.
- Downloads use the existing authenticated blob helpers (`downloadFile`,
  `openFile`), never public URLs.
- Every mutation is audited with the acting user and org.
- No sensitive bytes (document base64, `payslipJson`) are included in list
  endpoints.

## Rollout / compatibility

- New tables are additive. No existing column changes, so `src/scripts/migrate.js`
  needs no new steps.
- `schema.sql` gains the three tables for reference.
- Existing HR screens are untouched except the extracted service-book helper
  (same response shape).
- No new dependencies.

## Verification

1. `npm run db:init` (or existing dev DB sync) creates the new tables.
2. Backend smoke via `curl` with an `EMPLOYEE` account linked to an employee:
   - `/me/context` allowed before acknowledgement;
   - every other `/me` route returns `403 POLICY_NOT_ACKNOWLEDGED`;
   - acknowledge, then routes return only that employee's rows;
   - a second employee's line ids return 404;
   - draft `PROCESSED` runs absent from `/me/payslips`;
   - apply leave → appears in HR Leave screen for the same employee;
   - cancel pending → status `CANCELLED`; cancel non-owned → 404.
3. Org Admin: save policy → version increments; add holiday → appears in the
   employee calendar; deactivate → disappears.
4. `cd frontend && npm run build` passes (TypeScript project build + Vite).
5. Manual browser pass: login as employee, policy gate, dashboard, payslip
   download, leave apply/cancel, calendar, service book, loans, documents,
   bank details, sign out; staff routes redirect.
