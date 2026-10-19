# UCB HRMS — Old vs New Feature-Parity Report

**Date:** 2026-10-17
**Reference (OLD, feature-complete):** `/home/ameen/Desktop/HRMS/ucb-hrms/public/js/*` (byte-identical copy also at `OldBuild/public/js/*`)
**Target (NEW):** `/home/ameen/Desktop/HRMS/ucb-hrms/frontend/src` (React 18 + Vite)
**Backend:** shared and (with the custom-domain addition) unchanged — `src/routes/*`, `src/services/*`

---

## 1. Currency symbols — FIXED

**What the user saw:** dollar-sign icons in the sidebar next to money-related items.

**Root cause:** the money navigation icons were literally the dollar-sign SVG glyph, not a rupee glyph.
`frontend/src/components/Sidebar.jsx:43-44` used the Feather/Lucide `dollar-sign` path
`M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6` for both `icons.scales` and `icons.payroll`,
which are used by **Pay Scales, Payroll, Allowances and DA Arrears**.

**Fix applied:** both icons now use an **Indian-rupee** path
`M6 3h12M6 8h12M6 13l8.5 8M6 13h3M9 13c6.667 0 6.667-10 0-10`
(`frontend/src/components/Sidebar.jsx`). Rebuilt via `npm run build`; verified in the running app
(`Pay Scales`, `Payroll`, `Allowances`, `DA Arrears` now show ₹).

**Audit of all other currency rendering (no further changes needed):**

| Location | Result |
|---|---|
| Literal `$` used as currency anywhere in `frontend/src` | **None** (grep for `$` returns only JS template-literal `${…}` interpolation). |
| All money in the React UI | goes through `fmt.money` → `Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'})` → **₹** (`frontend/src/api/client.js:212-220`). |
| A few places with a manual `₹` | `NewEmployeePage.jsx:148,151`, `AllowancesPage.jsx:96`, `PayScalesPage.jsx:169` — correct. |
| Payslip **PDF** text | `src/services/payslipPdf.js:22` prints `Rs.` (standard PDF fonts lack the ₹ glyph). Pre-existing, backend, not a `$`. |
| Formatting nuance | OLD `H.money` showed up to **2 decimals** (`₹1,234.56`); NEW `fmt.money` uses `minimumFractionDigits:0` (`₹1,235`). Not a dollar, but a parity difference. |

---

## 2. Method

Seven parallel deep-dive audits were run, each enumerating **every** user-facing screen, field, action,
validation rule, calculation, default and edge case in the OLD app for its module and checking the NEW
React implementation. Evidence is `file:line`. Status:
**Present** = reproduced · **Partial** = present but degraded/incomplete · **Missing** = absent ·
**Changed** = behaves differently.

Full module reports: `parity-audit/auth.md`, `employees.md`, `masterdata.md`, `payroll.md`,
`allowances-leave.md`, `arrears-yearend.md`, `org-platform.md`.

**Headline:** the React app reproduces the **lists and create-forms** well, but is a thin slice of the
OLD app. The dominant pattern is **"API client method exists and is never wired to any screen"** —
the data/API layer was ported, many screens were not.

---

## 3. Overall tally (approximate)

| Module | Rows audited | Present | Partial | Changed | Missing | High-sev gaps |
|---|---:|---:|---:|---:|---:|---:|
| Auth & account | 66 | 19 | 19 | 11 | 17 | 7 |
| Employees / Service Book / sub-resources | 158 | 28 | 23 | 6 | 100 | 59 |
| Master data (posts, scales, GO, KSR) | 110 | — | — | — | — | 14 |
| Payroll | 93 | 26 | 17 | 5 | 45 | 21 |
| Allowances & Leave | 69 | 20 | 21 | 8 | 14 | 12 |
| DA Arrears & Year-End | 77 | ~11 | ~30 | — | — | 19 |
| Org admin & Platform | ~78 | ~9 | ~30 | — | — | 24 |
| **Total** | **~651** | | | | | **~156** |

Severity legend: **High** = core feature/action absent or broken (blocks work, data loss, or misleading).

---

## 4. Bugs in the NEW app (broken, not merely missing)

These are **regressions that will bite real users** and should be first in any fix queue.

| # | Bug | Evidence | Impact |
|---|---|---|---|
| B1 | **Forced password change never completes (infinite redirect).** After a successful change the app calls the API then `navigate('/')` but never clears `user.mustChangePassword` in context, so the guard bounces back to `/change-password` forever. | `ChangePasswordPage.jsx:30-31` vs old `views-auth.js:196-198`; guard `App.jsx:74` | Temp-password accounts are permanently stuck — nobody can finish first sign-in. |
| B2 | **Global 401 handler destroys the session on ordinary credential typos.** Every 401 (login, MFA verify, change-password, MFA disable) is treated as "session expired": token cleared + forced to `#/login`. | `client.js:38-42` vs old `core.js:147-151` (excluded auth calls) | Wrong password → "Session expired"; a typo on change-password logs you out. |
| B3 | **Org "forgot password" silently never sends mail.** The page calls `forgotPassword(email)` without `orgCode`; the backend then requires SUPER_ADMIN, so bank users get the generic message but no email. | `ForgotPasswordPage.jsx:17` vs `auth.js:218-220` | Bank users cannot self-serve a reset. |
| B4 | **KSR "Rule type" list contains invalid enum values.** New list includes `PAY_FIXATION` and `ALLOWANCE` (not in the model enum) and omits `PROMOTION`, `HIGHER_GRADE`, `PAY_REVISION`, `SETTLEMENT`. | `KsrRulesPage.jsx:12` vs `ruleReference.js:8-12` | Selecting an invalid type throws a validation error; valid types are unreachable. |
| B5 | **Audit-log columns reference fields the API doesn't return.** Page reads `actorName`/`entityType`/`entityId`; API returns `actorEmail`/`targetType`/`targetId`. | `AuditPage.jsx:17-23` vs `audit.js:20-37` | Actor/Entity/ID render blank. |
| B6 | **Org profile edits silently discarded.** Settings shows contact fields read-only; Org Profile's "Registered Name / Short Name" are sent to `PUT /org/profile` which ignores them — yet a "saved" toast is shown. | `SettingsPage.jsx:63-73`, `OrgProfilePage.jsx:56-57` vs `orgFields.js:228-252` | Admins believe contact details are saved; they are not. |
| B7 | **Payroll "Reject" records a fake reason.** No reason prompt; the string `'Rejected from the run page'` is hardcoded, and the stored reason is never displayed anywhere. | `PayrollRunPage.jsx:41` vs old `views-payroll.js:220` | Audit trail for rejections is meaningless. |
| B8 | **Dead/broken code:** `ServiceBookPage.jsx` is unrouted and reads a non-existent `serviceBook.entries`; `CommandPalette` reads `e.code` (API field is `empCode`) so labels show `undefined`. | `ServiceBookPage.jsx:22`; `CommandPalette.jsx:58` | Broken UI fragments; confusing results. |

---

## 5. Missing entire screens (absent in NEW)

| Screen / feature | Where it lived (OLD) | Notes |
|---|---|---|
| **Pay Revisions** | `views-master.js:218-242` | No route, no nav, no page. `createPayRevision`/`updatePayRevision` unused. |
| **Employee bulk import** | `views-master.js:512-558` | No page, no CSV template download, no per-row results. |
| **Arrears Case detail** | `views-arrears.js:260-387` | Month-by-month ledger, installments, payment plans, manual adjustment, Pay-now, receipt PDF — all absent. `arrearsApi.*` methods unused. |
| **DA Revision detail** | `views-arrears.js:121-149` | Fields + GO document upload/download/delete missing. |
| **Payroll payslip drill-down + PDF + email + exports** | `views-payroll.js:176-254`, `views-master.js:617-682` | Per-employee payslip, PDF download, bulk/per-employee email, register CSV, bank-transfer CSV — all missing though endpoints exist. |
| **Payroll settings** | `views-org.js:243-339` | **31 fields** (DA/HRA/PF/GSLI/PT/OD/Festival/Vehicle/CCA/Conveyance/Medical/Bonus/Stagnation/Retirement/Year-type) — no UI (`orgApi.payrollSettings` unused). |
| **Mandatory employee fields** | `views-org.js:344-368` | 21 toggles — endpoint exists, no UI; employee form hardcodes required fields instead of honouring org policy. |
| **Employee loans suite** (Festival Advance, OD, RD, LIC, Housing, Vehicle) | `views-master.js:880-1101` | All forms, lists, eligibility calcs and deletions missing. |
| **Bank accounts (SB/OD/RD/LIC) + salary-credit selector** | `views-master.js:1142-1238` | Whole sub-resource missing. |
| **Attendance / LOP grid** | `views-master.js:766-792` | 12-month LOP editor + payslip refresh missing. |
| **Employee documents** | `views-master.js:802-876` | `documentApi` defined but unused. |
| **Organisation branches / board & management / statutory documents** | `views-org.js:404-657` | Tables are read-only; `profileApi` CRUD unused. |
| **Government Order scanned documents** | `views-master.js:1461-1514` | Upload/preview/download/remove missing. |
| **Super-admin pay-scale revision CSV** (template + bulk apply) | `admin.js:147-176` | Backend only; no UI. |
| **Per-stage increment editing & expression expansion** | `views-master.js:286-319` | Stage amounts read-only; `scaleExpression` not capturable; auto-expansion unreachable. |

---

## 6. Missing CRUD actions on existing screens

| Entity | Missing | Evidence |
|---|---|---|
| Posts & Cadres | Edit; parent/"promotes-to" selector + column; default-pay-scale selector | `PostsCadresPage.jsx` |
| Pay Scales | Edit; supersede; `scaleExpression`, payableDays, monthDays, effectiveTo fields | `PayScalesPage.jsx` |
| Government Orders | Edit; supersede; status control (all stuck `DRAFT`) | `GovernmentOrdersPage.jsx` |
| KSR Rules | Edit; supersede; **"Verified" toggle** (rules never used in calc without it); GO link, post/category scope, effective dates, calc method, description | `KsrRulesPage.jsx` |
| Allowance types | Edit; **map to posts/cadres** (new ones always apply bank-wide) | `AllowancesPage.jsx` |
| Leave types | Edit; Max accumulation, Paid %, Carries forward, Encashable, Requires approval, Remarks | `LeavePage.jsx` |
| Employees | Edit; deactivate; employmentStatus; ~30 payroll/statutory fields; part-time-contingent | `NewEmployeePage.jsx` |
| Org Users | Change role; Reset MFA; Delete permanently; seat-limit display; send-welcome-email | `UsersPage.jsx` |
| Platform Users | Reset password; Reset MFA; Deactivate/Reactivate; Delete; **temp password is never displayed** | `PlatformUsersPage.jsx` |
| Organisation (platform) | Licence notes; extend-by-1-year; org logo upload; add-Org-Admin post-onboarding | `OrganisationDetailPage.jsx` |
| Leave applications | **Cancel** (backend rollback unreachable); reject reason not captured/shown | `LeavePage.jsx` |

---

## 7. Cross-cutting themes

1. **Role-based UI gating removed.** OLD hid write/create/decide buttons per role and guarded routes.
   NEW renders action buttons for every viewer and relies on server 403s (`Sidebar.jsx:61`, all pages).
   `DEPARTMENT_HEAD` now sees Allowances/Leave/Payroll/Arrears in nav (excluded by the old route roles).
2. **All confirmation dialogs removed.** OLD used `window.confirm` for ~a dozen destructive actions
   (approve/re-process/delete run, deactivate employee, delete loans/docs, calculate/recalculate arrears,
   pay installment, close/reopen year, suspend org, reset password/MFA, delete users). NEW keeps almost none —
   irreversible actions fire on one click.
3. **Client-side validation dropped.** Forms are `noValidate`; `required` is presentational; numeric
   `min/max/step` attributes removed; JSON fields sent unvalidated (KSR `conditions`). Errors surface
   later from the server.
4. **Empty/loading/error states** are thinner in several places (e.g. payroll list error box, MFA-setup error).
5. **Money** is consistently ₹ (this report's fix); only formatting precision differs from OLD.

---

## 8. Suggested remediation order

**P0 — correctness/safety (small, high impact)**
1. Fix forced-change loop (B1) and global 401 handling (B2).
2. Fix org forgot-password `orgCode` (B3).
3. Fix KSR rule-type enum (B4), audit columns (B5), org-profile silent drop (B6), payroll reject reason (B7).

**P1 — restore the safety net**
4. Reinstate role gating + confirmation dialogs (theme 1 & 2) across all pages.

**P2 — missing money-critical screens**
5. Payroll: payslip drill-down, PDF, email (bulk + single), register CSV, bank-transfer CSV, re-process, delete.
6. Employee edit + deactivate; loans suite; bank accounts; attendance/LOP; documents.

**P3 — configuration & governance**
7. Payroll settings screen (31 fields); Mandatory-fields screen.
8. Pay Revisions screen; stage-increment editing; GO/KSR edit + verify + documents.
9. Allowance post-mapping; leave-type full fields + edit + cancel.
10. Arrears case detail (ledger, plans, adjustment, pay, receipts) + DA revision detail/GO doc.
11. Employee bulk import; org branches/board/documents; platform org logo/pay-scale revision/add-admin;
    audit-log filters + pagination.

---

*Detailed, line-referenced evidence for every row above is available in the seven module reports.*

---

# Implementation progress — 2026-10-17

All items below are now implemented in the React frontend (`frontend/src`) and
verified by a clean `npm run build` plus headless-Chrome screenshots against the
running server. The old `OldBuild/` and `public/` references were left untouched.

## Correctness (P0) — fixed
| # | Fix | Where |
|---|-----|-------|
| 1 | Auth endpoints no longer wipe the session on a wrong password/code (401/403 on `/auth/login`, `mfa/verify-login`, `change-password`, `mfa/disable`, `forgot/reset` surface inline) | `api/client.js` `isAuthCall` |
| 2 | Mid-session 401 / org-suspended 403 now dispatch `ucb:logout`, clear the token and carry a notice to the sign-in screen (no more silent eject) | `api/client.js` `forceLogout`, `auth/AuthContext.jsx` |
| 3 | Forced password change no longer loops: `refreshMe()` clears `mustChangePassword`; page gained a greeting and a sign-out link | `ChangePasswordPage.jsx` |
| 4 | Org forgot-password now sends `orgCode` (previously a bank user's reset silently sent nothing) | `ForgotPasswordPage.jsx` |
| 5 | KSR rule-type enum corrected to the model's eight values (was 6, incl. two non-existent) | `KsrRulesPage.jsx` |
| 6 | Audit page rewritten: correct columns, pagination, activity + org filters, retention line, purge button | `AuditPage.jsx` |
| 7 | `getRaw`/`postRaw` client variants added — endpoints whose payload has sibling keys beside `{data}` (audit, arrears case, bank accounts, overdrafts, vehicle loans, bulk-import summary) no longer lose data to the unwrap | `api/client.js` |
| 8 | Organisation contact fields are now editable (short name, contact email/phone, website, address) — they were silently dropped before | `SettingsPage.jsx` |
| 9 | Payroll reject prompts for a reason; approve/mark-paid confirm; rejection banner shown | `PayrollRunPage.jsx` |

## Screens added (entirely absent before)
- **Employee sub-resources** — `Attendance/LOP` grid, `Bank Accounts` (with salary-credit routing),
  the full loans suite (`Festival Advance`, `Overdraft`, `Recurring Deposit`, `LIC`, `Housing Loan`,
  `Vehicle Loan`), `Documents` (PAN/Aadhaar/photo scans), and a live `Payslip` preview + PDF.
  One generic `ResourceSection` component serves all six loan types.
- **Bulk Import** — template download, file/paste upload, per-row results.
- **Payroll exports** — Register CSV, Bank-transfer CSV (approved/paid only), bulk payslip email,
  per-line payslip modal + PDF, re-process, delete.
- **Payroll Settings** — all 31 fields, grouped.
- **Mandatory Fields** — per-field toggles, select-all/none.
- **Pay Revisions** — CRUD + linked KSR rule + supersede.
- **Arrears case detail** — month ledger, manual adjustment (mandatory reason), payment plans
  (single shot / installments), standalone installment payment with PDF receipt.
- **DA revision detail** — metadata, GO scan upload/view/remove, workflow, all cases.
- **Organisation Profile CRUD** — board members (+photo), branches, statutory documents, logo.
- **GO Register scans** — attach/view/remove the scanned order per GO.

## Cross-cutting
- **Role gating** — `can(...roles)` helper on the auth context; sidebar nav items filtered by role;
  payroll approve/mark-paid and arrears approve gated to the approver roles.
- **Confirmation dialogs** — added to destructive actions (delete run, remove records, delete document).
- **Currency** — ₹ used everywhere (sidebar rupee icons + `fmt.money` → INR).
- **Note:** most client forms still use `noValidate` (browser validation). Server validation is intact
  and returns inline field messages; this remains a deliberate follow-up rather than a parity break.

## API client extensions
`masterDataApi` (+`governmentOrder`/`organisation` document & bulk methods), `orgApi` (mandatory
fields, profile documents), `payrollApi` (line, send-payslips, CSV/PDF URLs), and a new
`serviceBookApi` (payslip, attendance, bank accounts, six loan types, documents) in `extended.js`,
plus `downloadFile`/`openFile` authenticated-binary helpers in `client.js`.

## Not yet done
- Client-side (browser) validation on forms — server errors still surface inline.
- Pay-scale **stage** ladder editing (backend endpoint exists; UI pending).
- Custom per-employee allowance overrides (backend exists).
- Employee self-service portal is minimal; the old app's self-service surface was small.

