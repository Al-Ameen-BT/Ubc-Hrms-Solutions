# Employees Master / Service Book / Sub-resources — OLD vs NEW parity report

Scope: Employees master (list, create, edit, deactivate, filters/search/sort, columns, pagination),
Bulk import, Digital Service Book (timeline, non-pay events, documents), and every employee
sub-resource: bank accounts (SB/OD/RD/OTHER/LIC), festival advance, overdraft (OD), recurring
deposit (RD), LIC, housing loan, vehicle loan, employee documents, attendance / LOP / leave-on-behalf.

Reference (OLD, feature-complete): `public/js/views-master.js`, `public/js/components.js`, `public/js/core.js`.
Target (NEW React): `frontend/src/features/employees/**`, `frontend/src/features/employee/EmployeePortalPage.jsx`,
`frontend/src/api/client.js`, `frontend/src/api/extended.js`, routes in `frontend/src/App.jsx`.
Shared backend: `src/routes/serviceBook.js`, `src/services/{loans,attendance,documents,orgFields}.js`, `src/models/employee*.js`.

Method: read-only. Read OLD `crudView` + employee/service-book/bulk/loans/bank/document/attendance/leave
sections line-by-line, read all NEW employee React files, API clients and router, then diffed feature by
feature. `Present` = implemented in the React app; `Partial` = implemented but missing fields/rules/actions;
`Missing` = no equivalent; `Changed` = exists but behaves differently.

> Headline: the NEW React employee area is a thin slice. It ships only a **list** (`/employees`),
> a **create wizard** (`/employees/new`) and an **employee detail** page (`/employees/:id`) that shows a
> service-book timeline, a pay-history table and leave balances. **There is no edit, no deactivate, no bulk
> import, no bank accounts, no loans (FA/OD/RD/LIC/housing/vehicle), no attendance/LOP, no employee
> documents, and no payslip preview** in the React UI. The separate `ServiceBookPage.jsx` is not routed and
> is broken (reads a non-existent `serviceBook.entries`).

---

## 1. Master feature / rule table

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| **Employees list** | | | | | | |
| 1 | Employees list screen | Config-driven `crudView` list, `/employees` — `views-master.js:348-508` | Partial | `EmployeesPage.jsx:10-77` | Exists but far fewer columns/actions; no edit/deactivate/service-book/keeps everything client-side | Med |
| 2 | List loads all employees | `H.api('GET','/employees')` then client-side filter — `views-master.js:168-171` | Present | `EmployeesPage.jsx:14-17` (`masterDataApi.employees()`) | Same pattern; crudFactory ignores search/limit (`crudFactory.js:111-126`) | Low |
| 3 | Search box | Filter on empCode+name+post name+grade+category — `views-master.js:455`, `:133-137` | Partial | `EmployeesPage.jsx:26-33` | NEW searches name+empCode+department only; **post name, grade, category no longer searchable** | Med |
| 4 | "Show inactive" toggle | `#crud-inactive` checkbox, hides non-ACTIVE by default — `views-master.js:61`, `:130`, `:135`, `:183` | Missing | absent | NEW always shows every row (`employees()` unfiltered) so deactivated records are always visible; no filter to hide them | Med |
| 5 | Column: Emp. code | `views-master.js:457` | Present | `EmployeesPage.jsx:36` | — | — |
| 6 | Column: Name | `views-master.js:458` | Present | `EmployeesPage.jsx:37` | — | — |
| 7 | Column: Post (name resolved) | `views-master.js:459` | Present | `EmployeesPage.jsx:38`, `:24` | — | — |
| 8 | Column: Joined (date) | `views-master.js:460` | Present | `EmployeesPage.jsx:42` | — | — |
| 9 | Column: Basic pay (₹) | `views-master.js:461` (`H.money`) | Present | `EmployeesPage.jsx:40` (`fmt.money`) | — | — |
| 10 | Column: Service status (`employmentStatus` in-service badge) | `views-master.js:462` | Missing | absent | NEW dropped it; only record `status` shown | Med |
| 11 | Column: Record status (ACTIVE/INACTIVE badge) | `views-master.js:463` | Changed | `EmployeesPage.jsx:41` | NEW shows `row.status` but labels it "Status"; old showed both service status and record status | Low |
| 12 | Column: Department | (old shows department only inside form) | Present (added) | `EmployeesPage.jsx:39` | NEW adds Department column | Low |
| 13 | Row action: "Service book" link | `views-master.js:465` | Changed | `EmployeesPage.jsx:68` | NEW row click opens `/employees/:id` detail (which contains the timeline); no explicit button label | Low |
| 14 | Sort columns | none (rendered in API order) — `views-master.js:142-149` | Present (added) | `Table.jsx:4-23`, `EmployeesPage.jsx:63-70` | NEW generic sort; Post sorts by raw `postCadreId`, not name | Low |
| 15 | Pagination | none (renders all rows) — `views-master.js:132-149` | Missing (both) | `EmployeesPage.jsx:71-73` (count only) | Neither has pagination; backend returns all rows (`crudFactory.js:121`). NEW shows a bare count | Low |
| 16 | Empty state | `views-master.js:138-141` ("No employees yet / Use New employee") | Present | `EmployeesPage.jsx:69` | — | — |
| **Create / Edit employee** | | | | | | |
| 17 | Create employee form | 48-field `crudView` form — `views-master.js:354-432`, `:81-128` | Partial | `NewEmployeePage.jsx:28-197` | NEW 5-step wizard with ~18 fields; most payroll/statutory/contact fields absent | High |
| 18 | Edit employee | `openForm(row)` + `PUT /employees/:id` — `views-master.js:81-94`, `:122` | Missing | `masterDataApi.updateEmployee` defined but **never called** (`client.js:187`) | No edit page/action anywhere in React | High |
| 19 | `empCode` (required) | `views-master.js:356` | Present | `NewEmployeePage.jsx:86` | — | — |
| 20 | `name` (required) | `views-master.js:357` | Present | `NewEmployeePage.jsx:85` | — | — |
| 21 | `fatherName` | `views-master.js:358` | Missing | absent | — | Med |
| 22 | `spouseName` | `views-master.js:359` | Missing | absent | — | Low |
| 23 | `gender` (MALE/FEMALE/OTHER, blank allowed) | `views-master.js:360` | Changed | `NewEmployeePage.jsx:88-95` | NEW defaults `MALE`, has no blank/"—" option | Med |
| 24 | `dob` | `views-master.js:361` | Present | `NewEmployeePage.jsx:87` | NEW forces it required in step-0 gate | — |
| 25 | `bloodGroup` (8 enum values) | `views-master.js:362` | Missing | absent | — | Low |
| 26 | `educationalQualification` | `views-master.js:363` | Missing | absent | — | Low |
| 27 | `panNumber` | `views-master.js:366` | Partial | `NewEmployeePage.jsx:108` | NEW auto-uppercases; **hardcoded `required`** (old only required if org config says so) | Med |
| 28 | `aadhaarNumber` | `views-master.js:367` | Partial | `NewEmployeePage.jsx:109` | Hardcoded required; no 12-digit validation in old either | Med |
| 29 | `uanNumber` | `views-master.js:368` | Missing | absent | — | Med |
| 30 | `pfNumber` | `views-master.js:369` | Missing | absent | — | Med |
| 31 | `officeEmail` | `views-master.js:372` | Missing | absent | — | Low |
| 32 | `personalEmail` | `views-master.js:373` | Partial | `NewEmployeePage.jsx:110` | Hardcoded required | Med |
| 33 | `residenceAddress` | `views-master.js:374` | Missing | absent | — | Low |
| 34 | Emergency contact name/number/relation | `views-master.js:375-377` | Missing | absent | — | Med |
| 35 | Salary bank fields `bankName`/`bankAccountNumber`/`bankIfsc` | `views-master.js:380-382` | Partial | `NewEmployeePage.jsx:159-161` | Present as own step but **all three forced required** (old optional unless org config) | Med |
| 36 | `doj` (required) | `views-master.js:385` | Present | `NewEmployeePage.jsx:118` | — | — |
| 37 | `doa` (date of appointment to present post) | `views-master.js:386` | Missing | absent | — | Med |
| 38 | `dateOfConfirmation` (with hint) | `views-master.js:387` | Missing | absent | — | Med |
| 39 | `employmentType` (REGULAR/PART_TIME_CONTINGENT) | `views-master.js:388` | Missing | absent | NEW cannot create Part-Time Contingent | Med |
| 40 | Part-Time Contingent auto-selects PART_TIME post + scale | `views-master.js:478-489` | Missing | absent | Depends on #39 | Med |
| 41 | `postCadreId` (required, ACTIVE posts only, code—name label) | `views-master.js:390` | Partial | `NewEmployeePage.jsx:120-125` | NEW lists all posts (name only; no code; no ACTIVE filter) | Med |
| 42 | `designation` | `views-master.js:391` | Partial | `NewEmployeePage.jsx:126` | Present & marked required, but **not in `canAdvance()` gate** (`:57-62`) so it is not enforced | Low |
| 43 | `department` | `views-master.js:392` | Present | `NewEmployeePage.jsx:127` | — | — |
| 44 | `branchName` / `branchCode` | `views-master.js:393-394` | Missing | absent | — | Med |
| 45 | `category` | `views-master.js:395` (free text) | Changed | `NewEmployeePage.jsx:97-104` | NEW turns it into fixed enum GENERAL/SC/ST/OBC (old free text) | Med |
| 46 | `currentPayScaleId` (Grade, ACTIVE scales only) | `views-master.js:396` | Partial | `NewEmployeePage.jsx:135-139` | Present; NEW lists all scales, name only (no code) | Low |
| 47 | `currentStageId` — stages load on scale change | `views-master.js:490-500` | Present | `NewEmployeePage.jsx:41-45`, `:143-149` | NEW fetches stages via query; disabled until scale chosen | — |
| 48 | Picking a stage auto-fills `currentBasicPay` | `views-master.js:501-504` | Present | `NewEmployeePage.jsx:143-146` | — | — |
| 49 | `currentBasicPay` (₹) | `views-master.js:399` | Present | `NewEmployeePage.jsx:151` | — | — |
| 50 | `employeeSpecificIncrementDate` | `views-master.js:400` | Missing | absent | — | Med |
| 51 | `lastPromotionDate` | `views-master.js:401` | Missing | absent | — | Med |
| 52 | `dateOfRetirement` (override) | `views-master.js:402` | Missing (edit) | `EmployeeDetailPage.jsx:78` shows auto value read-only | No way to set/override the explicit value in NEW | Med |
| 53 | `employmentStatus` (ACTIVE/LWA/SUSPENDED/BREAK/RESIGNED/RETIRED/TERMINATED) | `views-master.js:403` | Missing | absent | NEW create always ACTIVE; no status change UI | High |
| 54 | `status` (record ACTIVE/INACTIVE) | `views-master.js:404` | Missing | absent | — | Med |
| 55 | `daType` (VARIABLE/FIXED/BOTH) | `views-master.js:409` | Missing | absent | — | High |
| 56 | `fixedDaAmount` | `views-master.js:411` | Missing | absent | — | High |
| 57 | `riskAllowance` | `views-master.js:412` | Missing | absent | — | High |
| 58 | `otherAllowance` | `views-master.js:413` | Missing | absent | — | High |
| 59 | `ccaOptIn`/`ccaAmount` (tribool + amount) | `views-master.js:414-415` | Missing | absent | — | High |
| 60 | `conveyanceOptIn`/`conveyanceAmount` (tribool + amount) | `views-master.js:416-417` | Missing | absent | — | High |
| 61 | `vpfPercent` | `views-master.js:420` | Missing | absent | — | High |
| 62 | `welfareFundOptIn`/`welfareFundAmount` | `views-master.js:421-422` | Missing | absent | — | High |
| 63 | `gsliOptIn`/`gsliAmount` (tribool + rule note) | `views-master.js:423-426` | Missing | absent | — | High |
| 64 | `ptAmount` (Professional Tax) | `views-master.js:427` | Missing | absent | — | High |
| 65 | `taxRegime` (NEW/OLD) | `views-master.js:430` | Missing | absent | — | High |
| 66 | `taxOtherDeductions` | `views-master.js:431` | Missing | absent | — | High |
| 67 | Mandatory fields applied from org config | Fetch `/org/mandatory-fields`, flip `f.required` — `views-master.js:340-347`, `:440-447` | Missing | absent | NEW hardcodes required PAN/Aadhaar/email/bank; ignores org policy. Endpoint exists (`orgSettings.js:129`) but no React settings UI either | High |
| 68 | Required-field validation before save | `readForm()` throws `"<label> is required."` — `views-master.js:110`; save disabled by step gate | Partial | `NewEmployeePage.jsx:56-62` | NEW gates only name/empCode/dob/gender, doj, scale/stage/basic, bank; other `required` marks unenforced client-side; server enforces mandatory config | Med |
| 69 | JSON fields (`conditions`-style) — not used on employee | n/a | n/a | n/a | — | — |
| 70 | Save success/error notice | Inline notice + "created" message — `views-master.js:123-127` | Partial | `NewEmployeePage.jsx:47-54`, toast | NEW uses toast; on error inline `auth-error` | Low |
| **Deactivate / reactivate** | | | | | | |
| 71 | Deactivate (soft-delete) button | `DELETE /employees/:id` sets status INACTIVE — `views-master.js:146`, `:155-159` | Missing | absent | No deactivate anywhere in React | High |
| 72 | Deactivate confirmation dialog | `window.confirm("Deactivate this employee? …")` — `views-master.js:156` | Missing | absent | — | High |
| 73 | Inactive row muted styling | `.row-muted` — `views-master.js:147` | Missing | `EmployeesPage.jsx:41` shows INACTIVE badge only | Cosmetic | Low |
| **Bulk import** | | | | | | |
| 74 | Bulk import page (`/employees/bulk-import`) | `viewEmployeeBulkImport` — `views-master.js:512-558`, route `:1560` | Missing | absent (no route in `App.jsx:84-86`) | Not present at all | High |
| 75 | Download CSV template button | `GET /employees/bulk-template.csv` blob download — `views-master.js:518`, `:528-537` | Missing | absent | Backend endpoint still exists (`serviceBook.js:63`) | High |
| 76 | Pick file / paste CSV textarea | FileReader into textarea — `views-master.js:520-524`, `:538-543` | Missing | absent | — | High |
| 77 | Run import + summary notice | `POST /employees/bulk-import`; "N created, M failed (of T)" — `views-master.js:544-557` | Missing | absent | — | High |
| 78 | Per-row results table (Row/Code/Result/Error) | `views-master.js:551-555` | Missing | absent | — | High |
| 79 | Bulk import header hint (codes, 1000-row cap) | intro text — `views-master.js:514` | Missing | absent | — | Low |
| **Service Book — screen & header** | | | | | | |
| 80 | Service Book screen | `viewServiceBook` at `/employees/:id/service-book` — `views-master.js:1349-1435`, route `:1561` | Partial | `EmployeeDetailPage.jsx:17-198` (tab) | Moved into detail tabs; separate `ServiceBookPage.jsx` exists but is **unrouted** (`App.jsx` has no import/route) and reads `serviceBook.entries` which the API never returns (`ServiceBookPage.jsx:22`) — dead/broken | High |
| 81 | Breadcrumb + empCode/Post header | `views-master.js:1356` | Present | `EmployeeDetailPage.jsx:60-64` | — | — |
| 82 | "Present position" details (DOB, DOJ, DOA, confirmation, post, grade, stage, basic, service status) | `views-master.js:1358-1375` | Partial | `EmployeeDetailPage.jsx:73-79` | NEW shows only Basic Pay, Grade, Stage, DOJ, Retirement. **DOB, DOA, confirmation-date-combining, Post, service status omitted** | Med |
| 83 | Combined "appointment / confirmation" row when dates match | `views-master.js:1364-1367` | Missing | absent | Depends on DOA/confirmation (#37/#38) | Low |
| 84 | Effective retirement date (auto from DOB, "(auto)" marker) | `views-master.js:1373-1374` | Partial | `EmployeeDetailPage.jsx:78` | Value shown; no "(auto, from DOB)" marker | Low |
| **Service Book — payslip preview** | | | | | | |
| 85 | Estimated payslip card (earnings/deductions/net + LOP note) | `payslipCard` — `views-master.js:617-663`, `:1376` | Missing | absent | No payslip preview anywhere in React | High |
| 86 | Grade Details card (name, scale, payable days, month days) | `gradeDetailsCard` — `views-master.js:570-578`, `:623` | Missing | absent | — | Med |
| 87 | Loan & Interest Details card (FA/OD/housing/vehicle principal, interest, total, this-month) | `loanInterestCard` — `views-master.js:587-607`, `:662` | Missing | absent | — | High |
| 88 | Download Payslip PDF button | `GET /employees/:id/payslip.pdf` via `H.downloadFile` — `views-master.js:672-681`, `:741` | Missing | absent | Backend endpoint exists (`serviceBook.js:387`) | High |
| 89 | Refresh payslip after loan/attendance change | `refreshPayslipCard` — `views-master.js:738-745` | Missing | absent | Moot without #85 | High |
| **Service Book — timeline** | | | | | | |
| 90 | Chronological timeline (count + ordered list) | `d.timeline`, `timelineCount` — `views-master.js:1392-1403` | Present | `EmployeeDetailPage.jsx:90-114` | — | — |
| 91 | Timeline row: date + event type label | `views-master.js:1395` | Present | `EmployeeDetailPage.jsx:96-98` | — | — |
| 92 | Timeline row: order/reference no. | `views-master.js:1396` | Present | `EmployeeDetailPage.jsx:107` | — | — |
| 93 | Timeline row: pay change (previous → new basic) | `views-master.js:1397` | Partial | `EmployeeDetailPage.jsx:99-104` | NEW shows new + "(from prev)" only; both use `fmt.money` | Low |
| 94 | Timeline row: linked Government Order number | `views-master.js:1398` | Present | `EmployeeDetailPage.jsx:105` | — | — |
| 95 | Timeline row: Rule reference title | `views-master.js:1399` | Changed | `EmployeeDetailPage.jsx:106` | NEW shows `ruleNumber || title` | Low |
| 96 | Timeline row: remarks | `views-master.js:1400` | Present | `EmployeeDetailPage.jsx:108` | — | — |
| 97 | Timeline row: open attached document | Link → `openAuthedFile(/…/document/file)` — `views-master.js:1401`, `:1410-1416` | Partial | `EmployeeDetailPage.jsx:109` | NEW shows a "Document" **badge only — not clickable/openable** | Med |
| 98 | Empty timeline state | `views-master.js:1402` ("No entries yet.") | Present | `EmployeeDetailPage.jsx:112` | — | — |
| 99 | Pay History table (Date/Event/Previous/New Basic) | derived from timeline PayHistoryEntry (partly via old timeline + payroll drill-down) | Present (added view) | `EmployeeDetailPage.jsx:117-142` | NEW adds a dedicated tab | Low |
| **Service Book — add non-pay event** | | | | | | |
| 100 | Add entry form (append-only, permanent) | `views-master.js:1382-1391`, `:1417-1433` | Partial | `EmployeeDetailPage.jsx:173-196` | NEW modal has only 3 inputs | High |
| 101 | Event type select (10 NON_PAY_EVENTS, default OTHER) | `enumOptions(EVENT_TYPES)` — `views-master.js:1385`, `:562` | Changed | `EmployeeDetailPage.jsx:15`, `:188-190` | NEW same list but default `CONFIRMATION` (old default `OTHER`) | Low |
| 102 | Event date (required, defaults today) | `views-master.js:1386`, `:1421` | Partial | `EmployeeDetailPage.jsx:192` | Present but **no default today, no client-side required validation/message** (server rejects empty) | Med |
| 103 | Order / reference no. (max 128) | `views-master.js:1387` | Missing | absent | Field dropped from NEW modal | Med |
| 104 | Government Order select (GO list) | `refOptions(gos)` — `views-master.js:1388` | Missing | absent | GO list not fetched in detail page | Med |
| 105 | Remarks (textarea) | `views-master.js:1389` | Partial | `EmployeeDetailPage.jsx:193` | NEW uses single-line Input, not textarea | Low |
| 106 | Attach a document (optional, PDF/PNG/JPEG/WebP ≤5 MB) | `views-master.js:1390`, `:1423-1429` | Missing | absent | NEW modal has no file input / documentDataUrl | High |
| 107 | Confirm before adding ("cannot be edited or removed") | `window.confirm(...)` — `views-master.js:1422` | Missing | absent | NEW adds directly with no confirmation | Med |
| 108 | Document >5 MB error | `views-master.js:1425` | Missing | absent | Moot without #106 | Med |
| **Bank accounts** | | | | | | |
| 109 | Bank accounts card/list | `bankAccountsCard`, table Type/No/Bank/IFSC/Branch/Status — `views-master.js:1142-1169`, `:1379` | Missing | absent | Whole sub-resource absent | High |
| 110 | Add account (type SB/OD/RD/OTHER, default SB; number required) | `views-master.js:1171-1191` | Missing | absent | Backend `serviceBook.js:516-534` | High |
| 111 | Edit account (bank/IFSC/branch/status) | `views-master.js:1192-1212` | Missing | absent | — | High |
| 112 | Delete account (confirm; Org/HR admin only) | `views-master.js:1213-1223` | Missing | absent | — | High |
| 113 | Salary credit account selector (`salaryCreditAccountId`) | `views-master.js:1226-1238` | Missing | absent | — | High |
| 114 | Duplicate account-number error surfaced | backend — `serviceBook.js:531` | Missing | absent | — | Low |
| **Festival Advance** | | | | | | |
| 115 | FA list (Amount/Availed/Repay over/Monthly/Balance + Repaid badge) | `drawFestivalAdvance` — `views-master.js:903-939`, `loanRow:880-883` | Missing | absent | — | High |
| 116 | Record FA (amount ≤ 1 month Basic+DA, date default today) | `views-master.js:911-930` | Missing | absent | Backend `serviceBook.js:586-617` | High |
| 117 | Shorten repayment period (max = current) | `views-master.js:917-937` | Missing | absent | — | High |
| 118 | Delete FA (confirm; restricted) | `↳ wireLoanDelete` — `views-master.js:938` | Missing | absent | — | Med |
| 119 | FA shown in Loan & Interest Details / payslip deduction | `loanInterestCard`, `payslipCard` — `views-master.js:590`, `:646` | Missing | absent | — | High |
| **Overdraft (OD)** | | | | | | |
| 120 | OD eligibility text (ceiling = 15×Basic+DA capped by org max; retirement-capped months; current rate) | `views-master.js:945-948` | Missing | absent | Calculation survives in `services/loans.js:82-98` but not surfaced | High |
| 121 | OD list (Amount/Availed/Repay/Rate/Interest/Monthly/Balance + Repaid) | `views-master.js:949-958` | Missing | absent | — | High |
| 122 | Record OD (amount ≤ ceiling, months ≤ max, rate editable, single active OD) | `views-master.js:959-977` | Missing | absent | Backend `serviceBook.js:653-705` | High |
| 123 | OD → linked OD-type bank account selector | `views-master.js:965`, `:971` | Missing | absent | — | High |
| 124 | OD interest snapshot note ("locked on the day availed") | `views-master.js:957` | Missing | absent | — | Med |
| 125 | Delete OD (confirm; restricted) | `views-master.js:978` | Missing | absent | — | Med |
| **Recurring Deposit (RD)** | | | | | | |
| 126 | RD list (Monthly/Since/Linked Overdraft/Status) | `drawRecurringDeposit` — `views-master.js:1103-1138` | Missing | absent | — | High |
| 127 | Record RD — only when an active OD exists; defaults to OD instalment | `views-master.js:1117-1135` | Missing | absent | Backend `serviceBook.js:717-756` | High |
| 128 | RD → linked RD-type bank account selector | `views-master.js:1121` | Missing | absent | — | High |
| 129 | Message "RD requires an active Overdraft" | `views-master.js:1124-1125` | Missing | absent | — | Med |
| 130 | Delete RD (confirm; restricted) | `views-master.js:1137` | Missing | absent | — | Med |
| **LIC** | | | | | | |
| 131 | LIC list (Policy/Opened/Started/Deduction/Sum assured/Maturity/Status) | `drawLic` — `views-master.js:981-1016` | Missing | absent | — | High |
| 132 | Add LIC (opening + started date, deduction>0, sum assured>0, maturity optional) | `views-master.js:993-1014` | Missing | absent | Backend `serviceBook.js:790-811` | High |
| 133 | Delete LIC (confirm; restricted) | `views-master.js:1015` | Missing | absent | — | Med |
| **Housing loan** | | | | | | |
| 134 | Housing loan list (Amount/Rate/EMI start/end/Period/EMI/Status) | `drawHousingLoan` — `views-master.js:1018-1049` | Missing | absent | — | High |
| 135 | Add Housing loan (amount>0, rate, both dates; end>start) | `views-master.js:1031-1047` | Missing | absent | Backend `serviceBook.js:840-865` | High |
| 136 | Reducing-balance EMI note/disclosure | `views-master.js:1029` | Missing | absent | Calc in `services/loans.js:162-175` | Med |
| 137 | Delete Housing loan (confirm; restricted) | `views-master.js:1048` | Missing | absent | — | Med |
| **Vehicle loan** | | | | | | |
| 138 | Vehicle loan list (Amount/Vehicle/Start/End/Period/Rate/EMI/Status) | `drawVehicleLoan` — `views-master.js:1051-1101` | Missing | absent | — | High |
| 139 | Add Vehicle loan (amount, type, dates; rate→EMI or manual EMI when rate blank) | `views-master.js:1066-1090` | Missing | absent | Backend `serviceBook.js:897-950` | High |
| 140 | Multiple-loans-allowed toggle awareness + one-active message | `views-master.js:1055`, `:1075-1076` | Missing | absent | Setting read from backend; not surfaced | Med |
| 141 | Manual-EMI fallback validation ("enter EMI or rate") | `views-master.js:1085` | Missing | absent | — | Med |
| 142 | Delete Vehicle loan (confirm; restricted) | `views-master.js:1091-1100` | Missing | absent | — | Med |
| **Attendance / LOP** | | | | | | |
| 143 | Attendance & LOP card with year selector | `attendanceCard`, `:752-759`; year change reload — `:1409` | Missing | absent | — | High |
| 144 | 12-month grid (Month / Payable-day LOP / Remarks) | `drawAttendance` — `views-master.js:766-792` | Missing | absent | — | High |
| 145 | Save LOP per month (0–31 step 0.5, remarks ≤500) | `views-master.js:779-790` | Missing | absent | Backend `serviceBook.js:442-455` | High |
| 146 | LOP recalculates payslip | `refreshPayslipCard` — `views-master.js:787` | Missing | absent | — | High |
| **Employee documents** | | | | | | |
| 147 | Documents card + list (Type/Label/Size/Uploaded) | `documentsCard`/`drawDocuments` — `views-master.js:802-838` | Missing | `documentApi.list/upload/remove` defined (`extended.js:88-97`) but **never used** | API client exists, no UI | High |
| 148 | Upload (type select, optional label, file; PDF/PNG/JPEG/WebP ≤5 MB) | `views-master.js:839-876` | Missing | absent | — | High |
| 149 | View document in new tab (authed fetch) | `openDocument` — `views-master.js:817-827`, `:848-850` | Missing | absent | — | High |
| 150 | Delete document (confirm) | `views-master.js:851-860` | Missing | absent | — | Med |
| 151 | docType labels map (PAN/AADHAR/EDUCATION_CERTIFICATE/PHOTO/OTHER) | `views-master.js:797-801` | Missing | absent | — | Low |
| **Leave** | | | | | | |
| 152 | Leave balances table (Opening/Accrued/Availed/Closing + year) | `drawLeaveBalances` — `views-master.js:1271-1280` | Partial | `EmployeeDetailPage.jsx:144-171` | NEW shows balances but **no year caption** | Low |
| 153 | Leave applications list (type/from/to/days/status/reason) | `drawLeaveApplications` — `views-master.js:1282-1321` | Partial | `LeavePage.jsx:35-39`, `:169-170` (org Leave screen, not employee detail) | Exists on the Leave page, not in the employee record | Med |
| 154 | File leave on behalf (type/from/to/reason) | `drawFileLeaveForm` — `views-master.js:1329-1347` | Present | `LeavePage.jsx:71-75`, `:224-239` | Works, but on the Leave page | Low |
| 155 | Approve / Reject leave | `decideLeaveApp`; reject prompts reason — `views-master.js:1290-1309`, `:1323-1327` | Partial | `LeavePage.jsx:77-81`, `:126-127` | NEW Approve/Reject present but **Reject collects no reason** (old `window.prompt`) | Med |
| 156 | Cancel leave application (confirm) | `views-master.js:1294-1320` | Missing | absent | `leaveApi.cancelApplication` defined (`extended.js:21`) but unused | Med |
| 157 | "No balances yet for YEAR" / "No applications" states | `views-master.js:1273`, `:1285` | Present | `EmployeeDetailPage.jsx:166`, `EmptyState` | — | Low |
| 158 | In-service / record badges in leave rows | `views-master.js:1298` | Present | `LeavePage.jsx` app columns | — | Low |

---

## 2. Validation-rule differences

| Rule | OLD | NEW | Severity |
|---|---|---|---|
| Required fields come from org config | Fetched `/org/mandatory-fields` and mutated `f.required` in place (`views-master.js:440-447`) | **Ignored**; PAN/Aadhaar/email/bank hardcoded `required` (`NewEmployeePage.jsx:108-110,159-161`) | High |
| Client-side required check | Generic `if (f.required && (v===''||v===null)) throw "<label> is required."` (`views-master.js:110`) | Only step gates (`NewEmployeePage.jsx:56-62`); no per-field error text | Med |
| `designation` required | Not required in old | Marked `required` (`:126`) but not gated → inconsistent | Low |
| Gender mandatory | Blank allowed (—) | Defaults MALE, no blank | Med |
| Account number required | Yes (`views-master.js:1185`) | Step-3 gate requires bankName+account+IFSC | — |
| FA amount ≤ 1 month Basic+DA | Hint + server reject (`views-master.js:913`, `serviceBook.js:601`) | Not implemented | High |
| OD amount ≤ eligibility ceiling; months ≤ retirement-capped max | `max` attr + server (`views-master.js:961-963`, `serviceBook.js:666`) | Not implemented | High |
| OD "one unrepaid at a time" | Form hidden when active OD (`views-master.js:959`) | Not implemented | High |
| RD requires an active OD | Form/message (`views-master.js:1117-1125`) | Not implemented | High |
| LIC deduction>0 & sum assured>0 & both dates | `views-master.js:1009` | Not implemented | High |
| Housing/Vehicle end date > start date | Server (`serviceBook.js:853,921`) | Not implemented | High |
| Vehicle manual-EMI fallback | `views-master.js:1085` | Not implemented | Med |
| Attendance LOP 0–31 | `min/max` attrs + server (`views-master.js:772`, `serviceBook.js:451`) | Not implemented | High |
| Document ≤5 MB & type sniff | Client check + `services/documents.js` | Not implemented | High |
| Service-book event: date required, append-only, non-pay only | `views-master.js:1421-1422`; server `serviceBook.js:284-292` | NEW date not pre-validated, no confirm; server still enforces | Med |
| Service-book attach ≤5 MB | `views-master.js:1425` | Not implemented | High |

## 3. Mandatory-field handling

- OLD: `MANDATORY_FIELD_APPLY_MAP` maps `bankDetails → [bankName, bankAccountNumber, bankIfsc]`; org config drives `required` (`views-master.js:340-347`).
- NEW: no `/org/mandatory-fields` fetch anywhere in `frontend/src`; **no Settings → Mandatory Fields page** either, though the endpoint exists (`src/routes/orgSettings.js:129`). Result: org policy is neither editable nor honoured in the React UI. **High.**

## 4. Calculations / defaults / enums differences

| Item | OLD | NEW | Severity |
|---|---|---|---|
| Default gender | blank/"—" | `MALE` (`NewEmployeePage.jsx:21`) | Low |
| Default category | free text | `GENERAL` (`NewEmployeePage.jsx:21`) | Low |
| Default employment type | `REGULAR` (`views-master.js:388`) | not a field | Med |
| Default event type | `OTHER` (`views-master.js:1385`) | `CONFIRMATION` (`EmployeeDetailPage.jsx:24`) | Low |
| Basic pay auto-fill from stage | Yes (`views-master.js:503`) | Yes (`NewEmployeePage.jsx:145`) | — |
| Category enum | free text | fixed GENERAL/SC/ST/OBC (`NewEmployeePage.jsx:97-104`) | Med |
| Account-type enum | SB/OD/RD/OTHER (`views-master.js:1172`) | n/a (not implemented) | High |
| FAST/OD/RD/LIC/Housing/Vehicle EMI & interest | computed and shown (`services/loans.js`; rendered `views-master.js:587-607,950-956,1024-1025,1060`) | never surfaced | High |
| Retirement auto from DOB + org age | shown in present position (`views-master.js:1373`) | shown on detail (`:78`) | — |
| Payslip net/gross/deductions | computed & shown (`views-master.js:617-663`) | absent | High |

## 5. Monetary formatting audit (₹ / `$`)

- OLD: **every** money value goes through `H.money` (`core.js:195-199`) which always prefixes `₹` (e.g. `₹20,000`), returning `—` for blank. No literal `$` anywhere.
- NEW: money goes through `fmt.money` (`client.js:212-220`) using `Intl.NumberFormat(..., currency:'INR')` → `₹`. **No literal `$` found** in the React employee scope (grep for `$` literals returned only JS template-literal `${}` interpolation).
- NEW `NewEmployeePage.jsx:148` builds the stage option manually with `₹{Number(s.amount).toLocaleString('en-IN')}` — correct ₹ but **bypasses `fmt.money`** (no `—` guard, no rounding control). Low.
- No monetary value shown *without* ₹ was found in the NEW employee scope. (Counts like days/entries are not money.)
- **Caveat:** because loans/payslip/attendance are unimplemented, the NEW UI never renders money for them at all.

## 6. Missing actions (preview / download / email / print)

- **Payslip preview** — OLD `payslipCard` (`views-master.js:617-663`); NEW absent. **High.**
- **Download payslip PDF** — OLD `wirePayslipDownload` → `/employees/:id/payslip.pdf` (`views-master.js:672-681`); NEW absent. **High.**
- **View/open employee document** — OLD `openDocument` new-tab authed fetch (`views-master.js:817-827`); NEW absent. **High.**
- **View/open service-book event attachment** — OLD clickable link (`views-master.js:1401,1410-1416`); NEW shows a non-clickable "Document" badge (`EmployeeDetailPage.jsx:109`). **Med.**
- **Download bulk-import CSV template** — OLD (`views-master.js:528-537`); NEW absent. **High.**
- **Email / print** — not present in OLD employee scope either (payslip email lives in payroll module), so no parity gap recorded here.

## 7. Missing filters & confirmations

- **"Show inactive" filter** on the employee list — OLD `#crud-inactive` (`views-master.js:61`); NEW absent (shows all rows always). **Med.**
- **Search breadth** — OLD searches post/grade/category too (`views-master.js:455`); NEW only name/code/department (`EmployeesPage.jsx:31`). **Med.**
- **Deactivate confirmation** — OLD `window.confirm` (`views-master.js:156`); NEW absent (no deactivate at all). **High.**
- **Service-book add confirmation** — OLD `window.confirm("…cannot be edited or removed")` (`views-master.js:1422`); NEW absent. **Med.**
- **Loan/document delete confirmations** — OLD `wireLoanDelete`/`confirm` (`views-master.js:895,1216,854`); NEW absent (no deletes). **High.**
- **Leave cancel confirmation** — OLD (`views-master.js:1313`); NEW absent. **Med.**
- **Reject-leave reason prompt** — OLD `window.prompt` (`views-master.js:1306`); NEW Reject sends no reason (`LeavePage.jsx:127`). **Med.**

## 8. Additional defects found in the NEW UI

| Defect | Evidence | Severity |
|---|---|---|
| `ServiceBookPage.jsx` is unrouted dead code that reads `serviceBook?.entries` (API returns `timeline`) and passes a JSX element to `Card noPadding` | `ServiceBookPage.jsx:22,31-32`; no route/import in `App.jsx` | Med |
| `CommandPalette` reads `e.code` but the employee API field is `empCode`, so every result label shows `undefined` | `CommandPalette.jsx:58` vs `client.js:184`/`employees` payload | Low |
| `CommandPalette` sends `?search=&limit=5` but `crudFactory` ignores search/limit and returns all rows | `CommandPalette.jsx:54`; `crudFactory.js:111-126` | Low |
| `masterDataApi.updateEmployee` is defined but unused → no edit path | `client.js:187`; no caller | High (as #18) |
| `documentApi` (list/upload/remove) defined but unused → no documents UI | `extended.js:88-97`; no caller | High (as #147) |
| `leaveApi.cancelApplication` defined but unused → no cancel | `extended.js:21`; no caller | Med (as #156) |

---

## 9. Count summary

- Features/rules enumerated: **158**
- **Present**: 28 · **Partial**: 23 · **Changed**: 6 · **Missing**: 100 · **n/a**: 1
- **High severity gaps**: 59 · **Medium**: 48 · **Low**: 28 · **not applicable**: 1
- Highest-impact clusters: entire **loan suite (FA/OD/RD/LIC/housing/vehicle)**, **bank accounts**, **attendance/LOP**, **employee documents**, **bulk import**, **payslip preview + PDF**, **service-book document attach**, **employee edit/deactivate**, and **org mandatory-field policy** are absent or unimplemented in the React UI.
