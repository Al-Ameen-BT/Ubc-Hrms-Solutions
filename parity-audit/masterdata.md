# Master Data — OLD vanilla-JS UI vs NEW React UI parity report

Scope: Posts & Cadres; Pay Revisions; Pay Scales + stage ladder; Government Orders register (+ document handling); KSR Rules / Rule References; and related import / validation / status actions.

Reference (OLD, feature-complete): `public/js/views-master.js`, `public/js/components.js`, `public/js/core.js`.
Target (NEW React): `frontend/src/features/org/{PostsCadresPage,PayScalesPage,GovernmentOrdersPage,KsrRulesPage}.jsx`, `frontend/src/api/client.js`, `frontend/src/api/extended.js`, `frontend/src/App.jsx`, `frontend/src/components/Sidebar.jsx`.
Shared backend (unchanged by either UI): `src/routes/{index,payScales,governmentOrderDocuments,crudFactory}.js`, `src/services/{payScaleRevision,payScaleExpr,payScaleLibrary,attachments}.js`, `src/models/*`.

Legend — New status: **Present** (behaviour matched), **Partial** (some but not all), **Missing** (no equivalent), **Changed** (behaviour differs).

---

## 1. Posts & Cadres

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| 1 | Posts list screen | `views-master.js:189-214` (`crudView`, title "Posts & cadres", api `/post-cadres`) | Present | `PostsCadresPage.jsx:12-23,81-94` | Screens exist on both sides. | Low |
| 2 | List search | `views-master.js:60,132-137` (search row over code/name/cadre/etc.) | Present | `PostsCadresPage.jsx:32-37,90` | Client-side filter over name/code/cadre. | Low |
| 3 | Column: Code | `views-master.js:196` | Present | `PostsCadresPage.jsx:59` | | Low |
| 4 | Column: Post name | `views-master.js:197` | Present | `PostsCadresPage.jsx:60` | | Low |
| 5 | Column: Cadre | `views-master.js:198` | Present | `PostsCadresPage.jsx:61` | | Low |
| 6 | Column: Level in cadre | `views-master.js:199` | Present | `PostsCadresPage.jsx:62` | | Low |
| 7 | Column: "Promotes to" (parent post) | `views-master.js:200` resolves `parentsById[r.parentPostId]` | **Missing** | absent (no parent column) `PostsCadresPage.jsx:58-79` | The promotion ladder/parent hierarchy is not shown. | High |
| 8 | Column: Default pay scale | `views-master.js:201` | Partial | `PostsCadresPage.jsx:63` | Shows a scale name, but see #13 (never set on create). | Med |
| 9 | Column: Status badge | `views-master.js:202` (`H.statusBadge` — ACTIVE ok / DRAFT warn / else off) | Present | `PostsCadresPage.jsx:64-68` | Badge variant only 2-way (success/default), no DRAFT styling. | Low |
| 10 | Create form: Code (required) | `views-master.js:205` | Present | `PostsCadresPage.jsx:109` | `required` is visual only (`noValidate`); server notNull is the real guard. | Low |
| 11 | Create form: Post name (required) | `views-master.js:206` | Present | `PostsCadresPage.jsx:110` | | Low |
| 12 | Create form: Cadre | `views-master.js:207` | Present | `PostsCadresPage.jsx:111` | | Low |
| 13 | Create form: Level in cadre (number) | `views-master.js:208` | Present | `PostsCadresPage.jsx:112` | Sent as string; server coerces. | Low |
| 14 | Create form: "Promotes to" (parent post) selector | `views-master.js:209` (`parentPostId` select) | **Missing** | absent — form state `{code,name,cadre,cadreLevel,status}` `PostsCadresPage.jsx:17,109-112` | Cannot define parent/hierarchy at all. Explicit scope item. | High |
| 15 | Create form: Default pay scale selector | `views-master.js:210` (`defaultPayScaleId`) | **Missing** | absent — not in form `PostsCadresPage.jsx:17,109-112` | New posts created with no default scale → employees seeded/selected against the post get no scale. | High |
| 16 | Create form: Status select ACTIVE/INACTIVE (default ACTIVE) | `views-master.js:211` | **Missing** | absent — `status` in state is hard-coded `'ACTIVE'`, no control `PostsCadresPage.jsx:17` | Only ACTIVE ever created (acceptable default but no control). | Low |
| 17 | Edit an existing post (update) | `views-master.js:145` (Edit button per row → `PUT /post-cadres/:id`) `:122` | **Missing** | absent — no edit mutation/row action, only Deactivate `PostsCadresPage.jsx:50-56,73-77` | No way to correct/rename a post or set its parent/scale after creation. | High |
| 18 | Deactivate (soft delete → INACTIVE) with confirm | `views-master.js:156-159`, deleteValue INACTIVE `index.js:30` | Partial | `PostsCadresPage.jsx:50-56,73-77` | Deactivate exists but has **no confirmation prompt** (old used `window.confirm`). | Low |
| 19 | "Show inactive" toggle / hide-deactivated filter | `views-master.js:61,130-137,183` | **Missing** | absent | Inactive rows always show; no way to hide them. | Low |
| 20 | Write roles ORG_ADMIN/HR_ADMIN (UI hides controls) | `views-master.js:193` (`writeRoles`) + `canWrite:14,42` | **Missing** | absent — Add/Deactivate always rendered `PostsCadresPage.jsx:91,73-77` | UI no longer hides write actions for read-only roles (server still 403s). | Med |

## 2. Pay Revisions

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| 21 | Pay Revisions screen/tab | `views-master.js:218-242`; route `:1565`; nav `core.js:365` | **Missing** | absent — no route `App.jsx:92-100`, no nav entry `Sidebar.jsx:13-29`, no page file | API methods exist (`client.js:174-176`) but nothing calls create/update. | High |
| 22 | Columns: Revision name / Effective / Authority (rule) / Status | `views-master.js:228-232` | **Missing** | absent | | High |
| 23 | Create/edit: Name (required) | `views-master.js:235` | **Missing** | absent (`createPayRevision` unused `client.js:175`) | | High |
| 24 | Effective date (required, date) | `views-master.js:236` | **Missing** | absent | Scope item "effective dates". | High |
| 25 | Authorising rule / GO link (`ruleReferenceId`) | `views-master.js:237` | **Missing** | absent | | Med |
| 26 | Status DRAFT/ACTIVE/SUPERSEDED (default DRAFT) | `views-master.js:238` | **Missing** | absent | Scope item "status". | High |
| 27 | Notes (`description`) | `views-master.js:239` | **Missing** | absent | | Low |
| 28 | Supersede (soft delete → SUPERSEDED) + active filter | `views-master.js:224-226`; server `payScales.js:29` | **Missing** | absent | | Med |
| 29 | Write roles incl. PAYROLL_OFFICER | `views-master.js:225` | **Missing** | absent | | Low |

## 3. Pay Scales

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| 30 | Pay Scales list screen + tabs | `views-master.js:218,244-271`; route `:1563` | Partial | `PayScalesPage.jsx:12-98` | List exists; Pay-revisions tab absent (see #21). | Med |
| 31 | Columns: Code / Scale (+expression) / Pay revision / Effective from–to / Status | `views-master.js:251-257` | Partial | `PayScalesPage.jsx:43-51` | Effective **to** never shown (only `effectiveFrom`, `:48`); expression shown `:47`. | Med |
| 32 | Create/edit: Code (required) | `views-master.js:260` | Present | `PayScalesPage.jsx:82` | | Low |
| 33 | Create/edit: Name (required) | `views-master.js:261` | Present | `PayScalesPage.jsx:83` | | Low |
| 34 | Create/edit: Pay revision select (required) | `views-master.js:262` | Present | `PayScalesPage.jsx:85-91` | Not marked required; empty allowed. | Low |
| 35 | Create/edit: "Scale as written" (`scaleExpression`) | `views-master.js:263` | **Missing** | absent — not in form `PayScalesPage.jsx:79-93` | Grade scale expression cannot be captured (shows in list if seeded only). | High |
| 36 | Create/edit: Payable Days (default 31) | `views-master.js:264` | **Missing** | absent — relies on server default `payScale.js:16` | Field removed; payslip "Grade Details" payable days not settable. | Med |
| 37 | Create/edit: Month Days (optional divisor) | `views-master.js:265` | **Missing** | absent | | Med |
| 38 | Create/edit: Effective from (required, date) | `views-master.js:266` | Present | `PayScalesPage.jsx:92` | Not marked required. | Low |
| 39 | Create/edit: Effective to (date) | `views-master.js:267` | **Missing** | absent | Cannot set an end date. | Med |
| 40 | Create/edit: Status ACTIVE/SUPERSEDED (default ACTIVE) | `views-master.js:268` | **Missing** | absent — state `status:'ACTIVE'` only, no control `PayScalesPage.jsx:17` | | Low |
| 41 | Edit existing pay scale (update) | `views-master.js:145` → `PUT /pay-scales/:id` `:122` | **Missing** | absent — only create + stages; `updatePayScale` unused `client.js:180` | No way to correct a scale's name/expression/dates. | High |
| 42 | Supersede (soft delete → SUPERSEDED) | `views-master.js:249`; server `payScales.js:36` | **Missing** | absent | | Med |
| 43 | "Stages" row action | `views-master.js:258` (`#/pay-scales/:id`) | Present | `PayScalesPage.jsx:50,96` (modal) | Implemented as a modal rather than a route — behaviour equivalent. | Low |
| 44 | Write roles incl. PAYROLL_OFFICER (UI gating) | `views-master.js:248` | **Missing** | absent | UI does not gate actions by role. | Low |

## 4. Pay Scale stage ladder

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| 45 | Stage ladder screen (scale code + expression header, breadcrumb) | `views-master.js:273-283` | Partial | `PayScalesPage.jsx:101-146` | Modal titled with scale name; no expression in header. | Low |
| 46 | Guidance text (amounts must rise; saved stages cannot be removed; in-use locked) | `views-master.js:286` | Partial | `PayScalesPage.jsx:187` | Only the in-use note kept; the "amounts must rise" and "cannot be removed" rules dropped from UI. | Low |
| 47 | Table columns: Stage / Basic pay (₹) / Increment / note | `views-master.js:287` | Partial | `PayScalesPage.jsx:148-165` | Columns Stage / Amount / In Use — **no Increment column**. | Med |
| 48 | Increment amount derivation (amount − previous amount, signed, `H.money`) | `views-master.js:289,292` | **Missing** | absent | Increment per stage is never displayed. Scope item "stage increment amounts". | Med |
| 49 | Edit an existing (not-in-use) stage amount inline | `views-master.js:291,302-304` (number input, save via PUT) | **Missing** | absent — amount rendered read-only `PayScalesPage.jsx:159` | A saved stage's amount cannot be corrected; only appending is possible. Server rejects in-use edits (`payScales.js:113-115`) but out-of-use edits are impossible in new UI. | High |
| 50 | In-use lock badge | `views-master.js:293` (`H.badge('In use','role')`) | Present | `PayScalesPage.jsx:160` | | Low |
| 51 | "Unsaved" badge + remove an unsaved stage | `views-master.js:293,305` | **Missing** | absent | Cannot drop a just-added stage before save (must close modal). | Low |
| 52 | Add next stage (numeric input, `min=1`, `>0` validation) | `views-master.js:295,306-312` | Partial | `PayScalesPage.jsx:166-186` | Add exists but no `>0` check and `min` not set; a `0` or negative passes the client (`!newAmount` is false for "0"). | Med |
| 53 | Bulk "Paste several…" stages (newline/comma/semicolon) | `views-master.js:297-299,313-319` | **Missing** | absent | Paste-many helper removed. | Low |
| 54 | Save stages (`PUT /pay-scales/:id/stages`) | `views-master.js:320-328` | Present | `PayScalesPage.jsx:116-125,138-143` | Sends only `{stageNo, amount}`. | Low |
| 55 | Server: stageNo integer ≥1, amount > 0, duplicate detection | `src/routes/payScales.js:89-97` | Present (server) | enforced server-side; no client mirror | New UI relies entirely on error toast. | Low |
| 56 | Server: amounts must strictly rise with stage | `src/routes/payScales.js:99-103` | Present (server) | enforced; no client guidance (see #48) | | Med |
| 57 | Server: cannot remove a saved stage | `src/routes/payScales.js:107-110` | Present (server) | `PayScalesPage.jsx:187` note | | Low |
| 58 | Server: in-use stage amount cannot change | `src/routes/payScales.js:113-115` | Present (server) | note `PayScalesPage.jsx:187` | | Low |
| 59 | Stage list feeds employee "Stage → basic pay" auto-fill | `views-master.js:490-505` | N/A (employee scope) | `NewEmployeePage.jsx:148` | Out of master-data scope; noted only. | Low |

## 5. Government Orders register

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| 60 | GO register list + search | `views-master.js:1439-1517`; route `:1566` | Present | `GovernmentOrdersPage.jsx:12-56` | | Low |
| 61 | Columns: GO number / Date / Issued by / Subject (+document link) / Status | `views-master.js:1445-1451` | Partial | `GovernmentOrdersPage.jsx:36-42` | **No document/external-link column** (the `documentUrl` "Document" link at `views-master.js:1449` is gone). | Med |
| 62 | Create/edit: GO number (required) | `views-master.js:1453` | Present | `GovernmentOrdersPage.jsx:74` | | Low |
| 63 | Create/edit: GO date (required) | `views-master.js:1454` | Present | `GovernmentOrdersPage.jsx:75` | | Low |
| 64 | Create/edit: Issuing authority | `views-master.js:1455` | Present | `GovernmentOrdersPage.jsx:76` | | Low |
| 65 | Create/edit: Status DRAFT/ACTIVE/SUPERSEDED (default DRAFT) | `views-master.js:1456` | **Missing** | absent — no status control `GovernmentOrdersPage.jsx:71-80` | Every GO created in new UI stays DRAFT forever; cannot be activated. | High |
| 66 | Create/edit: Subject | `views-master.js:1457` | Present | `GovernmentOrdersPage.jsx:78` | | Low |
| 67 | Create/edit: "Link to document" (`documentUrl`, external https) | `views-master.js:1458` | **Missing** | absent | External scan link cannot be recorded. | Med |
| 68 | Create/edit: Notes (`description`) | `views-master.js:1459` | Present | `GovernmentOrdersPage.jsx:79` | | Low |
| 69 | Edit existing GO (update) | `views-master.js:145` → `PUT /government-orders/:id` | **Missing** | absent — `updateGovernmentOrder` unused `client.js:166` | No correction path; a mistyped GO number/date is permanent. | High |
| 70 | Supersede (soft delete → SUPERSEDED) with confirm | `views-master.js:1443,156-159`; server `index.js:40` | **Missing** | absent — `deleteGovernmentOrder` unused `client.js:167` | No supersede action. | Med |
| 71 | Scanned-document panel (only when editing an existing GO) | `views-master.js:1461-1475` | **Missing** | absent | Scope item "document upload/preview/download". | High |
| 72 | Document status/meta (label, size KB, uploaded date) | `views-master.js:1476-1487` (`GET .../document`) | **Missing** | absent | Backend endpoint exists `governmentOrderDocuments.js:30-37`; no UI + no API client method. | High |
| 73 | Document upload/replace (pdf/png/jpeg/webp, ≤5 MB, data-URL) | `views-master.js:1489-1504`; server `governmentOrderDocuments.js:49-58`, `attachments.js` MAX_BYTES | **Missing** | absent | No client API method for GO documents; `extended.js:87-97` covers employee docs only. | High |
| 74 | Document preview/open (authenticated blob) | `views-master.js:1484` (`H.openAuthedFile` `components.js:108-117`) | **Missing** | absent | Backend stream route exists `governmentOrderDocuments.js:39-47`. | High |
| 75 | Document remove (with confirm) | `views-master.js:1505-1514`; server `governmentOrderDocuments.js:60-68` | **Missing** | absent | | High |
| 76 | Client 5 MB pre-check with KB count | `views-master.js:1493` | **Missing** | absent | Server still enforces (`attachments.js` `MAX_BYTES`). | Low |
| 77 | Write roles ORG_ADMIN/HR_ADMIN (UI gating) | `views-master.js:1443` | **Missing** | absent | | Low |

## 6. KSR Rules / Rule References

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| 78 | KSR rules list + free-text search | `views-master.js:1523-1538`; route `:1567` | Partial | `KsrRulesPage.jsx:14-63` | New replaces free-text search with a **ruleType dropdown filter** (`:56-59`); no title/part/rule search. | Low |
| 79 | Columns: Rule (title + part/chapter/rule no) / Type / Authority (GO) / In force (from–to) / Verified / Status | `views-master.js:1531-1538` | Partial | `KsrRulesPage.jsx:38-45` | Missing: Authority (GO) column, "In force" dates, and the **Verified** badge column (`views-master.js:1536`). | High |
| 80 | Create/edit: Title (required, wide) | `views-master.js:1540` | Present | `KsrRulesPage.jsx:85` | | Low |
| 81 | Create/edit: Rule type select (required, 8 values, default GENERAL) | `views-master.js:1521,1541`; model enum `ruleReference.js:8-12` | **Changed (buggy)** | `KsrRulesPage.jsx:12,81-83` | New list `['INCREMENT','PAY_FIXATION','LEAVE','ALLOWANCE','PENSION','GENERAL']` contains **PAY_FIXATION** and **ALLOWANCE**, which are **not** in the model enum; and omits PROMOTION, HIGHER_GRADE, PAY_REVISION, SETTLEMENT. Selecting PAY_FIXATION/ALLOWANCE → DB/Sequelize validation error. | High |
| 82 | Create/edit: KSR part / Chapter / Rule number | `views-master.js:1542-1544` | Present | `KsrRulesPage.jsx:87-89` | | Low |
| 83 | Create/edit: "Applies to category" (`applicableEmployeeCategory`) | `views-master.js:1545` | **Missing** | absent — not in form `KsrRulesPage.jsx:77-92` | | Med |
| 84 | Create/edit: "Applies to post" (`applicablePostCadreId` select) | `views-master.js:1546` | **Missing** | absent | Post-scoping of a rule cannot be set. | Med |
| 85 | Create/edit: Authorising GO select (`governmentOrderId`) | `views-master.js:1547` | **Missing** | absent | Rules cannot cite a GO from the register. | Med |
| 86 | Create/edit: In force from / until (`effectiveFrom`/`effectiveTo`) | `views-master.js:1548-1549` | **Missing** | absent | | Med |
| 87 | Create/edit: Status DRAFT/ACTIVE/SUPERSEDED (default DRAFT) | `views-master.js:1550` | **Missing** | absent — no status control; server defaults DRAFT `ruleReference.js:34` | Rules stay DRAFT. | Med |
| 88 | Create/edit: Calculation method | `views-master.js:1551` | **Missing** | absent | | Med |
| 89 | Create/edit: Conditions (JSON, validated parse) | `views-master.js:1552`, JSON parse `:105-108` | **Changed** | `KsrRulesPage.jsx:91` (plain text `Input`) | Sent as a raw string into a JSON column; no JSON validation/pretty formatting. | Med |
| 90 | Create/edit: Rule text / notes (`description`) | `views-master.js:1553` | **Missing** | absent | No place for the rule body text. | Med |
| 91 | Create/edit: "I have verified this rule…" (`isVerified`) checkbox | `views-master.js:1554`; emphasis "A rule is used in calculations only once it is marked verified" `:1526` | **Missing** | absent — no verify control anywhere | Rules created in new UI are never verified → per the app's own rule they are never applied in pay calculations. | High |
| 92 | Edit existing rule (update) | `views-master.js:145` → `PUT /ksr-rules/:id` | **Missing** | absent — `updateKsrRule` unused `client.js:171` | | High |
| 93 | Supersede (soft delete → SUPERSEDED) with confirm | `views-master.js:1527,156-159`; server `index.js:50` | **Missing** | absent — `deleteKsrRule` unused `client.js:172` | | Med |
| 94 | Write roles ORG_ADMIN/HR_ADMIN (UI gating) | `views-master.js:1527` | **Missing** | absent | | Low |

## 7. Cross-cutting: validation, defaults, enums, calc, formatting, imports

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| 95 | Client-side required-field validation before submit | `views-master.js:96-114` (`readForm` throws `"<label> is required."`) | **Missing** | forms are `noValidate` (`PostsCadresPage.jsx:107`, `PayScalesPage.jsx:79`, `GovernmentOrdersPage.jsx:71`, `KsrRulesPage.jsx:77`); `required` is visual only `Input.jsx:9-14` | New UI sends payloads and surfaces only server errors. | Med |
| 96 | Client-side JSON validation for JSON fields | `views-master.js:105-108` (throws "must be valid JSON (or empty)") | **Missing** | `KsrRulesPage.jsx:91` plain string | See #89. | Med |
| 97 | Status enums | ACTIVE/INACTIVE (post), DRAFT/ACTIVE/SUPERSEDED (revision/GO/rule), ACTIVE/SUPERSEDED (scale) `views-master.js:211,238,268,1456,1550` | Partial | defaults hard-coded, no selects: post ACTIVE `PostsCadresPage.jsx:17`; scale ACTIVE `PayScalesPage.jsx:17`; GO no status; rule no status | Only post/scale create defaults preserved; GO/rules stuck at server default DRAFT. | High |
| 98 | Rule-type enum values | 8 values `views-master.js:1521` = model enum `ruleReference.js:8-12` | **Changed** | 6 values, 2 invalid `KsrRulesPage.jsx:12` | See #81 — invalid values reach the DB. | High |
| 99 | Stage-ladder increment derivation | `views-master.js:289,292` | **Missing** | absent | See #48. | Med |
| 100 | Pay-scale expression auto-expansion to stages | `src/services/payScaleExpr.js:14-48`; `payScaleLibrary.js:66,76-79`; `payScaleRevision.js:84,126` | **Missing in UI** | No new-UI action invokes `expandScaleExpression` | The service exists but the new Pay Scale form no longer accepts an expression to expand (see #35). | Med |
| 101 | Super-Admin CSV pay-scale revision apply + template | `src/routes/admin.js:147-176`; `payScaleRevision.js:35-143` | **Missing** | absent — no frontend caller for `/admin/.../pay-scale-template.csv` or `.../pay-scales/bulk-apply` (grep frontend: none) | Backend only; scope item "related import". | Med |
| 102 | Pay-scale library provisioning on org create / bankClass change | `src/services/payScaleLibrary.js:157-169`; `admin.js:182+` | Present (backend, via org create) | `NewOrganisationPage.jsx` (bankClass field) | New UI passes bankClass; provisioning is server-side. | Low |
| 103 | Employee bulk CSV import (template + upload + per-row results) | `views-master.js:512-558` (route `:1560`) | **Missing** | absent — no bulk import in `frontend/src` (grep for bulk/CSV: none) | Adjacent employee scope; references posts/scales by code. | Med |
| 104 | Soft-delete semantics (never hard delete) | `crudFactory.js:179-195` | Present (backend) | only Posts Deactivate surfaces it `PostsCadresPage.jsx:50-56` | GO/scale/revision/rule supersede actions not surfaced (see #42,#70,#93). | Low |
| 105 | Tenant isolation / role enforcement | `crudFactory.js:86-93,105-120` | Present (backend) | n/a | Unchanged; not a UI feature. | Low |
| 106 | Monetary formatting (₹ prefix) | `core.js:195-199` `H.money` = `'₹' + toLocaleString('en-IN')` | Present | `client.js:212-220` `fmt.money` = `Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'})` | Both render ₹. No monetary value in the master-data new UI lacks ₹ (stage amount `PayScalesPage.jsx:159` uses `fmt.money`). | Low |
| 107 | Literal `$` currency symbol anywhere | none in OLD | **None found** | grep `$` in `frontend/src/features/org` and `api`: no literal dollar sign | Clean. | Low |
| 108 | Raw money-like number without symbol | — | Note | `PayScalesPage.jsx:47` renders `scaleExpression` (e.g. `20000-800-24000`) with no ₹ | It is an expression string, not a currency field, but reads as bare amounts. | Low |
| 109 | Date formatting | `core.js:188-194` `H.fmtDay` strips timezone | **Changed** | `client.js:221-225` `fmt.date` uses `new Date(dateStr)` | Potential off-by-one day for `YYYY-MM-DD` parsed as UTC midnight in negative offsets. | Low |
| 110 | Status badge styling | `core.js:216` 3-way (ok/warn/off) | Partial | 2-way (success/default) `PostsCadresPage.jsx:67` etc. | DRAFT/SUPERSEDED indistinguishable. | Low |

---

## 8. Summary of differences

### Missing CRUD actions
- **Posts**: no Edit/update; no parent-post or default-scale capture; no status control (#14,#15,#17).
- **Pay Revisions**: entire screen, create/edit/effective-date/status/supersede, missing (#21–#29).
- **Pay Scales**: no Edit; no Supersede; no `scaleExpression`/`payableDays`/`monthDays`/`effectiveTo` fields (#35–#42).
- **Stage ladder**: no per-stage amount editing; no increment display; no bulk paste; no unsaved remove (#48,#49,#51,#53).
- **Government Orders**: no Edit; no Supersede; no status control (#65,#69,#70).
- **KSR Rules**: no Edit; no Supersede; no verify; missing GO link, post/category scoping, effective dates, calculation-method, description, status (#83–#93).

### Missing document handling (Government Orders)
- No scanned-document panel, no metadata display, no upload/replace, no preview/open, no remove; no 5 MB pre-check (#71–#76). Backend routes (`governmentOrderDocuments.js`) and storage (`attachments.js`) already exist and are simply unused by the new UI; the API client has no GO-document methods (`extended.js:87-97` covers employee docs only).

### Validation / defaults / enums
- New forms use `noValidate`; `required` is presentational, so client-side required + JSON validation were dropped (#95,#96).
- Rule-type enum mismatch: **PAY_FIXATION** and **ALLOWANCE** are not in the model enum and **PROMOTION/HIGHER_GRADE/PAY_REVISION/SETTLEMENT** are unreachable; selecting the new-only values fails server-side (#81,#98).
- Payable Days default of 31 now relies solely on the server default (#36).
- `conditions` sent as a raw string to a JSON column without validation (#89).

### Calculations
- Stage-ladder **increment amount** derivation (amount − previous, signed) was dropped (#48).
- Pay-scale **expression → stage auto-expansion** service is not reachable from any new-UI form (#100).

### Status handling
- Only Posts and Pay Scales keep a create-time status; GO and KSR rules are created at the server default `DRAFT` with no way to activate or supersede, and KSR rules can never be marked verified (#65,#87,#91,#97).

### Monetary display
- No literal `$` anywhere in the new master-data UI. All money goes through `fmt.money` (INR/₹). The one non-currency numeric string on screen is the raw `scaleExpression` (#108).

### Missing import actions
- Super-Admin CSV pay-scale revision **template + bulk-apply** exists only on the backend, with no new-UI entry point (#101).
- Employee **bulk CSV import** (template/upload/per-row results) is absent from the new UI (#103).

---

## 9. High-severity gaps (quick list)
1. Pay Revisions screen entirely absent (#21–#29).
2. Posts: parent/hierarchy selector & column absent (#7,#14).
3. Posts: default pay scale cannot be set on create (#15).
4. Posts: no Edit/update action (#17).
5. Pay Scales: `scaleExpression` not capturable (#35).
6. Pay Scales: no Edit/update action (#41).
7. Stage ladder: existing (non-in-use) stage amounts not editable (#49).
8. KSR: rule-type enum contains invalid values (PAY_FIXATION, ALLOWANCE) (#81,#98).
9. KSR: "Verified" toggle absent → rules never used in calculations (#91).
10. KSR: no Edit action; most fields absent (#83–#93).
11. Government Orders: no status control → all GOs stuck DRAFT (#65).
12. Government Orders: no Edit action (#69).
13. Government Orders: scanned-document upload/preview/download/remove all missing (#71–#75).
14. Posts/Scales: UI no longer hides write actions from read-only roles (#20,#44,#77,#94).
