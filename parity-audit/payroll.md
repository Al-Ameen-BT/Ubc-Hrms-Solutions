# Payroll Runs — OLD (vanilla JS) vs NEW (React) Feature-Parity Report

**Scope:** Payroll runs — list, create (month/year/type, pre-conditions), run detail (status flow, lines, totals), compute/generate, approve/reject (reason), mark-paid, delete, per-employee payslip view, payslip PDF download/print, email payslips (single/bulk), exports (register / bank transfer CSV).

**Legend / file shorthands**

| Tag | File |
|---|---|
| `VP` | `public/js/views-payroll.js` (OLD payroll screens) |
| `CORE` | `public/js/core.js` (OLD helpers: money, badges, api, router) |
| `CMP` | `public/js/components.js` (OLD shared components) |
| `VM` | `public/js/views-master.js` (`payslipCard`, live preview reused by run drill-down) |
| `LIST` | `frontend/src/features/payroll/PayrollPage.jsx` |
| `NEWRUN` | `frontend/src/features/payroll/NewPayrollRunPage.jsx` |
| `RUN` | `frontend/src/features/payroll/PayrollRunPage.jsx` |
| `CLIENT` | `frontend/src/api/client.js` |
| `ROUTE` | `src/routes/payroll.js` (shared backend) |
| `ENGINE` | `src/services/payrollEngine.js` |

Backend/engine are **shared** and unchanged, so any old-only client action that hits an existing endpoint is a pure UI gap in the React app.

---

## Feature / behaviour matrix

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| **A. Payroll list screen** ||||||
| 1 | Payroll list screen `/payroll` | `VP:274` route, roles `PAYROLL_VIEWERS` (=ORG_ADMIN, HR_ADMIN, HR_OFFICER, ACCOUNTS_OFFICER, PAYROLL_OFFICER, APPROVING_AUTHORITY) `VP:20` | Present | `App.jsx:88`; `LIST:21` | No role guard at all in React (see #57) | Med |
| 2 | Page heading + subtitle ("Process a monthly payroll run… route through approval before disbursement") | `VP:52` | Partial | `LIST:46-49` ("Payroll / Process and track monthly payroll runs") | Descriptive copy reduced; no mention of approval routing | Low |
| 3 | "Process payroll" inline form (month + year) | `VP:54-61` | Changed | `LIST:60` button → `NEWRUN` separate page/stepper | Moved to a page; behaviour differs (see B) | Low |
| 4 | "Process payroll" form shown only to PROCESSORS (SUPER_ADMIN, ORG_ADMIN, HR_ADMIN, PAYROLL_OFFICER) `VP:17` | `VP:48,54` | Missing | `LIST:60` shows "New Payroll Run" to every viewer unconditionally | HR_OFFICER / ACCOUNTS_OFFICER / APPROVING_AUTHORITY see a create button they are forbidden to use; click leads to a 403 toast | Med |
| 5 | Helper text: "re-processing a month still Processed recalculates and replaces it — nothing final until approved" | `VP:55` | Missing | absent | Important workflow caution lost | Med |
| 6 | Month `<select>` Jan–Dec, default = current month | `VP:57` | Present | `NEWRUN:60-62` (month select, default current) | — | — |
| 7 | Year input: numeric, default current year, `min=2000 max=2100` | `VP:58` | Changed | `NEWRUN:66-68` — `<select>` limited to `[Y-1, Y, Y+1]` | Cannot process/re-process a year outside a 3-value window (backend allows 2000–2100, `ENGINE:57`); e.g. no back-year reruns | Med |
| 8 | List columns: Month, Status, Employees, Gross, Deductions, Net pay, **Processed**, (action) | `VP:68` | Partial | `LIST:35-42`: Period, Status, Employees, Gross, Deductions, Net Pay | **"Processed" timestamp column missing** | Low |
| 9 | Month cell links to run detail | `VP:72` | Changed | `LIST:67` whole row clickable (`onRowClick`) | Functionally equivalent | Low |
| 10 | Explicit "View" link column | `VP:79` | Missing | absent | Replaced by row click (acceptable) | Low |
| 11 | Status badge (PROCESSED plain / APPROVED ok / REJECTED warn / PAID ok) | `VP:25,73` | Present | `LIST:14-19,37` (variant mapping) | Colour mapping differs slightly (APPROVED info vs ok) — cosmetic | Low |
| 12 | Money rendered with ₹ + en-IN grouping, max 2 dp | `CORE:195-199`, `VP:75-77` | Present | `CLIENT:213-220` `Intl currency INR` | See §Money findings — precision may differ | Low |
| 13 | Processed timestamp via `H.fmtDateTime` (dd Mon yyyy, HH:MM) | `VP:78` | Partial (run detail only) | `RUN:80` uses `fmt.dateTime`; list has none | List lost the column; format parity ok | Low |
| 14 | Empty state "No payroll has been processed yet." | `VP:66` | Present | `LIST:68` "No payroll runs yet." | — | — |
| 15 | Process action: `POST /payroll-runs {year, month}` with busy state | `VP:87-89,105` | Present | `NEWRUN:32-38,91` | — | — |
| 16 | After successful process: **confirm prompt "Email the payslip PDF to everyone now?"** | `VP:97-104` | Missing | absent | Bulk-email convenience step gone (email itself also absent — #40) | Med |
| 17 | Redirect to run detail after processing | `VP:100,103` | Present | `NEWRUN:34-37` `navigate('/payroll/:id')` | Uses `data.id || data.run?.id` robustly | — |
| 18 | Error notice on list/process failure | `VP:53,85,105` | Present | `LIST` via react-query; `NEWRUN:38,54` `auth-error` | List shows empty/loading, not an explicit error box | Low |
| 19 | Stats/KPI tiles on list | none (old had none) | Added | `LIST:51-55` Total Runs / Paid Net Pay / Awaiting Action | Extra, not a gap | — |
| 20 | Column sorting | none | Added | `Table.jsx:6-23` client-side sort | Extra | — |
| **B. Create-run flow (NewPayrollRunPage)** ||||||
| 21 | Pre-conditions shown before processing (active employees count / estimate) | Old computed implicitly on submit | Partial (fake) | `NEWRUN:73-86` Preview step shows **hardcoded** "—" employees and `fmt.money(0)` for Estimated Gross/Net | Preview is a non-functional placeholder; misleading vs old (old simply did not preview) | Med |
| 22 | Multi-step wizard (Period → Preview → Process → Review) | Old is a single inline form | Changed (addition) | `NEWRUN:12-17,27,51` | New UX; step 3 "Review" is unreachable in normal flow because process navigates away — minor dead-end | Low |
| 23 | "Cancel"/"Back"/"Next" navigation | n/a | Present | `NEWRUN:104-108` | Next is shown even on the Process step (can skip processing to Review) | Low |
| 24 | Backend pre-condition: valid year/month | `ENGINE:57-58` | Present (backend) | no client validation; errors via `NEWRUN:38` | Year select can't be invalid, so ok | — |
| 25 | Backend pre-condition: cannot re-process APPROVED/PAID run | `ENGINE:61-66` | Present (backend) | error surfaces via `NEWRUN:38` toast/error | UI has no proactive warning | Med |
| 26 | Backend pre-condition: month must be open (year-end) | `ENGINE:68-71` | Present (backend) | error surfaces via `NEWRUN:38` | — | — |
| **C. Run detail — header & totals** ||||||
| 27 | Run detail screen `/payroll/:id` | `VP:275` route | Present | `App.jsx:90`; `RUN:14` | — | — |
| 28 | Heading = "<Month> <Year> payroll" + breadcrumb ("Payroll › <Month>") | `VP:132,439-443` | Partial | `RUN:68` "Payroll Run — …"; no breadcrumb | Breadcrumb lost | Low |
| 29 | **Rejection reason banner** (`notice warn`: "Rejected: <reason>") | `VP:134` | Missing | absent | Rejection reason stored (`payrollRun.js:41`) but never displayed in new app | Med |
| 30 | Status badge | `VP:136` | Present | `RUN:72` | — | — |
| 31 | Employee count | `VP:137` | Present | `RUN:96-99` | — | — |
| 32 | Processed timestamp | `VP:138` | Present | `RUN:80` counterfoil header | — | — |
| 33 | **Approved / Paid timestamps** (`run.approvedAt`, `run.paidAt`) | `VP:139-140` | Missing | absent | Run detail no longer shows when/whether approved or paid | Low |
| 34 | Total gross / deductions / net pay cards | `VP:142-144` | Present | `RUN:84-95` | — | — |
| 35 | Net pay highlighted (`<strong>`) | `VP:144` | Present | `RUN:94` `red-ink` class | Cosmetic | — |
| **D. Run detail — workflow actions** ||||||
| 36 | **Approve** button (PROCESSED + APPROVERS) | `VP:116,213-218` | Partial | `RUN:103-108` | Button present but no role gating and **no confirm dialog** | High |
| 37 | Approve **confirmation dialog** ("Once approved, this run is locked…") | `VP:214` | Missing | absent | Irreversible lock now one click, no warning | High |
| 38 | **Reject** button (PROCESSED + APPROVERS) | `VP:116,219-224` | Partial | `RUN:106` | Present but no role gating / no confirm | High |
| 39 | **Reject reason prompt** (optional free text) | `VP:220` (`window.prompt`) | Missing | `RUN:41` hardcodes `'Rejected from the run page'` | Users cannot record a real reason; reason shown nowhere anyway (#29) | High |
| 40 | **Re-process** action (PROCESSED + PROCESSORS) | `VP:117,225-230` | Missing | absent | No way to recompute a PROCESSED run after fixing master data (core engine feature `ENGINE:130-135`) | High |
| 41 | Re-process **confirmation** ("replaces every line…") | `VP:226` | Missing | absent | — | High |
| 42 | **Delete** action (PROCESSED, and REJECTED + PROCESSORS) | `VP:118,120,237-241` | Missing | absent (`payrollApi.remove` exists unused `CLIENT:202`) | Cannot remove a bad/processed or rejected run at all | High |
| 43 | Delete **confirmation** ("cannot be undone") | `VP:238` | Missing | absent | — | High |
| 44 | **Mark as paid** (APPROVED + APPROVERS) | `VP:122,231-236` | Partial | `RUN:109-111` | Present but no role gating / no confirm | High |
| 45 | Mark-paid **confirmation** ("record-keeping step, does not move money") | `VP:232` | Missing | absent | — | Med |
| 46 | Role gating of actions (PROCESSORS vs APPROVERS arrays) | `VP:17-18,112-113,116-130` | Missing | absent; `RUN` uses no role checks | Any viewer (incl. HR_OFFICER/ACCOUNTS_OFFICER) sees Approve/Reject/Mark-paid; backend 403s (`ROUTE:194,204,214`) → confusing errors | Med |
| 47 | Busy/disabled state on action buttons | `VP:215,221,227,233` `H.busy` | Present | `RUN:105,106,110` `loading` prop | — | — |
| 48 | Action error surfaced to user | `VP:217,223,229,235` notice | Present | `RUN:38,43,48` toast | — | — |
| **E. Run detail — employee lines table** ||||||
| 49 | Lines table columns: Emp. code, Name, Post, LOP days, Gross, Deductions, Net pay, Bank details, Payslip email, (view) | `VP:168` | Partial | `RUN:55-61`: Code, Employee, Gross, Deductions, Net Pay | Missing **Post, LOP days, Bank details, Payslip email status, row action** | High |
| 50 | LOP days shown only when > 0 else "—" | `VP:172` | Missing | absent | No loss-of-pay visibility per line | Med |
| 51 | Bank details badge "On file" / "Missing" (+ exception note title) | `VP:174`, line `exceptionNote` `ENGINE:124` | Missing | absent | Bank-advice readiness not visible in the new app | Med |
| 52 | Payslip-email status per line ("Not sent" / "Sent <ts>" / "Failed" + error tooltip) | `VP:154-157` | Missing | absent | Depends on missing email feature (#54) | High |
| 53 | Lines ordered by empCode | `VP` (list) | Present | backend `ROUTE:114`; `RUN:116` | — | — |
| 54 | Empty lines state "No employees were active for this run." | `VP:181` | Present | `RUN:116` "No lines in this run." | — | — |
| **F. Per-employee payslip & PDF** ||||||
| 55 | "View payslip" toggle per line (drill-down) | `VP:176,188-196,206-212` | Missing | absent | No way to inspect one employee's frozen payslip at all | High |
| 56 | Frozen payslip card render (Actual/Basic, DA (+Variable/Fixed), HRA, Risk, Other, CCA, Conveyance, Medical, Bonus, Gross; PF/VPF/Welfare/GSLI/PT/Festival/Recurring/LIC/Housing/Vehicle/TDS/Deductions; Net) | `VP:193` → `VM:617-663` | Missing | absent | Whole payslip breakdown UI absent | High |
| 57 | Grade details block (name/scale/payable days/month days) | `VM:623` (`gradeDetailsCard`) | Missing | absent | — | Low |
| 58 | Loan & Interest Details card (Festival Advance/Overdraft/RD/LIC/HL/VL) | `VM:662` (`loanInterestCard`) | Missing | absent | — | Low |
| 59 | Pro-rated/LOP note on payslip ("pro-rated for N LOP days out of M") | `VM:625` | Missing | absent | — | Low |
| 60 | **Download payslip PDF** per employee (auth'd blob → browser download) | `VP:192`, `VM:622,672-682`; `CMP:119-133`; backend `ROUTE:132-148` | Missing | absent | Endpoint exists; no React trigger | High |
| 61 | PDF filename `payslip-<empId>-<year>-<month>.pdf` | `VP:192` | Missing | absent | — | Low |
| 62 | "Print" of payslip | old = download only (open/download), no explicit print button; print via downloaded PDF | Missing | absent | No print affordance in either (old implicitly via PDF); no new gap beyond #60 | Low |
| **G. Email payslips** ||||||
| 63 | Bulk "Send payslips" button (any status except REJECTED, PROCESSORS) | `VP:130,248-251`; backend `ROUTE:155-190` | Missing | absent | Endpoint exists; no React UI | High |
| 64 | Bulk-send confirm ("Email the payslip PDF to every employee (N)?") | `VP:249` | Missing | absent | — | High |
| 65 | Per-line send / resend button ("Send"/"Resend") | `VP:158-160,252-254` | Missing | absent | Single-recipient email impossible | High |
| 66 | Send-result notice "X of Y payslip(s) emailed; Z failed" | `VP:265` | Missing | absent | — | Med |
| 67 | Recipient selection office→personal email fallback; no-email error recorded | `payslipEmail.js:17-37` | Present (backend) | backend only, no UI to surface it | UI cannot fix/re-send "no email" cases | Med |
| **H. Exports** ||||||
| 68 | **Download register (CSV)** available for any run status | `VP:124,242-244`; backend `ROUTE:242-257` | Missing | absent | Full payroll register export gone | High |
| 69 | **Download bank transfer file (CSV)** for APPROVED/PAID only | `VP:125,245-247`; backend `ROUTE:261-275` | Missing | absent | Disbursement (bank advice) export gone | High |
| 70 | Register filename `payroll-register-<year>-<month>.csv` | `VP:243` | Missing | absent | — | Low |
| 71 | Bank-transfer filename `bank-transfer-<year>-<month>.csv` | `VP:246` | Missing | absent | — | Low |
| 72 | Salary-statement export | none in old payroll views | n/a | n/a | Not an old payroll feature; no gap in this scope | — |
| **I. Money display & calculations** ||||||
| 73 | ₹ symbol on every amount (old `H.money`) | `CORE:195-199` | Present | `CLIENT:213-220` `Intl currency INR` → "₹…" | See §Money findings | Low |
| 74 | Null amount → "—" | `CORE:196` | Present | `CLIENT:214` | — | — |
| 75 | Max 2 decimal places | `CORE:198` `maximumFractionDigits: 2` | Partial | `CLIENT:215-219` `minimumFractionDigits: 0` | New may render differing minor-unit behaviour; verify paise display parity | Low |
| 76 | Sums of totals computed in engine (rounded to 2dp) | `ENGINE:97-99,144-146` | Present (backend) | displayed verbatim | — | — |
| 77 | `Paid Net Pay` KPI sums `totalNetPay` of PAID runs | new-only | Added | `LIST:33,53` | Extra | — |
| 78 | Literal `$` in any payroll monetary value | none | none | grep of `frontend/src` found no literal `$` amounts | No `$` found | — |
| 79 | PDF amounts use "Rs." (not ₹) because Helvetica lacks the glyph | `payslipPdf.js:20-23` | Present (backend, unchanged) | `payslipPdf.js:22` | Not a new regression; noted per "money without ₹" instruction | Low |
| 80 | Emailed payslip money uses ₹ | `payslipEmail.js:58-60` | Present (backend) | unchanged | — | — |
| **J. Edge cases / status transitions** ||||||
| 81 | `PROCESSED → APPROVED` only | `ENGINE:170` | Present | backend; UI enforces by showing button only on PROCESSED (`RUN:103`) | — | — |
| 82 | `PROCESSED → REJECTED` only | `ENGINE:180` | Partial | `RUN:106` shows Reject on PROCESSED; reason lost (#39) | — | Med |
| 83 | `APPROVED → PAID` only | `ENGINE:188` | Present | `RUN:109-111` | — | — |
| 84 | APPROVED/PAID **cannot be re-processed** | `ENGINE:61-66` | Present (backend) | no proactive UI | — | — |
| 85 | APPROVED/PAID **cannot be deleted** | `ENGINE:197-199` | Present (backend) | no delete UI at all | — | — |
| 86 | REJECTED run superseded by a fresh run (excluded from uniqueness) | `ENGINE:38-44` | Present (backend) | `NEWRUN` can create | No UI affordance explaining the "do-over" | Low |
| 87 | Bank-transfer CSV blocked unless APPROVED/PAID | `ROUTE:264` | Present (backend) | no UI | — | — |
| 88 | Send-payslips blocked for REJECTED | `ROUTE:159-161` | Present (backend) | no UI | — | — |
| 89 | SUPER_ADMIN excluded from the OLD bank Payroll screen (mirrors viewers minus super admin) | `VP:19-20` | Changed | React route unguarded; sidebar shows Payroll only to non-super org nav (`Sidebar.jsx:11-27,61`) | Super admin can still reach `/payroll` by URL in React (old redirected via route roles) | Low |
| **K. Cross-cutting UX** ||||||
| 90 | Confirmation dialogs for destructive/irreversible actions | approve `VP:214`, re-process `VP:226`, mark-paid `VP:232`, delete `VP:238`, bulk email `VP:249` | Missing | no `window.confirm`/Modal anywhere in `frontend/src/features/payroll` (grep: NONE) | All confirmations removed | High |
| 91 | Rejection-reason free-text input (prompt) | `VP:220` | Missing | `RUN:41` hardcoded string | — | High |
| 92 | Filters on the runs list | none in old | none | `LIST:35-42` no filters | Neither has filters — not a regression | — |
| 93 | Pagination on the runs list | none in old | none | `LIST` none | Neither paginates | — |

---

## High-severity gap summary (grouped)

1. **Per-employee payslip view / drill-down** — absent (#55, #56). Old `VP:176,188-196` + `VM:617-663`.
2. **Payslip PDF download** — absent (#60). Old `VP:192` + `VM:672-682`; backend endpoint `ROUTE:132` still exists.
3. **Email payslips — bulk and per-employee/resend** — absent (#63–#65). Old `VP:158-160,248-254`; backend `ROUTE:155` still exists.
4. **Register CSV export** — absent (#68). Old `VP:124,242-244`; backend `ROUTE:242` still exists.
5. **Bank transfer (bank advice) CSV export** — absent (#69). Old `VP:125,245-247`; backend `ROUTE:261` still exists.
6. **Re-process action** — absent (#40). Old `VP:117,225-230`.
7. **Delete run action** — absent (#42). Old `VP:118,120,237-241`.
8. **All confirmation dialogs removed** (approve/re-process/mark-paid/delete/email) (#37, #41, #43, #45, #64, #90).
9. **Reject reason input removed** — hardcoded string, and reason never displayed (#29, #39, #91).
10. **Lines table loses Post, LOP days, Bank details, Payslip-email status, and the per-row action** (#49–#52, #63).

## Other notable findings
- **No monetary value without ₹, and no literal `$`** in the React payroll UI — all money goes through `fmt.money` (`CLIENT:213-220`, Intl `INR`, renders `₹`). The only non-₹ amounts are the PDF's intentional `Rs.` (`payslipPdf.js:22`) and % fields. No literal `$` found anywhere in `frontend/src`.
- **Role gating dropped:** old PROCESSORS/APPROVERS checks (`VP:17-18,112-130`) have no React equivalent; buttons render for every viewer and rely on backend 403s (`ROUTE:194,204,214`) (#4, #46).
- **Year selector narrowed** to `[Y-1, Y, Y+1]` (`NEWRUN:66-68`) vs backend 2000–2100 (#7).
- **Create-run "Preview" is a non-functional placeholder** showing `—` and `₹0` (#21).
- **Approved/Paid timestamps** and **processed-date list column** no longer shown (#33, #8).

## Severity roll-up
- **High:** 21 rows — #36, #37, #38, #39, #40, #41, #42, #43, #44, #49, #52, #55, #56, #60, #63, #64, #65, #68, #69, #90, #91
- **Med:** 17 rows — #1, #4, #5, #7, #16, #21, #25, #29, #36(note), #45, #46, #50, #51, #66, #67, #82, #89
- **Low:** remaining 20 rows
- **Totals:** Present ≈ 26, Partial ≈ 17, Missing ≈ 45, Changed ≈ 5 across 93 enumerated items.
