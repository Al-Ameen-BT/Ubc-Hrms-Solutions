# Employee self-service and reimbursements — design

Date: 2026-11-10
Status: Approved by the user
Scope: React console, Express API, additive database tables

## Intent

An employee signs in to the bank's existing login and handles routine personal work: view finalized pay, request leave, acknowledge bank policies, see a calendar and workplace directory, record arrival/departure, and submit reimbursable expenses. Staff retain approval and payroll controls. The employee never chooses an employee ID or organisation ID in an API request.

## Existing foundation and gaps

- `EMPLOYEE` is an existing account role, with login, password change/reset, MFA, and an employee dashboard. People is the existing staff and account provisioning destination.
- The dashboard currently asks a staff-only leave endpoint for balances, so that call fails for an employee. Its service-book endpoint does enforce own-record access and includes only approved/paid payslips.
- Existing leave types, balances, applications, and staff decision service can be reused. Monthly attendance stores loss-of-pay days only; it cannot represent daily check-in/out.
- Employee posting uses free-text branch, department, designation, plus a post/cadre reference. There is no manager relationship and branch records are not linked to employees.
- User creation accepts `employeeId` server-side, but the People account form cannot select one; account updates cannot change the link; duplicate links are not prevented.

## Approaches

1. **Chosen: dedicated `/me` endpoints.** Each request derives the employee and tenant from the authenticated account; existing staff approval services remain in place. This adds a small self-service router and makes ownership checks straightforward.
2. **Alternative: extend every staff endpoint.** Fewer new URLs but each existing leave, attendance, payslip, and employee route needs a different ownership rule. A missed check could expose another employee's information.

The user chose approach 1. React and Express remain the platform; no separate app, auth system, or new dependency.

## Boundaries and defaults for review

- Employees see only their own approved/paid frozen payslips. Draft payroll and live salary previews remain staff-only. An authenticated PDF download uses the frozen payslip and its run year.
- Employees can request leave and cancel only their own pending requests. The existing leave approvers decide them. Leave balance and day precision keep the existing rules.
- Organisation admins publish plain-text policies as append-only versions. Employees can read and acknowledge each current version; the record keeps user, version, timestamp, and policy text through the version row. A new version becomes pending again. An unpublished policy shows an empty state; access to pay and leave is not blocked by an unpublished or unacknowledged policy. Acknowledgement is explicit, never inferred from opening the page.
- Organisation admins and HR admins maintain dated holidays. The calendar shows bank holidays, the employee's leave requests and daily check-ins; weekends are marked in the UI. No public or cross-bank data.
- The workplace tree groups active employees by branch, department, and designation/post. It exposes only name, employee code, branch, department, designation, and post title. It does not infer a reporting manager or expose account permissions, salary, contact, bank, statutory ID, or leave data. Missing posting fields appear as “Unassigned.”
- Check-in/out is one employee-owned record per bank-local day. Server timestamps are authoritative; repeated check-in or checkout returns a conflict, and checkout requires an open check-in. This is a time log, not a payroll/Loss-of-Pay calculation. HR can inspect and correct a missed entry with an audited reason; payroll officers continue using existing monthly LOP reconciliation.
- Reimbursement claims have expense date, category, business purpose, whole-rupee amount, and receipt (PDF/image, max 5 MB). Employees can submit, see their status, and withdraw pending claims. Accounts/payroll officers review and prepare; an approving authority or org admin approves/rejects, with the submitter and preparer unable to approve their own claim. Accounts marks an approved claim paid with reference/date; payment is separate from payroll to avoid unapproved pay changes or double payment. No automatic payslip earning is added.
- Existing ordinary monetary rounding remains nearest whole rupee, half-up; percentages and day fractions retain precision. Claim entry must be a positive whole-rupee amount. No floating money is stored or displayed.
- ORG_ADMIN creates and links an employee account in People, including direct-pay employees. The current `createAccount` direct-pay exclusion is removed. Link validation requires the same tenant and prevents two active accounts linking to one employee. Staff can change or clear an existing link with audit. Existing login/password/MFA flows are reused.

## Data and API

New additive tables: `employee_policy` (organisation, version, title, body, author), `employee_policy_acknowledgement` (policy, user, employee, organisation, timestamp), `organization_holiday` (organisation, date, name, active), `employee_time_entry` (employee, organisation, local date, check-in/out UTC timestamps, correction actor/reason), `expense_claim` (employee, organisation, expense date, category, purpose, whole-rupee amount, status, preparation/decision/payment actors and dates, reason/reference), and `expense_receipt` (claim, MIME, bytes, size, SHA-256). Unique keys cover policy version, acknowledgement per user/policy, active holiday date, and time entry per employee/date. New tables are created additively by the established database initialization/migration path; no existing rows are rewritten. Receipt bytes use the existing validated document-upload pattern.

`/api/v1/me` is `authenticate` + `EMPLOYEE` only. A shared loader resolves an active Employee with both `id = req.user.employeeId` and `organizationId = req.user.organizationId`; a missing/invalid link returns a clear 409, except a small context endpoint that explains the issue. All ID-based child lookups include the resolved employee or organisation in the query and return 404 for non-owned records. The account cannot send identity in the body to override this.

| Area | Employee endpoints | Staff endpoints |
| --- | --- | --- |
| Home/pay | `GET /me/context`, `GET /me/payslips`, `GET /me/payslips/:id/pdf` | Existing payroll run approval/payment |
| Leave | `GET /me/leave/types`, `/balances`, `/applications`; `POST /me/leave/applications`, `/applications/:id/cancel` | Existing `/leave-applications/:id/decide` |
| Policy | `GET /me/policy`, `POST /me/policy/acknowledge` | `GET/POST /org/employee-policy` (new version on changed content) |
| Calendar | `GET /me/calendar?year=&month=` | `GET/POST/PUT /org/holidays` with status change |
| Workplace | `GET /me/workplace` | Existing employee posting editor |
| Time | `GET /me/time?month=`, `POST /me/time/check-in`, `POST /me/time/check-out` | `GET /org/time`, `PUT /org/time/:id/correct` with reason |
| Expenses | `GET/POST /me/expenses`, `GET /me/expenses/:id/receipt`, `POST /me/expenses/:id/withdraw` | `GET /org/expenses`, `POST /org/expenses/:id/prepare`, `/decide`, `/pay`; authenticated receipt download |

All writes validate input, use the existing audit service, and return existing API error shapes. Claim status transitions are `SUBMITTED → PREPARED → APPROVED/REJECTED → PAID`, with pending withdrawal allowed before approval. “Prepared” is a review step, not permission to pay. The approving endpoint checks separate actors and role on the server. Receipt data never appears in lists. Policy versions are immutable; unchanged saves do not increment. Time correction retains the original timestamps in an audit record (and correction reason) before update.

## React experience

The existing `/` employee dashboard becomes a compact starting point with links and current states. Add employee-only sections for Payslips, Leave, Calendar, Policies, Expenses, Workplace, and Time in the sidebar and route guard; `/account` remains the existing profile/password/MFA destination. Staff navigation remains unchanged. Reuse `Card`, `Table`, `Badge`, `Button`, `Input`, `Modal`, `EmptyState`, React Query, existing money/date formatting, and authenticated `downloadFile`/`openFile` helpers. The workplace view is a grouped directory, not a drawn reporting chart. The time view clearly labels the server-recorded local date and timestamps. The expense form previews the whole-rupee requested amount and receipt before submission.

People's account form gets employee search/selection and an edit-link action so a new employee can actually sign in. It must show a clear unlinked state. The admin policy/holiday/time/expense actions sit within existing organisation navigation, with role-specific buttons and server-enforced permissions. Narrow layouts stack sections without hiding the primary action or status.

## Verification and rollout

- Focused API tests cover tenant and employee ownership, unlinked login, finalized-only pay, leave submit/cancel, policy version acknowledgement, check-in concurrency/state, receipt access, claim actor separation/status transitions, whole-rupee validation, and staff-only management.
- Build the React app, run relevant existing tests and version check, and inspect the employee and staff flows in a browser if the local UI is available. Source/build checks alone will not be reported as live deployment verification.
- No production data reset, seed, schema alteration, or deployment is part of implementation. A new-table migration needs the normal operator backup and rollout process before production use.

## Deliberately omitted

No GPS/geofencing, biometric clock, shift/late-pay engine, automatic reimbursement payroll injection, manager hierarchy, employee colleague contact directory, or policy access lock. Those need separate rules and data that this repository does not currently have.
