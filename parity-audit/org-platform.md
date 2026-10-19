# OLD (vanilla JS) → NEW (React) feature-parity audit — Org Admin + Platform (Super Admin)

Scope: Org Admin Settings (branding/logo, email/SMTP, payroll settings, mandatory fields), Organisation Profile, Users, Org dashboard/getting-started; Platform Overview, Organisations (+create/detail), Platform users, Platform settings, Audit log; plus the full payroll-settings field inventory.

Reference (correct/complete) = old vanilla JS: `public/js/views-org.js`, `public/js/views-platform.js`, `public/js/components.js`, `public/js/core.js`.
Target = React: `frontend/src/features/org/**`, `frontend/src/features/platform/**`, `frontend/src/api/client.js`, `frontend/src/api/extended.js`, `frontend/src/App.jsx`, `frontend/src/components/Sidebar.jsx`.
Backend is shared and unchanged; several new-UI gaps are "backend endpoint exists but no UI calls it".

Severity: **High** = user-visible feature/action entirely absent or broken (blocks work or data loss/misleading). **Med** = degraded/behaviour-changed. **Low** = cosmetic/wording.

---

## A. Org Admin

### A1. Org dashboard / getting-started (`viewOrgDashboard`, views-org.js:12-43)

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| A1.1 | Licensing stat tile: plan label, "Valid until <date>", warn when ≤30 days | views-org.js:21 | Partial | OrgDashboard.jsx:27-28 | New shows Plan + Valid Until + days-left; no `warn` styling at ≤30 days (only `redInk` when already expired) | Low |
| A1.2 | Active users tile "N / max" + "N seats free" + off-colour at limit | views-org.js:22 | Partial | OrgDashboard.jsx:29 | Shows "N / max (∞)" but no "seats free" sub-text and no at-limit warning/off state | Med |
| A1.3 | Active employees tile "N / max" + "N records free" + off at limit | views-org.js:23 | Partial | OrgDashboard.jsx:30 | Same as above — no free-records note, no at-limit state | Med |
| A1.4 | Email tile: "Own" vs "Platform" vs "Not set up", shows fromEmail, "Configure" link | views-org.js:24 | Changed | OrgDashboard.jsx:31 | New collapses to "Configured"/"Not Set" and never distinguishes platform-relay fallback; no link/fromEmail | Med |
| A1.5 | "Your sign-in address" card + Copy button | views-org.js:26-29,37 | Missing | absent in OrgDashboard.jsx | Sign-in URL + copy not on the org dashboard (it appears on Settings instead) | Med |
| A1.6 | Getting-started checklist — 5 items, each Done/To-do + hyperlink | views-org.js:30-36,41-43 | Partial | OrgDashboard.jsx:34-41,46-53 | Only 4 items; no logo item, no MFA item, no links; completion logic differs (item 1 = "org name set" instead of "logo uploaded") | Med |
| A1.7 | Checklist "Add posts, pay scales and employees" | views-org.js:35 | Partial | OrgDashboard.jsx:39 | Text reduced to "Employees added" | Low |

### A2. Users management (`H.usersView`, views-org.js:48-171)

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| A2.1 | Create user: Full name / Email / Role select (default HR_OFFICER) | views-org.js:57-61 | Present | UsersPage.jsx:123-130 (default L22) | Role options list matches (`ROLES` L13 vs core.js:39) | — |
| A2.2 | Create user: "Email the sign-in details" checkbox (`sendEmail`) | views-org.js:62,72 | Missing | absent in UsersPage.jsx:120-131 | New create always omits `sendEmail`; welcome email cannot be requested from UI | Med |
| A2.3 | Client validation: Name and Email required | views-org.js:73 | Partial | UsersPage.jsx:123-124 (`required` attr only) | Only HTML `required`, no submit guard; error surfaces from server | Low |
| A2.4 | On create: one-time temp-password panel + copy + email sent/failed status | views-org.js:80 (components.js:75-93) | Partial | UsersPage.jsx:115-119 | Shows temp password, but no copy button, no "shown once" guidance, no email-delivery result | Med |
| A2.5 | Seats line: active/max, "licence limit reached" warning at cap | views-org.js:104-107 (components.js:52-56) | Missing | absent in UsersPage.jsx | No seat/limit display at all; orgAdmin cannot see remaining seats | High |
| A2.6 | User table: Name, Email, Role, Status, MFA, Last sign-in | views-org.js:109-121 | Partial | UsersPage.jsx:62-68 | Columns present (Role/2FA/Status/Last sign-in) but no "Temp password" badge for `mustChangePassword` | Med |
| A2.7 | Change role (inline editor) | views-org.js:130-146 | Missing | absent UsersPage.jsx:69-84 | No role-change action; PUT already supports it (orgUsers.js:79-97) | High |
| A2.8 | Reset password (2 confirms: new temp pw + "email it?") | views-org.js:147-153 | Partial | UsersPage.jsx:49-53,73 | No confirmation dialog, no email choice (`{}`→ no sendEmail), temp password shown only as code | Med |
| A2.9 | Reset MFA (with confirm) | views-org.js:154-157 | Missing | absent | Endpoint exists (`usersApi.resetMfa`, client.js:154) but no button | High |
| A2.10 | Deactivate (confirm) | views-org.js:158-161 | Partial | UsersPage.jsx:74-81 | Toggle exists but no confirmation prompt | Med |
| A2.11 | Reactivate | views-org.js:162-164 | Present | UsersPage.jsx:77-80 | — | — |
| A2.12 | Delete permanently (confirm) — two-step on INACTIVE | views-org.js:165-168,113-115 | Missing | absent | Backend two-step DELETE exists (orgUsers.js:137-149); no UI | High |
| A2.13 | Self row shows "You" and hides destructive actions | views-org.js:111-115 | Partial | UsersPage.jsx:74 | Only the status toggle is hidden for self; Reset Password button still shown to self (server rejects with 400) | Low |

### A3. Settings screen & sub-tabs (`viewOrgSettings`, views-org.js:183-368)

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| A3.1 | Sub-tabs: Organisation / Email (SMTP) / Payroll / Mandatory fields | views-org.js:183-190 | Missing | absent; SettingsPage.jsx is one page | New shows Organisation + Email + a new Custom Domain section; Payroll & Mandatory-fields tabs gone | High |
| A3.2 | `/org-settings/branding` resolves (falls through to Organisation) | views-org.js:183,188 | Missing | n/a (no tab routes) | Bookmark/bookmark parity lost (cosmetic) | Low |
| A3.3 | Organisation tab — editable Short name / Contact email / Contact phone / Website / Address, Save | views-org.js:211-237 | Missing | SettingsPage.jsx:63-73 (all fields `disabled`) | New declares identity read-only here; the contact fields (email/phone/website/short name) have **no editable form anywhere** | High |
| A3.4 | Organisation tab — Registered name / Code / Regulator read-only | views-org.js:207-210 | Present | SettingsPage.jsx:65-68 | — | — |
| A3.5 | Licence card: Plan, Valid from ("Immediately"), Valid until (+days), Active users, Active employees | views-org.js:219-225 | Partial | SettingsPage.jsx:100-102 | New shows only Plan / Users / Employees; drops Valid from, Valid until and days-left | Med |
| A3.6 | "Contact Banihal to renew" note | views-org.js:225 | Missing | absent | Wording only | Low |
| A3.7 | Email tab — enabled, host, port(1-65535), security(STARTTLS/SSL/NONE), username, password, from name, from address, **reply-to** | views-org.js:194-198 + components.js:213-224 | Partial | SettingsPage.jsx:114-136 | All present EXCEPT **Reply-To**; also note `orgApi.updateSmtp` path ok | Med |
| A3.8 | Email tab — "Remove the saved password" checkbox | components.js:225,251 | Missing | absent | Cannot clear a stored SMTP password from UI | Low |
| A3.9 | Email tab — Send test to a **typed recipient** (default current user) | components.js:229-232,259-263 | Partial | SettingsPage.jsx:138 (`testSmtp({})`) | No recipient input; backend defaults to caller's email (admin.js/orgSettings.js:100). No custom recipient | Low |
| A3.10 | Email tab — last test result line (time/ok/message) | components.js:203-206 | Missing | absent | `publicView` returns lastTestAt/Ok/Message but not rendered | Low |
| A3.11 | Server validation contact email format | orgFields.js:123 | Present (backend) | shared backend | — | — |

### A3c. Payroll settings sub-tab — full field inventory vs new UI

Old source: `drawPayrollSettings` views-org.js:243-339. Defaults from `src/models/orgPayrollSetting.js`. **New UI: no payroll-settings screen exists** — `orgApi.payrollSettings`/`updatePayrollSettings` are defined (client.js:134-135) but never imported by any page and there is no route (App.jsx:77-107) or sidebar entry (Sidebar.jsx:13-29). Therefore **every field below is Missing** (severity High for the whole screen; each row notes the default/enum for completeness).

| # | Field (label as shown) | Type (old) | Default / enum | Old (views-org.js) | New status | Evidence |
|---|---|---|---|---|---|---|
| C1 | Financial year convention | select | CALENDAR `Calendar year (Jan–Dec)` / FINANCIAL `Indian financial year (Apr–Mar)`; default CALENDAR | :251 | Missing | absent |
| C2 | DA (% of Basic) | number step .001 min 0 | 1.2 | :254 | Missing | absent |
| C3 | HRA (% of Basic) | number step .001 min 0 | 10 | :255 | Missing | absent |
| C4 | PF — Employee (%) | number step .001 min 0 | 12 | :258 | Missing | absent |
| C5 | PF — Employer (%) (informational) | number step .001 min 0 | 12 | :259 | Missing | absent |
| C6 | Calculated on (PF base) | select | BASIC `Basic pay only` / BASIC_PLUS_DA `Basic + DA`; default BASIC | :260 | Missing | absent |
| C7 | GSLI default amount (₹) | number step .01 min 0 | 20 | :263 | Missing | absent |
| C8 | GSLI — joined before | date | 2014-09-01 | :264 | Missing | absent |
| C9 | Professional Tax — Schedule | select | MONTHLY `Monthly` / HALF_YEARLY `Twice a year`; default HALF_YEARLY | :267 | Missing | absent |
| C10 | PT — First month (1–12) | number min1 max12 | 8 | :269 | Missing | absent |
| C11 | PT — Second month (1–12) | number min1 max12 | 2 | :270 | Missing | absent |
| C12 | OD — Limit multiplier (× Basic+DA) | number step .01 min 0 | 15 | :273 | Missing | absent |
| C13 | OD — Maximum amount (₹) | number step .01 min 0 | 400000 | :274 | Missing | absent |
| C14 | OD — Maximum repayment period (months) | number min1 | 84 | :275 | Missing | absent |
| C15 | OD — Interest rate (%) | number step .001 min 0 | 6.5 | :276 | Missing | absent |
| C16 | Festival Advance — Repayment period (months) | number min1 | 10 | :279 | Missing | absent |
| C17 | Vehicle Loan — Interest rate (%) | number step .001 min 0 | 9 | :282 | Missing | absent |
| C18 | Vehicle Loan — allow multiple (checkbox) | checkbox | false | :285 | Missing | absent |
| C19 | City Compensatory Allowance (₹/month) | number step .01 min 0 | 0 | :287 | Missing | absent |
| C20 | Conveyance Allowance (₹/month) | number step .01 min 0 | 0 | :288 | Missing | absent |
| C21 | Medical Allowance — amount per year (₹) | number step .01 min 0 | 4000 | :291 | Missing | absent |
| C22 | Medical Allowance — paid in month (1–12) | number min1 max12 | 12 | :292 | Missing | absent |
| C23 | Bonus — paid in month (1–12) | number min1 max12 | 4 | :297 | Missing | absent |
| C24 | Bonus — this year's result | select | '' `Not yet declared` / PROFIT / LOSS; default null | :298 | Missing | absent |
| C25 | Bonus — If Profit: % of Basic | number step .001 min 0 | 20 | :299 | Missing | absent |
| C26 | Bonus — If Profit: maximum (₹) | number step .01 min 0 | 16800 | :300 | Missing | absent |
| C27 | Bonus — If Loss: % of Basic | number step .001 min 0 | 8.33 | :301 | Missing | absent |
| C28 | Bonus — If Loss: maximum (₹) | number step .01 min 0 | 7000 | :302 | Missing | absent |
| C29 | Stagnation — years without promotion | number min1 | 8 | :305 | Missing | absent |
| C30 | Stagnation — extra stages granted | number min1 | 2 | :306 | Missing | absent |
| C31 | Retirement — standard retirement age (years) | number min45 max75 | 58 | :309 | Missing | absent |

Server-side validation that no longer has a UI: retirement age 45–75 whole number, yearType enum (payrollSettings.js:37-45).

### A3d. Mandatory employee fields sub-tab (`drawMandatoryFields`, views-org.js:344-368)

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| A3d.1 | Per-field mandatory toggles for the 21 toggleable fields | views-org.js:344-356; defs orgFields.js:152-175 | Missing | absent (no page/route/API call) | `GET/PUT /org/mandatory-fields` exists (orgSettings.js:129-145); no UI | High |
| A3d.2 | Fixed note: Emp Code/Name/DOJ/Post always required; org-scoped | views-org.js:349-350 | Missing | absent | Wording/help lost | Low |
| A3d.3 | Save → `PUT /org/mandatory-fields { config }` | views-org.js:357-366 | Missing | absent | — | High |

### A3e. Org logo / branding (`logoUploader`, components.js:139-193; used views-org.js:422-429)

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| A3e.1 | Bank logo upload (PNG/JPEG/WebP ≤512 KB), preview, Remove (confirm), version cache-bust | views-org.js:422-429; components.js:139-193 | Missing | OrgProfilePage.jsx:52-54 (static "LOGO" placeholder) | `orgApi.uploadLogo` defined (client.js:136-142) but unused; not on Settings or Profile | High |
| A3e.2 | Note: old comment consolidated the duplicate "Logo" tab into Org Profile | views-org.js:175-182 | n/a | — | Reference only | — |

### A4. Organisation Profile (`viewOrgProfile`, views-org.js:381-657)

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| A4.1 | Bank identity: Established year, Registration no., RBI licence no./date, GSTN, PAN, Address; Save | views-org.js:393-401,431-441; orgFields.js:228-253 | Partial | OrgProfilePage.jsx:50-70 | Fields present, but new also exposes **Registered Name / Short Name** which the backend `PUT /org/profile` (`orgProfileFields` orgFields.js:228-252) silently ignores → edits appear saved (toast) but are dropped | High |
| A4.2 | Establishment year bounds min1800–max current year (client) | views-org.js:394 | Partial | OrgProfilePage.jsx:58 (plain Input) | No client min/max; only server validates (orgFields.js:238) | Low |
| A4.3 | Branches table + add/edit(inline)/delete(confirm): Name(req), Branch code, Phone, Head Office, Address | views-org.js:404-507 | Partial | OrgProfilePage.jsx:86-98 | Table is **read-only**; no add/edit/delete form. `profileApi.createBranch/updateBranch/deleteBranch` defined (extended.js:75-78) but unused | High |
| A4.4 | Board & management table + add/edit/delete(confirm): Name(req), Role(7 enums), "Other" designation(req if OTHER), Photo (≤512 KB) + remove | views-org.js:409-577 | Partial | OrgProfilePage.jsx:72-84 | Table read-only; no form/photo upload/delete. Board CRUD exists in `profileApi` (extended.js:80-83) but unused | High |
| A4.5 | Statutory documents: upload (type, label req if Other, file PDF/PNG/JPEG/WebP ≤5 MB), list (Type/File/Size/Uploaded), authenticated Download, Delete(confirm) | views-org.js:415-420,592-657 | Partial | OrgProfilePage.jsx:100-112 | Read-only list of type+filename only; no upload/download/delete | High |
| A4.6 | Role label map for board (Chairman/Vice Chairman/…/Other) | views-org.js:372-376,513 | Partial | OrgProfilePage.jsx:76 | New renders raw `roleOther || role` (e.g. "MEMBER") with no friendly labels | Low |

### A5. Org Audit log (`viewOrgAudit`, views-org.js:752-755 + `H.auditTable` components.js:338-408)

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| A5.1 | Filters: Organisation (super) + Activity category select | components.js:348-350,395-396 | Missing | absent AuditPage.jsx | Org filter not applicable; Activity filter gone | High |
| A5.2 | Pagination: Newer/Older, "Page X of Y (N entries)", 50/page | components.js:354-358,378-380,397-398 | Missing | absent AuditPage.jsx:12-14 | New requests only `limit:50` (ignored by backend which uses pageSize) → first 50 only, no paging | High |
| A5.3 | Columns incl Who, Activity label, Details, IP; failed rows highlighted | components.js:382-393 | Partial | AuditPage.jsx:17-23 | New columns Time/Actor/Action/Entity/ID; **no IP, no details, no action-label mapping, no failed-row styling** | Med |
| A5.4 | New columns reference fields the API doesn't return | — | Broken | AuditPage.jsx:19-22 (`actorName`,`entityType`,`entityId`) vs audit rows `actorEmail`,`targetType`,`targetId` (audit.js:20-37) | Actor/Entity/ID render blank | High |
| A5.5 | Retention line ("older than N days auto-removed") | components.js:352,374-376 | Missing | absent | `auditRetentionDays` returned by API but unused | Low |

---

## B. Platform (Super Admin)

### B1. Platform Overview (`viewDashboard`, views-platform.js:77-122)

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| B1.1 | Stat tiles: Organisations(total/active), Expiring≤30d, Expired+Suspended(+breakdown), Bank users, Platform users, Failed sign-ins(24h, link, warn>20) | views-platform.js:89-96 | Partial | PlatformDashboard.jsx:44-51 | Tiles present, but Failed Sign-ins loses its audit-log link and the `>20` warn threshold; Expired/Suspended breakdown text simplified | Low |
| B1.2 | "Needs attention" includes: status≠ACTIVE, licence≠ACTIVE, daysLeft≤30, **users≥maxUsers**, **employees≥maxEmployees** | views-platform.js:83-87 | Partial | PlatformDashboard.jsx:26-35 | New covers status/expired/daysLeft only → **seat-limit-reached and licence-not-started orgs never flagged** | Med |
| B1.3 | Attention table cols: Code(+logo), Org, Plan, Valid until, Users, Employees, Status | views-platform.js:104-115 | Partial | PlatformDashboard.jsx:53-79 | New omits logo, Plan, per-org Users/Employees; adds an "Issue"/"Severity" column | Med |
| B1.4 | Clickable rows → org detail | views-platform.js:107,118-121 | Present | (rows in Table, but no `onRowClick` in PlatformDashboard.jsx:54-79) | Attention rows are **not** clickable in new | Low |

### B2. Organisations list + create (`viewOrgList`, views-platform.js:126-169)

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| B2.1 | List cols: Code(+logo), Organisation, Plan, Valid until, Users, Employees, Status | views-platform.js:104-116 | Partial | OrganisationsPage.jsx:18-42 | New: Name, Code, Class, Status, Plan, Domain(new), Valid Until, Users, Employees. No logo; adds Class/Domain. No at-limit formatting | Low |
| B2.2 | Onboard form: code(maxlength/echo/sign-in-address hint), name, short name, regulator (default), bank class, address | views-platform.js:133-140,150 | Partial | NewOrganisationPage.jsx:99-121 | New is a 6-step wizard; code uppercased but no maxlength, no `/o/CODE` echo, no autocomplete-off; adds Contact fields (email/phone/website) not in old | Med |
| B2.3 | Onboard requires code+name+bankClass with error messages | views-platform.js:157-158 | Partial | NewOrganisationPage.jsx:79-82 | Next disabled unless name/code/bankClass; no explicit validation messages; server enforces | Low |
| B2.4 | Licence subform: plan, valid from, valid until, max users, max employees, **licence notes** | views-platform.js:40-49,141 | Partial | NewOrganisationPage.jsx:151-165 | All present except **Licence notes** (`licenseNotes`) | Med |
| B2.5 | Plan presets fill dates+limits (TRIAL 30d; STANDARD 1yr/25/500; PROFESSIONAL 1yr/**75**/2000; ENTERPRISE unlimited; CUSTOM none) | views-platform.js:12-18,52-62 | Changed | NewOrganisationPage.jsx:22-28,74-77 | **PROFESSIONAL maxUsers 100 vs old 75**; TRIAL uses `months:1` (≈ 1 month) vs old 30 days; presets use `addMonths` vs old `addDays(start, days-1)` (off-by-one on expiry); CUSTOM now sets a 12-month expiry (old CUSTOM set nothing) | Med |
| B2.6 | Create Org Admin during onboarding | Old created on org detail page after create | Changed | NewOrganisationPage.jsx:57-63,168-176 | New bundles admin creation into onboarding; old did it separately | Low |
| B2.7 | After create → navigate to org **detail** with "create its Org Admin" notice | views-platform.js:161-163 | Changed | NewOrganisationPage.jsx:69 | New navigates to the organisations **list** instead | Low |
| B2.8 | Bank-class option labels descriptive ("Class I Urban Banks (Licensed Banks)") | views-platform.js:25-33 | Changed | NewOrganisationPage.jsx:20,107 | New labels are enum-derived ("CLASS I") — less informative | Low |

### B3. Organisation detail (`viewOrgDetail`/`drawOrg`, views-platform.js:171-364)

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| B3.1 | Header: code, licence badge, plan badge, **bank-class badge**, "Manage all users", breadcrumbs | views-platform.js:183-187 | Partial | OrganisationDetailPage.jsx:95-110 | Shows name/code/class/status; no licence badge, plan badge, breadcrumbs, or "Manage all users" link | Med |
| B3.2 | Sign-in address card + Copy + **Open in new tab** | views-platform.js:191-196 | Partial | OrganisationDetailPage.jsx:119-124 | Copy present; no "Open" link | Low |
| B3.3 | Licence form incl **licence notes**, Save | views-platform.js:205 | Partial | OrganisationDetailPage.jsx:153-176 | Present except **licence notes** | Med |
| B3.4 | "Extend by 1 year" button (preview notice) | views-platform.js:207,287-293 | Missing | absent | — | Med |
| B3.5 | Plan-preset autofill on licence form | views-platform.js:52-62,276 | Missing | absent OrganisationDetailPage.jsx:153-176 | Plan select has no preset wiring | Low |
| B3.6 | Suspend/Reactivate **with confirm** ("every user signed out…") | views-platform.js:294-298 | Partial | OrganisationDetailPage.jsx:92-93,105-107 | Toggle present but **no confirmation dialog** | Med |
| B3.7 | Organisation profile form incl **Address** | views-platform.js:217-228 | Partial | OrganisationDetailPage.jsx:178-190 | All fields except **Address** | Med |
| B3.8 | Org logo uploader (≤512 KB) + Remove | views-platform.js:268-274 | Missing | absent OrganisationDetailPage.jsx | `platformApi.uploadOrgLogo` defined (client.js:103-109) but unused | High |
| B3.9 | Pay-scale revision: download CSV template, upload filled CSV, revision name/effective date/notes, Apply + result table | views-platform.js:232-246,327-363 | Missing | absent | Backend endpoints exist (admin.js:147-176); no UI | High |
| B3.10 | Organisation Admins table: Name, Email, Status, **Password(temp/set)**, **MFA**, Last sign-in | views-platform.js:248-255 | Partial | OrganisationDetailPage.jsx:192-203 | New shows Name/Email/Status only — drops Password, MFA, Last sign-in | Med |
| B3.11 | "Add another/–the– Organisation Admin" form + temp-password panel | views-platform.js:256-263,309-325 | Missing | absent | `platformApi.createOrgAdmin` is used only inside onboarding (NewOrganisationPage.jsx:59); no post-onboarding admin creation | High |
| B3.12 | Custom Domain card (DNS CNAME, verify) | Not in old (old had no per-org domain UI) | Changed (new-only) | OrganisationDetailPage.jsx:126-151 | New feature; adds `platformApi.organizationDomain`/`verifyOrganizationDomain` | — |

### B4. Platform users (`viewPlatformUsers`, views-platform.js:368-452)

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| B4.1 | Create: Full name, Email, **send email checkbox** | views-platform.js:374-378 | Partial | PlatformUsersPage.jsx:96-113 | Form present; **no send-email checkbox** | Med |
| B4.2 | Create → temp-password credPanel displayed | views-platform.js:391-397 | Broken | PlatformUsersPage.jsx:30 | Toast says "Temporary password shown in the response" but `res.tempPassword` is never rendered → admin cannot retrieve it | High |
| B4.3 | Table: Name, Email, Status(+Temp pw badge), **MFA**, Last sign-in | views-platform.js:408-422 | Partial | PlatformUsersPage.jsx:43-53 | Drops MFA column and mustChangePassword badge; adds Role | Med |
| B4.4 | Reset password (+confirm, temp pw panel) | views-platform.js:427-432 | Missing | absent | Endpoint exists (admin.js:370-378); no UI | High |
| B4.5 | Reset MFA (+confirm) | views-platform.js:433-436 | Missing | absent | Endpoint exists (admin.js:380-388) | High |
| B4.6 | Deactivate (+confirm) / Reactivate | views-platform.js:441-447 | Missing | absent | Endpoint exists (admin.js:349-368) | High |
| B4.7 | Delete permanently (+confirm) — two-step | views-platform.js:437-440 | Missing | absent | Endpoint exists (admin.js:395-409) | High |
| B4.8 | "You" marker; new adds server-side last-Super-Admin guard | views-platform.js:410-411 | n/a | server admin.js:355-358,404-405 | Reference | — |

### B5. Platform settings (`viewSettings`, views-platform.js:458-520)

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| B5.1 | General: Platform name, Company name, Support email/phone, Application URL, Audit log retention(30–3650, hint "Default 180"), Sign-in message; Save | views-platform.js:477-503 | Present | PlatformSettingsPage.jsx:86-99 | All 7 present. New `?? 365` fallback (L31) differs from backend default **180** (platformSetting.js:22) but only fires if the value is null; the saved/default row is returned so real value shows | Low |
| B5.2 | Branding: **Main logo upload/remove** | views-platform.js:505-519; components.js:139-193 | Missing | PlatformSettingsPage.jsx:101-112 | Static text "upload from the backend"; `platformApi.uploadPlatformLogo` defined (client.js:117-123) but unused | High |
| B5.3 | Branding: **Favicon upload/remove** (allowIco) | views-platform.js:514-519 | Missing | PlatformSettingsPage.jsx:107-110 | Same — placeholder only | High |
| B5.4 | Branding: limits (LOGO/FAVICON bytes) surfaced | views-platform.js:512,518 | Missing | `data.limits` unused in PlatformSettingsPage.jsx | — | Low |
| B5.5 | Email tab — enabled, host, port, security, username, password, from name/email, **reply-to** | views-platform.js:466-472 + components.js:213-224 | Present | PlatformSettingsPage.jsx:114-143 | All fields incl Reply-To present | — |
| B5.6 | Email tab — "Remove saved password" checkbox | components.js:225,251 | Missing | absent | Cannot clear stored password | Low |
| B5.7 | Email tab — test recipient + last-test result | components.js:229-233,259-271 | Partial | PlatformSettingsPage.jsx:140 (`testSmtp({})`) | No recipient input; no last-test status display | Low |

### B6. Platform audit (`viewAudit`, views-platform.js:524-529 + auditTable)

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|---|---|---|---|---|---|
| B6.1 | Platform-wide filters: Organisation (All / Platform only / each org) + Activity category | components.js:348-350 (orgs passed), views-platform.js:527 | Missing | absent AuditPage.jsx | No org or activity filtering for Super Admin | High |
| B6.2 | Organisation column | components.js:383,389 | Missing | absent AuditPage.jsx:17-23 | Super Admin cannot see which org an entry belongs to | Med |
| B6.3 | Pagination Newer/Older + "Page X of Y (N entries)" | components.js:354-358,378-380 | Missing | absent | Only first 50 rows fetched | High |
| B6.4 | "Purge expired entries now" (POST /admin/audit/purge-now) + retention line | components.js:352,358,374-376,399-406; views-platform.js:527 | Missing | absent | Admin endpoint exists (admin.js:506-519); no UI | Med |
| B6.5 | Details column (incl before→after diffs), IP, action labels, failed-row highlight | components.js:315-332,382-393 | Partial | AuditPage.jsx:17-23; broken fields (see A5.4) | Mostly lost | Med |

---

## Cross-cutting differences (validation / defaults / enums)

- **Org Settings contact fields lost**: old `PUT /org/settings` edits shortName/address/contactEmail/contactPhone/website (`orgAdminFields`, orgFields.js:114-125). New Settings makes them read-only (SettingsPage.jsx:63-73) and OrgProfilePage's `PUT /org/profile` (`orgProfileFields`, orgFields.js:228-252) ignores shortName/contactEmail/contactPhone/website **and** name. Net: short name, contact email, contact phone and website are uneditable and OrgProfile "Registered Name"/"Short Name" edits are silently discarded (toast still says "saved"). **High.**
- **Plan presets**: PROFESSIONAL maxUsers 100 (new) vs 75 (old); TRIAL length 1 month vs 30 days; expiry computed with `addMonths` (new) vs `addDays(start, days-1)` (old). NewOrganisationPage.jsx:22-28 vs views-platform.js:12-18.
- **Enums**: new Bank Class select shows raw enum text ("CLASS I") vs old descriptive labels; board Role renders raw enum instead of friendly labels (OrgProfilePage.jsx:76 vs views-org.js:372-376). pfCalculationBase/ptSchedule/yearType/bonusResult enums are unchanged in the backend but have **no UI** now (payroll tab missing).
- **Validation moved server-side only** in new UI (NewOrganisationPage.jsx:79-82, UsersPage.jsx:123-124, PlatformUsersPage.jsx:98-112, OrgProfilePage.jsx). Old UI had explicit client messages (views-org.js:73,157-158,313,348-349; views-platform.js). Behaviour largely preserved because the shared backend validates (orgFields.js, userAdmin.js), but error surfacing/toasts differ.
- **Seat limits**: old showed seats free/at-limit on both dashboard and Users page; new shows only the raw `used / max` on the org dashboard and detail, and **nothing** on the Users listing (UsersPage.jsx). Server still enforces (`assertCanAddUser`, userAdmin.js:76,135).
- **Two-step delete** semantics (deactivate then delete) are documented in backend (orgUsers.js:133-149, admin.js:390-409) but the new UI never exposes the delete step at all.

## Monetary values / currency

- `fmt.money` (client.js:213-220) uses `Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:0})` → renders the ₹ symbol. Old `H.money` (core.js:195-199) used `'₹' + toLocaleString` with up to 2 decimals.
- **No literal `$` anywhere** in `frontend/src` (grep returned none); no monetary value was found rendered without ₹ in scope. The only in-scope screens that could show money (payroll settings: GSLI/OD/CCA/Conveyance/Medical/Bonus amounts) are **missing**, so no currency bug there — but the entire screen is absent.
- Minor: `fmt.money` caps at 0 fraction digits, so old 2-decimal amounts (e.g. 8.33, 1.2) would round differently if that screen existed.

## Missing tabs / actions / filters / confirmations (quick list)

- Tabs: Org Settings has no **Payroll** or **Mandatory fields** tabs; Platform Settings has no **Branding upload** (General/Email only, branding is a placeholder).
- Missing actions — Org Users: Change role, Reset MFA, Delete permanently, seat-limit notice, send-welcome-email checkbox.
- Missing actions — Platform Users: Reset password, Reset MFA, Deactivate/Reactivate, Delete permanently; and the created temp password is never shown.
- Missing actions — Org detail (platform): licence notes, Extend-by-1-year, org logo upload, pay-scale revision, add-org-admin, password/MFA columns.
- Missing actions — OrgProfile: branch CRUD, board CRUD + photo, document upload/download/delete, logo upload.
- Missing confirmations: Users deactivate, Users reset-password email choice; Platform org Suspend/Reactivate (orgUsers; OrganisationDetailPage.jsx:92-93). (Old used `window.confirm` throughout.)
- Missing filters/pagination: Audit log (both org and platform) — activity filter, org filter, pager, retention line, purge; `AuditPage.jsx` fetches `{limit:50}` only.

---

## High-severity gaps digest

1. **Payroll settings screen entirely missing** (31 fields incl. DA/HRA/PF/GSLI/PT/OD/Festival Advance/Vehicle Loan/CCA/Conveyance/Medical/Bonus/Stagnation/Retirement/Year-type) — client API exists but no page/route (SettingsPage.jsx; client.js:134-135).
2. **Mandatory employee fields screen missing** (21 toggles) — endpoint exists, no UI (orgFields.js:152-175; orgSettings.js:129-145).
3. **Org logo (branding) upload missing** — placeholder only (OrgProfilePage.jsx:52-54).
4. **Org contact fields uneditable / silently dropped** — shortName, contact email/phone, website have no working editor; OrgProfile name/shortName edits discarded (SettingsPage.jsx:63-73; OrgProfilePage.jsx:56-57 vs orgFields.js:228-252).
5. **Org Users: Change role missing**, **Reset MFA missing**, **Delete permanently missing**, **no seat-limit display** (UsersPage.jsx:62-85).
6. **Platform Users: Reset password / Reset MFA / Deactivate / Delete all missing**, and **created temp password never displayed** (PlatformUsersPage.jsx:30,43-53).
7. **Platform branding logo + favicon upload missing** (PlatformSettingsPage.jsx:101-112).
8. **Organisation detail: org logo upload, pay-scale revision, and add-Org-Admin missing** (OrganisationDetailPage.jsx).
9. **OrgProfile Branches / Board(+photo) / Documents CRUD missing** (read-only tables) (OrgProfilePage.jsx:72-112).
10. **Audit log: filters + pagination missing**, plus **broken columns** referencing non-existent fields (`actorName`/`entityType`/`entityId`) (AuditPage.jsx:17-23 vs audit.js:20-37).

*Counts: ~78 features/rules audited. High ≈ 24 rows (10 distinct screen-level problems), Med ≈ 30, Low ≈ 15, Present/unchanged ≈ 9.*
