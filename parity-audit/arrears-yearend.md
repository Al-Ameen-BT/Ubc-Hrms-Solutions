# Feature-parity audit — DA Arrears, Arrears Cases & Year-End (OLD vanilla JS vs NEW React UI)

Scope: (A) DA Revisions, (B) Arrears cases, (C) Year-End.
Read-only analysis. Both UIs share the same Express backend (`src/routes/arrears.js`,
`src/routes/yearEnd.js`, `src/services/arrears.js`, `src/services/daRevisions.js`,
`src/services/yearEnd.js`) and the same API client contract (`{ data }` unwrap, bare arrays
normalised to `{ rows }`).

**Headline finding:** the React UI implements only the DA-Revision *list + create + calculate
+ status-advance* screen and a Year-End *list + inline summary + close/reopen* screen. The entire
**Arrears Case detail** surface (month-by-month ledger, installments, payment plans, manual
adjustment, standalone payment, PDF receipts) and the **DA Revision detail** surface (fields,
status actions, GO document upload/download/delete, per-revision case list with "Manage") are
**absent**. Several `arrearsApi` methods exist in `frontend/src/api/extended.js` but are never
referenced by any component — i.e. the API layer was ported, the screens were not.

Money rendering: the new app uses `fmt.money` (`frontend/src/api/client.js:213-220`,
`Intl.NumberFormat('en-IN', { style:'currency', currency:'INR' })` → ₹). **No monetary value in
the new arrears/year-end screens is shown without ₹, and there is no literal `$` currency symbol**
(the `$` matches in the new files are JS template-literal interpolation only).

---

## A. DA Revisions

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| 1 | Route + viewer-role gating for DA Arrears | `public/js/views-arrears.js:389` registers `/da-revisions` with `VIEWERS` (no SUPER_ADMIN/DEPARTMENT_HEAD) | Partial | `frontend/src/App.jsx:96`; sidebar shows link to every non-employee incl. DEPARTMENT_HEAD `frontend/src/components/Sidebar.jsx:13-29,61`; no per-route role gate | UI exposes link to roles the old route excluded; server still enforces. | Med |
| 2 | Revisions list table columns | Order No., Order Date, Effective From, Previous DA %, Increase %, Revised DA %, Status, View — `views-arrears.js:69-78` | Partial | `ArrearsPage.jsx:67-72` — has Order Number, Order Date, Effective From, Revised DA %, Status; **missing Previous DA % and Increase %** columns; no "View" (→ detail) link | Users can't see previous/increase split at a glance. | Med |
| 3 | Revisions list empty state | "No DA revisions recorded yet." `views-arrears.js:68` | Present (wording) | `ArrearsPage.jsx:117` "No DA revisions recorded." | Cosmetic. | Low |
| 4 | "New DA Revision" form visibility | Only rendered for PROCESSORS (`canCreate`) `views-arrears.js:54,58` | Partial / Changed | `ArrearsPage.jsx:115` "Add DA Revision" button shown unconditionally | Non-processors see a create button; server 403s. | Med |
| 5 | Create field: Order Number (required) | `views-arrears.js:89` | Present | `ArrearsPage.jsx:139` | — | — |
| 6 | Create field: Order Date | `views-arrears.js:90` | Present | `ArrearsPage.jsx:140` | marked `required` but `noValidate` form + non-submit button → not enforced client-side (server enforces). | Low |
| 7 | Create field: Effective From | `views-arrears.js:91` | Present | `ArrearsPage.jsx:141` | same noValidate caveat. | Low |
| 8 | Create field: Effective To (blank = open-ended) | `views-arrears.js:92` | Present | `ArrearsPage.jsx:142` (labelled "Effective To (optional)") | — | — |
| 9 | Create field: Previous DA % (step 0.001) | `views-arrears.js:93` | Present | `ArrearsPage.jsx:143` (no step attr) | — | Low |
| 10 | Create field: Increase % (step 0.001) | `views-arrears.js:94` | Present | `ArrearsPage.jsx:144` | — | Low |
| 11 | Create field: Applicable Service Category (All/Regular/Part-Time Contingent) | `views-arrears.js:95` | **Missing** | absent | Cannot scope a revision by service category; new revisions always default `ALL` → may calculate arrears for ineligible employees. | Med |
| 12 | Create field: Applicable Employee Category (text, default ALL) | `views-arrears.js:96` | **Missing** | absent | Cannot scope by employee category. | Med |
| 13 | Create field: Remarks | `views-arrears.js:98` | **Missing** | absent | — | Low |
| 14 | Create → navigate to the new revision's detail | `views-arrears.js:114` `H.go('/da-revisions/'+id)` | Changed | `ArrearsPage.jsx:39-44` closes modal + toast, stays on list (no detail exists) | Consequence of missing detail page. | Low |
| 15 | Revised DA % derived server-side (previous + increase), never trusted from client | `src/services/daRevisions.js:63-66` | Present (backend) | shared backend; note text `ArrearsPage.jsx:146` | — | — |
| 16 | Validation: Order Number / Order Date / Effective From / Previous DA % / Increase % required; Increase % ≠ 0; Effective To ≥ Effective From | `src/services/daRevisions.js:72-78`; old surfaces error via notice `views-arrears.js:115` | Present (backend) / Partial (UI) | new surfaces server error in modal `ArrearsPage.jsx:45,137` | New create modal omits Remarks/Category fields so those rules never apply. No client-side pre-validation. | Low |
| 17 | Status advance DRAFT→APPROVED→ACTIVE→CLOSED with split roles (DRAFT→APPROVERS, else PROCESSORS) | `views-arrears.js:26,28,130-131,191-197`; `src/services/daRevisions.js:99-110` | Partial | `ArrearsPage.jsx:14,79-83` — button shown by status only, **no role gating** | Any viewer sees "Approve/Activate/Close"; server 403s. | Med |
| 18 | Status-advance confirmation dialog ("Move this revision to X?") | `views-arrears.js:193` `window.confirm` | **Missing** | `ArrearsPage.jsx:79-83` fires immediately | One-click irreversible status change. | Med |
| 19 | "Calculate arrears" only offered when status is APPROVED or ACTIVE | `views-arrears.js:133` gates on `['APPROVED','ACTIVE']` | Partial | `ArrearsPage.jsx:78` shows Calculate for **every** status incl. DRAFT/CLOSED | Server 409s for DRAFT/CLOSED (`src/services/arrears.js:212-214`). | Med |
| 20 | Calculate confirmation dialog (first-run vs recalc wording; recalc warns ledger replaced + pending plan cleared + paid-installment cases error) | `views-arrears.js:199-202` | **Missing** | `ArrearsPage.jsx:54-61,78` calls mutate directly | Destructive recalculation triggered without warning or explanation. | High |
| 21 | Calculate success feedback incl. employee count **and total ₹** | `views-arrears.js:206` | Partial | `ArrearsPage.jsx:58` toast shows count only, no total amount | — | Low |
| 22 | Calculate role gating (PROCESSORS) | `views-arrears.js:133,198`; server `src/routes/arrears.js:160` | Partial | `ArrearsPage.jsx:78` ungated in UI | Server 403s. | Med |
| 23 | DA Revision **detail screen** (status, Order Date, Effective From, Effective To/"Open-ended", Previous DA %, Increase %, Revised DA % bold, Applies-to, remarks; breadcrumbs) | `views-arrears.js:121-149` | **Missing** | absent (no `/arrears/:id` route in `App.jsx:96-97`) | Core screen gone; fields only readable via the trimmed list row. | High |
| 24 | Supporting **Government Order document** card: show label + size, Download, Delete, Upload (PDF/PNG/JPEG/WebP ≤5 MB, optional label) | `views-arrears.js:151-162,210-226`; backend `src/routes/arrears.js:121-156` | **Missing** | absent | Cannot attach/retrieve the GO scan that authorises the revision. | High |
| 25 | Document delete confirmation | `views-arrears.js:212` `window.confirm` | **Missing** | absent | — | High (folded w/ 24) |
| 26 | Per-revision **cases list** (Emp code, Name, Months, Calculated ₹, Effective total ₹, Payment mode, Status, **Manage** link) | `views-arrears.js:164-178` | Partial | `ArrearsPage.jsx:89-97` renders columns but **no Manage/detail link** | Cases are read-only; the per-employee case ("breakdown") is unreachable → see §B. | High |
| 27 | Per-revision totals footer ("Total calculated ₹ · Total effective …") | `views-arrears.js:176` | Partial | `ArrearsPage.jsx:106-110` global "Outstanding Arrears" tile only; no per-revision totals | Totals shown only for the currently-selected revision (or 0). | Med |
| 28 | Cases card empty-state prompt to run Calculate | `views-arrears.js:165` | Partial | `ArrearsPage.jsx:121` "No arrears cases." | Loses guidance. | Low |
| 29 | Cases table shows for the selected revision | `views-arrears.js:186-187` | Present | `ArrearsPage.jsx:26-30,77` "Cases" button → `selected` | — | — |
| 30 | Edit a DRAFT revision | no old UI form (PUT exists `src/routes/arrears.js:97-105`) | Missing (both) | `arrearsApi.updateRevision` defined `extended.js:46` but **unused** | API present, no screen in either UI. | Med |
| 31 | Case status/labels prettified (underscores → spaces) | old shows raw enum `views-arrears.js:173` | Changed (improvement) | `ArrearsPage.jsx:95-96` `.replace(/_/g,' ')` | — | Low |

## B. Arrears Cases (detail, ledger, plans, payments, receipts)

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| 32 | Arrears **case detail** route/view (`/arrears-cases/:id`) | `views-arrears.js:260-387,391` | **Missing** | absent (`ArrearsPage.jsx` has no detail route; `arrearsApi.caseDetail` `extended.js:51` unused) | Entire per-employee screen absent. | High |
| 33 | Case header + breadcrumbs (employee name/code, "under <order no.>") | `views-arrears.js:305-308` | **Missing** | absent | — | High |
| 34 | Case summary card: Months covered, Calculated total ₹, Adjusted total ₹ (if set), **Effective total ₹ (bold)**, Payment mode, Status, adjustment reason | `views-arrears.js:310-319` | **Missing** | absent | — | High |
| 35 | **Month-by-month calculation** ledger: Month, Basic Pay applicable ₹, Source, DA Difference %, Arrears amount ₹ | `views-arrears.js:235-243,320`; backend `src/routes/arrears.js:195-209` | **Missing** | absent | "Show your work" spec record not viewable. | High |
| 36 | Basic-pay source labels (Payroll run / Pay history / Current pay (estimate)) | `views-arrears.js:239` | **Missing** | absent | — | High (folded w/ 35) |
| 37 | **Installments** table: Month, Amount ₹, Status, Paid on, action | `views-arrears.js:245-258,321` | **Missing** | absent | — | High |
| 38 | "Pay now" per pending installment, standalone (service-book entry + receipt), with strong confirmation | `views-arrears.js:367-376`; backend `src/routes/arrears.js:251-264` | **Missing** | absent (`arrearsApi.payInstallment` `extended.js:55-56` unused) | Cannot settle an arrear. | High |
| 39 | Download installment **receipt PDF** (PAID only) | `views-arrears.js:250-252,377-382`; backend `src/routes/arrears.js:266-284` | **Missing** | absent | — | High |
| 40 | Payment-plan builder — mode select (Single Shot / Installment (equal split) / Custom Installment) | `views-arrears.js:266-277` | **Missing** | absent (`arrearsApi.setPaymentPlan` `extended.js:53` unused) | — | High |
| 41 | Single Shot fields: Target month (default current month), Target year (default current year) | `views-arrears.js:281-284` | **Missing** | absent | — | High |
| 42 | Installment fields: Number of installments (default 6, min 1 max 60), Starting month (default current), Starting year (default current) | `views-arrears.js:285-288` | **Missing** | absent | — | High |
| 43 | Custom installment editor ("YYYY-MM amount" per line) + hint "must total effective amount" + client regex validation & error copy | `views-arrears.js:289-291,345-356` | **Missing** | absent | — | High |
| 44 | Save payment plan | `views-arrears.js:341-360` | **Missing** | absent | — | High |
| 45 | Clear pending payment plan (with confirmation) | `views-arrears.js:361-366`; `arrearsApi.clearPaymentPlan` `extended.js:54` unused | **Missing** | absent | — | High |
| 46 | "Part already paid — new plan replaces only pending" note | `views-arrears.js:270` | **Missing** | absent | — | High |
| 47 | **Manual adjustment** form: Approved amount (number step 0.01 min 0, default = effective total), Reason (required textarea); note it clears pending plan | `views-arrears.js:294-303`; backend `src/services/arrears.js:269-285` | **Missing** | absent (`arrearsApi.adjustCase` `extended.js:52` unused) | — | High |
| 48 | Save adjustment | `views-arrears.js:332-337` | **Missing** | absent | — | High |
| 49 | Rule: recalculation refused when a case has a PAID installment (409) | backend `src/services/arrears.js:149-154`; old warns in confirm `views-arrears.js:200` | Partial (backend) | new has no case-level recalc; revision-level calculate would surface generic error | Old copy says cases are "skipped"; the backend actually throws and **aborts the whole transaction**, so no case in the revision is recalculated. New copy absent. | Med |
| 50 | Rule: plan replacement/adjustment refused when any installment PAID (409) | `src/services/arrears.js:258-260,297-304` | N/A (UI) | no plan/adjust UI in new app | Backend rule intact but unreachable. | Med |
| 51 | Case status flow CALCULATED→PLAN_SET→PARTIALLY_PAID→FULLY_PAID badges | `views-arrears.js:27,253-254`; backend `src/services/arrears.js:244-256` | Partial | `ArrearsPage.jsx:96` shows the status badge, but no plan/pay actions to advance it | Read-only display only. | Med |
| 52 | Note that arrears are paid **separately from salary** | `views-arrears.js:247` | **Missing** | absent | — | Med |
| 53 | Calculation edge rule: months capped at current month; open-ended uses current month | `src/services/arrears.js:55-69` | Present (backend) | shared backend | Not surfaced anywhere in new UI. | Med |
| 54 | Calculation edge rule: 3-tier basic-pay fallback (frozen run > pay-history > current estimate) | `src/services/arrears.js:86-109` | Present (backend) | shared backend | Source not shown (no ledger UI). | Med |
| 55 | Calculation edge rule: only ACTIVE employees with daType VARIABLE/BOTH are eligible; category/service/pay-revision filters | `src/services/arrears.js:121-137` | Present (backend) | shared backend; but new create form omits the filter fields (rows 11-12) | Filters default ALL when created via new UI. | Med |
| 56 | Calculation edge rule: stale (no-longer-eligible) cases removed on recalculation, except those with PAID installments | `src/services/arrears.js:211-242` | Present (backend) | shared backend | — | — |
| 57 | Plan validation: Single Shot valid year/month + amount>0; Installments 1..60 + valid start; Custom each>0, valid month, no duplicate month, sum == effective total ±0.01 | `src/services/arrears.js:307-354` | Present (backend) | no UI to trigger | Unreachable from new app. | Med |

## C. Year-End

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| 58 | Route + viewer-role gating for Year-End | `public/js/views-org.js:762` `YE_VIEWERS` | Partial | `frontend/src/App.jsx:97`; sidebar link `Sidebar.jsx:23` shown to all non-employees; no route role gate | — | Med |
| 59 | List head + "Open / view a year" input (number, default current year, min 2000 max 2100) with "Enter a year." validation → navigate to year | `views-org.js:670-681` | **Missing** | absent — new list has no way to open/see a year that has no closure row yet | Can only view years already listed. | Med |
| 60 | Years-on-record table: Year, **Type (Financial/Calendar)**, Period, Status, View | `views-org.js:687-692` | Partial | `YearEndPage.jsx:57-74` — Year, From, To, Status, Closed On, actions; **missing Type column** | Financial vs calendar year not distinguishable. | Med |
| 61 | Year detail summary card: Status, Payroll runs included "X of Y months", **Closed on (date-time)**, Total gross ₹, Total deductions ₹, Total net pay ₹ (bold), remarks | `views-org.js:712-721` | Partial | `YearEndPage.jsx:89-98` — Runs Included, Gross, Deductions, Net; **missing Status, Closed on, remarks** | — | Med |
| 62 | "Payroll runs in this year" table: Month, Status, Gross ₹, Deductions ₹, Net ₹ (per-run breakdown), empty state | `views-org.js:722-728` | **Missing** | absent (summary API returns `runs` but UI ignores it) | No month-by-month run breakdown. | Med |
| 63 | Close year action, role-gated (ORG_ADMIN/APPROVING_AUTHORITY/SUPER_ADMIN) | `views-org.js:701,707,730-735` | Partial | `YearEndPage.jsx:68-69,104-115` button to all roles; server enforces `src/routes/yearEnd.js:38-39` | UI shows Close to every viewer. | Med |
| 64 | Close year confirmation dialog | `views-org.js:731` `window.confirm` | Changed/Present | `YearEndPage.jsx:104-119` modal with `form-note` + Confirm button | Modal serves as confirmation; acceptable. | Low |
| 65 | Close year **remarks** capture | old posts `{}` — no remarks UI (`views-org.js:733`), though service supports it | Changed (improvement) | `YearEndPage.jsx:111,118` sends `remarks` | New adds remarks the old UI never captured. | Low |
| 66 | Reopen year action, role-gated (ORG_ADMIN/SUPER_ADMIN) | `views-org.js:702,708,736-741` | Partial | `YearEndPage.jsx:70` button to all roles; server enforces `src/routes/yearEnd.js:47-48` | — | Med |
| 67 | Reopen confirmation dialog | `views-org.js:737` `window.confirm` | **Missing** | `YearEndPage.jsx:70` fires `reopenMutation.mutate` directly | One-click reopen with no confirmation. | Med |
| 68 | Closed year blocks new payroll runs (governance lock) | `src/services/yearEnd.js:96-104`; old copy `views-org.js:731` | Present (backend) | new copy `YearEndPage.jsx:117`; backend `src/routes/yearEnd.js:50` | — | — |
| 69 | Summary totals aggregated from APPROVED/PAID runs only; `payrollRunsExpected` = months in bounds | `src/services/yearEnd.js:49-73` | Present (backend) | `YearEndPage.jsx:92-95` | — | — |
| 70 | Per-employee figures in Year-End | neither UI provides | Missing (both) | absent | N/A for parity; noted for completeness. | — |

## D. Cross-cutting

| # | Feature / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| 71 | PROCESSORS/APPROVERS/VIEWERS role model in UI | `views-arrears.js:18-20`; `views-org.js:664,699-702` | Partial | no role constant / `useAuth` role check in `ArrearsPage.jsx`; `YearEndPage.jsx` imports `useAuth` only for `orgId` (`:16-17`) | UI-side permission gating essentially absent; relies entirely on server 403s. | Med |
| 72 | Monetary values rendered with ₹ | `core.js:195-199` `H.money` → "₹" + locale | Present | `client.js:213-220` `fmt.money` (INR); used `ArrearsPage.jsx:93-94,109`, `YearEndPage.jsx:93-95` | No money value shown without ₹; no literal `$`. | Low |
| 73 | Status badge colour mapping | `views-arrears.js:26-27`; `views-org.js:665` | Present/Changed | `ArrearsPage.jsx:72,95-96`; `YearEndPage.jsx:61` | — | Low |
| 74 | Loading / empty / error states | `H.loading()`/`H.errorBox` throughout | Present | `Table loading/emptyMessage` + toasts throughout | — | Low |
| 75 | Confirmation before destructive/irreversible actions (status change, calculate, clear plan, pay, delete doc, close/reopen) | old uses `window.confirm` in ~12 places in scope | **Partial/Missing** | new: only the Close-Year modal; calculate/status/pay/clear/delete/reopen have none (where they exist at all) | Leave/cancel paths too. | Med |
| 76 | Feedback notifications | old inline `H.notice` | Changed | new toasts (`Toast`) | Equivalent. | Low |
| 77 | Dependency on `arrearsApi.caseDetail/adjustCase/setPaymentPlan/clearPaymentPlan/payInstallment/revision/updateRevision` | used by old views | **Defined but unused** | `extended.js:44-56`; `grep` shows zero component references | Dead API surface — the ported screens are missing. | High |

---

## Differences summary

### Validation rules
- **New create form omits** Applicable Service Category, Applicable Employee Category and Remarks
  (`ArrearsPage.jsx:139-144` vs `views-arrears.js:95-98`). Backend still validates the fields it
  receives (`src/services/daRevisions.js:31-83`) but the new UI never sends them, so a revision
  created in React always has `applicableServiceCategory='ALL'` /
  `applicableEmployeeCategory='ALL'` — broader eligibility than the old form allowed.
- New create inputs carry `required`/`noValidate`, but the Create button is a plain `onClick`
  mutation, not a form submit (`ArrearsPage.jsx:124-148`), so browser required-ness never fires.
- All custom-installment validation (line format, >0, unique month, exact sum), installment
  count 1–60, year 2000–2100 bounds, and paid-installment guards live only in the backend
  (`src/services/arrears.js:307-354,258-260,149-154`) and are **unreachable from the new UI**.

### Defaults
- Old custom-installment / installment / single-shot defaults (current month/year, count 6) are
  gone with the plan builder (`views-arrears.js:280-291`).
- Old "Effective To — Leave blank if still open-ended" hint and "Applicable Employee Category …
  or 'ALL'" hint are gone (`views-arrears.js:92,96`).
- Close-Year now has a remarks field (old had none).

### Calculations
- Unchanged (shared backend): revised DA % = previous + increase; per-month
  `arrearsAmount = basicPayApplicable × increasePercent / 100`; month range capped at current
  month; 3-tier basic-pay fallback. None of the calculation **outputs** (ledger, sources, totals)
  are viewable in the new UI.
- New app shows a global "Outstanding Arrears" tile that sums only the *selected* revision's cases
  (`ArrearsPage.jsx:65,109`) — not the old per-revision calculated/effective totals
  (`views-arrears.js:166-176`).

### Status flows
- Revision lifecycle DRAFT→APPROVED→ACTIVE→CLOSED is driven by the same `NEXT_STATUS`
  (`ArrearsPage.jsx:14`), but the new UI offers the transition regardless of status
  allowability and role, and without the old confirmation (`views-arrears.js:191-197`).
- Calculate is offered for all statuses in the new UI; server rejects DRAFT/CLOSED
  (`src/services/arrears.js:212-214`).
- Case lifecycle (CALCULATED→PLAN_SET→PARTIALLY_PAID→FULLY_PAID) is displayed but cannot be
  advanced because no payment-plan/adjust/pay screens exist.

### Monetary values without ₹ / literal `$`
- **None found.** All amounts use `fmt.money` (₹, `frontend/src/api/client.js:213-220`). No literal
  `$` currency symbol in the scoped new files. Percentages (`revisedDaPercent`) render as `N%`
  (`ArrearsPage.jsx:71`) — if the value were null it would render `NaN%` (not money).

### Missing actions
- Calculate exists (no confirm/total). **Missing:** recalculate-with-warning, approve/activate/close
  confirmation, edit draft revision, upload/download/delete GO document, open revision detail,
  open case detail, set/clear payment plan (all three modes), manual adjustment, Pay now,
  download receipt, reopen confirmation, open arbitrary year (Year-End).

### Missing confirmations
- Status change (`views-arrears.js:193`), calculate (`:202`), clear payment plan (`:362`),
  pay installment (`:370`), delete GO document (`:212`), reopen year (`views-org.js:737`) — all
  have **no** equivalent in the new UI (many have no UI at all).

### Missing breakdowns
- Month-by-month arrears ledger + basic-pay source (`views-arrears.js:235-243`).
- Per-revision calculated/effective totals (`:176`).
- Installments table (`:245-258`).
- Year-End per-run table incl. Gross/Deductions/Net per month (`views-org.js:722-728`).
- Year-End "Type (Financial/Calendar)", Status, Closed-on and remarks in the detail card
  (`views-org.js:712-721`).
- Revision detail "Previous DA % / Increase % / Applies to / remarks" (`views-arrears.js:143-148`).

---

## Severity tally
- **High:** 19 rows (#20, 23, 24/25, 26, 32, 33, 34, 35/36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 77)
- **Med:** 30 rows
- **Low:** 15 rows
- **Present / Present-Changed:** 11 rows

## Unused new-API methods (dead port)
`frontend/src/api/extended.js`: `revision` (44), `updateRevision` (46), `caseDetail` (51),
`adjustCase` (52), `setPaymentPlan` (53), `clearPaymentPlan` (54), `payInstallment` (55-56) —
defined but referenced nowhere in `frontend/src`.
