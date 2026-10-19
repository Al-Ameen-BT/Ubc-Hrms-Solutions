# Auth & Account Lifecycle — OLD (vanilla) vs NEW (React) parity report

Scope: platform login (`/`), org login (`/o/<CODE>`), custom-domain login, MFA
(enrol / verify / disable / recovery), forgot & reset password, change password
(forced flow), session/token storage & expiry, sign-out, "My account", and the
licence / suspended / expired org notices.

Read-only analysis. Evidence is `file:line`.

Legend for status: **Present** (behaviour reproduced) · **Partial** (present but
degraded/incomplete) · **Missing** (absent) · **Changed** (intentionally/otherwise
different).

---

## 1. Feature / screen / rule table

| # | Feature / screen / rule | Old behaviour (file:line) | New status | Evidence in new app (file:line) or "absent" | Gap / notes | Severity |
|---|--------------------------|---------------------------|------------|---------------------------------------------|-------------|----------|
| 1 | Platform login page `/` | `core.js:44-47`, `views-auth.js:48-88` | Present | `LoginPage.jsx:7-98`, `App.jsx:57-59` | — | — |
| 2 | Org login page `/o/<CODE>` (scopes login to one bank) | `core.js:46-47`, `views-auth.js:13-20`, `72` | Present | `AuthContext.jsx:13-18,57-65`, `LoginPage.jsx:47` | orgCode sent to API | — |
| 3 | Custom-domain login (Host → tenant) | `core.js:51-72` (loads org card but keeps `H.orgCode` null → not scoped) | Changed | `AuthContext.jsx:21-35` (`if(!orgCode && data?.code) setOrgCode`) | New adopts the org code from branding; improvement, but see #30 (forgot does not forward it) | Low |
| 4 | Branded header (logo / name / initials fallback) | `views-auth.js:11-24` | Partial | `LoginPage.jsx:44-52` | New has no text/initials `login-mark` fallback when no logo; subtitle wording differs ("Sign in to your bank's console" vs "Sign in to HRMS & Payroll") | Low |
| 5 | Unknown-organisation notice on `/o/<CODE>` | `views-auth.js:15-18` ("Unknown organisation…") | **Missing** | absent | Borrowed code path silently falls through to platform-branded sign-in | Med |
| 6 | Platform sign-in message (`platformName.loginMessage`) | `views-auth.js:51-52` | **Missing** | absent (field editable at `PlatformSettingsPage.jsx:93` but never rendered) | Admin-authored sign-in notice never shown | Med |
| 7 | Footer: support email/phone + "Powered by" | `views-auth.js:26-32`, `core.js:396-401` | Partial | `LoginPage.jsx:93-95` | New hardcodes `Powered by Banihal`; ignores `branding.companyName/supportEmail/supportPhone` | Low |
| 8 | Email field (autofocus, autocomplete=username) | `views-auth.js:55` | Partial | `LoginPage.jsx:61-70` | No `autoFocus`; autocomplete `email` not `username`; label "Email" vs "Email address" | Low |
| 9 | Password field (autocomplete=current-password) | `views-auth.js:56` | Present | `LoginPage.jsx:72-81` | — | — |
| 10 | Client-side "Enter your email address and password" empty check | `views-auth.js:67` | **Missing** | absent | Form `noValidate` (`LoginPage.jsx:54`) so empties reach the API | Low |
| 11 | Sign-in busy state | `views-auth.js:69` (`Signing in…`) | Present | `LoginPage.jsx:83` | Button spinner | — |
| 12 | MFA-required branch after password | `views-auth.js:74` | Present | `LoginPage.jsx:21-23` | Old rendered inline; new navigates to `/mfa-verify` | Low |
| 13 | `ORG_LOGIN_REQUIRED` — clickable link to the bank's login page | `views-auth.js:78-83` | Partial | absent (only `err.message` text, `LoginPage.jsx:27-28`) | Old rendered a real `<a href>`; new shows the URL as plain text | Med |
| 14 | Login error display | `views-auth.js:85` | Present | `LoginPage.jsx:55-59` | Wording changes: "Invalid email or password" (backend) vs old generic `.message` (same) | Low |
| 15 | "Welcome back. Your previous sign-in was …" flash | `views-auth.js:41`, `core.js:181-186` | **Missing** | absent (`previousLoginAt` returned by API `auth.js:83` but unused) | — | Low |
| 16 | Post-login default path by role | `core.js:290-296`, `views-auth.js:42` | Changed | `App.jsx:113-117` | Old: staff → `/employees`, others → `/account`, admins → `/dashboard`. New: everything → `/` (role split inside `HomeRoute`) | Med |
| 17 | Already-signed-in user visiting `/login` is redirected | `core.js:310`, `views-auth.js:327` | Present | `App.jsx:57-59` | — | — |
| 18 | MFA challenge screen | `views-auth.js:90-117` | Present | `MfaVerifyPage.jsx:7-63`, `App.jsx:60` | Now a dedicated route | — |
| 19 | "Signed in as **email**" + authenticator instruction | `views-auth.js:93` | Partial | `MfaVerifyPage.jsx:35` | New omits the account email | Low |
| 20 | 6-digit client validation + specific message | `views-auth.js:105` | **Missing** | absent | New sends any string; `noValidate` (`MfaVerifyPage.jsx:38`) | Med |
| 21 | Wrong MFA code → inline error, clear + refocus | `views-auth.js:111-113` | Changed (broken) | `MfaVerifyPage.jsx:24` | Backend 401 is intercepted by `client.js:38-42`, which clears the token and forces `#/login`; user sees "Session expired" instead of "Incorrect code" | High |
| 22 | `MFA_EXPIRED` → back to `/login` with a notice | `views-auth.js:110` | Changed | `client.js:38-42` | Happens only by accident (401 redirect) with the wrong message; no explicit handling | Med |
| 23 | "Use a different account" link on MFA step | `views-auth.js:98,116` | **Missing** | absent | No escape from the MFA screen | Low |
| 24 | MFA challenge token handling | `views-auth.js:108` (in-memory) | Changed | `LoginPage.jsx:22`, `MfaVerifyPage.jsx:19` | New keeps it in `sessionStorage` (survives reload) | Low |
| 25 | Forgot-password page + "link valid for 30 minutes" copy | `views-auth.js:121-133` | Partial | `ForgotPasswordPage.jsx:26-61` | 30-minute validity text dropped | Low |
| 26 | Forgot: email field + empty check | `views-auth.js:128,137` | Partial | `ForgotPasswordPage.jsx:43-52` | No client empty check | Low |
| 27 | Forgot: success message + "ask your administrator … temporary password" fallback, form hidden | `views-auth.js:143-144` | Partial | `ForgotPasswordPage.jsx:34-38` | Fallback wording dropped | Low |
| 28 | Forgot: forward `orgCode` on an org login page | `views-auth.js:140-141` | **Missing** | `ForgotPasswordPage.jsx:17` calls `authApi.forgotPassword(email)` (no orgCode; task's `client.js:83-84` supports it) | Backend `auth.js:218-220` treats a request with no org as SUPER_ADMIN-only → **a bank user on `/o/<CODE>` gets the generic message but no email is ever sent.** Silent lockout of the reset flow | High |
| 29 | Reset-password page + token from link | `views-auth.js:149-161`, `core.js:273-282` | Present | `ResetPasswordPage.jsx:7-52` (`useSearchParams`) | Email link format `#/reset-password?token=` from `auth.js:230` is compatible | — |
| 30 | Reset: incomplete-link inline message | `views-auth.js:161` | **Missing** | absent | Empty token just forwards "" → backend 400 "Token and new password are required" (`auth.js:244`) | Low |
| 31 | Reset: new + confirm fields + "At least 8 characters." hint | `views-auth.js:154-155` | Partial | `ResetPasswordPage.jsx:55-76` | Hint dropped; confirm has no `minLength` | Low |
| 32 | Reset: length + mismatch validation | `views-auth.js:165-166` | Present | `ResetPasswordPage.jsx:19-26` | Order differs (mismatch checked before length) | Low |
| 33 | Reset: success → sign-in | `views-auth.js:169-170` | Present | `ResetPasswordPage.jsx:30-31,46-50` | Wording differs | Low |
| 34 | Reset: always-present "Back to sign in" link | `views-auth.js:158` | Partial | `ResetPasswordPage.jsx:49` | Only shown in success state | Low |
| 35 | Forced synchronization when `mustChangePassword` | `core.js:325-327`, `views-auth.js:206` | Present | `App.jsx:53,58,74` | Guard exists | — |
| 36 | Change-password form (current/new/confirm) | `views-auth.js:177-183` | Present | `ChangePasswordPage.jsx:50-79` | — | — |
| 37 | Change-password validation (current present, ≥8, match) | `views-auth.js:190-192` | Partial | `ChangePasswordPage.jsx:19-26` | No client "Enter your current password." check | Low |
| 38 | **Clear `mustChangePassword` in the session after change** | `views-auth.js:196-198` (`s.user.mustChangePassword=false; H.setSession(s)`) | **Missing** | `ChangePasswordPage.jsx:30-31` only calls the API then `navigate('/')`; `AuthContext` never updates `user` | `App.jsx:74` still sees `mustChangePassword===true` → immediately bounces back to `/change-password`. **Infinite redirect loop; nobody can ever complete a forced password change.** | **High** |
| 39 | Forced-change greeting/explanation | `views-auth.js:211` ("Hello … temporary password — choose your own") | Changed | `ChangePasswordPage.jsx:44` ("Signed in as {email}") | Loses the explanatory copy | Low |
| 40 | Forced-change "Sign out" escape | `views-auth.js:213,216` | **Missing** | absent | Page renders outside `AppShell` (no TopBar) and `/login` bounces back → **no way to sign out at first sign-in on a shared machine** | Med |
| 41 | Post-change success notice | `views-auth.js:218`, `254` | **Missing** | absent | No confirmation; only a redirect | Low |
| 42 | Change-password wrong current password message | `auth.js:192` → shown inline | Changed (broken) | `client.js:38-42` | Backend 401 is swallowed as "Session expired", token cleared and user kicked to `/login` — **session destroyed on a typo** | High |
| 43 | My-account page | `views-auth.js:233-249` | Present | `MyAccountPage.jsx:8-61`, `App.jsx:105` | Reorganised into tabs | — |
| 44 | Profile: Name, Email, Role, Organisation, Last sign-in | `views-auth.js:239-245` | Partial | `MyAccountPage.jsx:27-34,54` | Drops Organisation; adds Status; last sign-in shown **raw** `user?.lastLoginAt` with no `fmt.dateTime` (ISO string) | Med |
| 45 | Role human labels ("Organisation Admin", "Accounts Officer"…) | `core.js:28-38,175` | Changed | `MyAccountPage.jsx:31`, `TopBar.jsx:56`, `UsersPage.jsx:65` use `role.replace(/_/g,' ')` | Renders "ORG ADMIN", "ACCOUNTS OFFICER" | Low |
| 46 | Change-password entry point inside My account | `views-auth.js:246` (inline card) | Changed | `MyAccountPage.jsx:55` | Now a button → `/change-password` | Low |
| 47 | MFA status badge + "Since <enrolled date>" | `views-auth.js:262-272` | Partial | `MyAccountPage.jsx:37-49` | New omits `mfaEnrolledAt` date; reads `user?.mfaEnabled` from context (stale after enrol/disable) | Med |
| 48 | MFA disable (password-confirmed) | `views-auth.js:266-282` | Present | `MfaDisablePage.jsx:9-60` | Wrong password hits the #42 401 bug | Med |
| 49 | MFA "Lost your phone?" recovery hint | `views-auth.js:271` | **Missing** | absent | User is told nothing about how to recover | Med |
| 50 | MFA setup: QR + steps + grouped manual key + Copy + Cancel | `views-auth.js:291-324` (`297` grouping, `303` copy, `308` cancel) | Partial | `MfaSetupPage.jsx:65-107` | Secret shown ungrouped, no copy button, no cancel/back step, steps copy reduced | Med |
| 51 | MFA setup: already-enabled guard | `auth.js:274`, `views-auth.js:262` | Present | `MfaSetupPage.jsx:42-56` | — | — |
| 52 | MFA setup: fetch error state | `views-auth.js:323` (notice) | **Missing** | `MfaSetupPage.jsx:21-25` | On query failure `setup` is undefined → silent "••••••" placeholder, confirm button disabled | Med |
| 53 | MFA enrolment/disable refreshes the user | `views-auth.js:256,280,320` (`H.refreshMe`) | **Missing** | `MfaSetupPage.jsx:34`, `MfaDisablePage.jsx:22` never update `AuthContext.user` | My-account/Card keeps showing the old state; re-enrol attempt returns 400 "MFA is already enabled" (`auth.js:290`) | Med |
| 54 | Admin **Reset MFA** (recovery path referenced by #49) | `views-org.js:114,157`, `views-platform.js:413,436` (confirm dialog + API) | **Missing** | absent in `UsersPage.jsx` and `PlatformUsersPage.jsx` (grep: no `reset-mfa`) | Backend endpoints exist (`orgUsers.js:123`, `admin.js:380`) but no UI calls them → **a user who loses their authenticator has no recovery affordance in the new console** | High |
| 55 | Admin reset-password temp-credential panel (copy + email status) | `components.js:75-93` | Partial | `UsersPage.jsx:115-119` | No copy button, no "welcome email sent / could not be sent" status, no "shown once" guidance | Med |
| 56 | Session token store | `core.js:87-98` (`sessionStorage['ucb.session']`, token+user) | Changed | `AuthContext.jsx:60,69`, `client.js:22` (`sessionStorage['token']`) | Both sessionStorage; new refetches `/auth/me` on boot (`AuthContext.jsx:38-55`). Equivalent | Low |
| 57 | Mid-session 401 → sign out with "session ended" notice | `core.js:148-151`, excluded auth calls via `isAuthCall` | Changed (broken) | `client.js:38-42` | New intercepts **all** 401s, including `/auth/login`, `/auth/mfa/verify-login`, `/auth/change-password`, `/auth/mfa/disable` → wrong credentials read as session expiry and clear the token (#21, #42) | High |
| 58 | Mid-session 403 `ORG_SUSPENDED` / `ORG_LICENSE_EXPIRED` / `ORG_LICENSE_NOT_STARTED` → sign out with the org message | `core.js:152-156` | **Missing** | `client.js` has no 403 branch (its header comment at `client.js:2` claims it does) | A suspended bank keeps a live-looking session; every screen errors generically instead of signing out | High |
| 59 | Licence pre-expiry banner (≤30 days) in the shell | `core.js:403-411,430` (+ ORG_ADMIN "Contact … to renew.") | **Missing** | absent; `AppShell.jsx:9-30` renders no banner | Users/admins get no expiry warning | Med |
| 60 | Sign-out button | `core.js:424,433` | Present | `TopBar.jsx:58` | Icon-only, `aria-label="Sign out"` | — |
| 61 | Sign-out routes to the correct entry point + flash message | `core.js:112-124` ("You have been signed out.") | Partial | `AuthContext.jsx:73-76` (`setUser(null)`) → route guard redirects | No flash/confirmation message; relies on `App.jsx:75` | Low |
| 62 | "My account" nav link for every role | `core.js:376` | Partial | `Sidebar.jsx:5-34` (`/account` only in `employeeNav:33`) | Platform/org users lose the sidebar link; only reachable via Command Palette (`CommandPalette.jsx:18`) or direct URL | Med |
| 63 | Public-route guards (login/forgot redirect when signed in; reset open) | `views-auth.js:327-329` | Partial | `App.jsx:57-62` | `/login` guarded; **`/forgot-password` is no longer `redirectIfSignedIn`** | Low |
| 64 | MFA setup/disable gated behind the forced-change lock | `core.js:325-327` (all navigation blocked) | Partial | `App.jsx:69-70` only checks `isAuthenticated`, not `mustChangePassword` | A temp-password user can reach MFA setup/disable before changing password | Low |
| 65 | Licence/suspension notice from the **login** POST (403 codes) | `auth.js:137-140,167` → `views-auth.js:85` | Present | `client.js:50-51` + `LoginPage.jsx:27` | 403 (not 401) so the org message is shown | — |
| 66 | Server-side password rules (≥8, ≠ current) | `auth.js:189-190` | Present (backend) | unchanged backend | New UI adds no extra rules | — |

---

## 2. Differences in validation, wording, redirects, defaults, flow

**Validation**
- Old had client-side guards that the new UI dropped: empty login fields (`views-auth.js:67`), empty forgot email (`:137`), non-empty current password on change (`:190`), and `^\d{6}$` on the MFA challenge (`:105`). New relies on the backend (or nothing) — combined with the 401 bug this produces misleading errors.
- Reset/change both keep the ≥8 + match rules, checks written in a different order.
- New MFA-verify input only strips non-digits via `maxLength`; no format gate before submit (`MfaVerifyPage.jsx:41-54`).

**Wording**
- Titles: "Two-factor authentication" → "Two-Factor Verification"; "Reset your password" → "Reset Password"; "Choose a new password" → "Set New Password"; "Sign in" → "Sign In"; "Email address" → "Email".
- Success/failure copy lost: 30-minute link validity, "ask your administrator … temporary password", "Welcome back…", programme fallback, `ORG_LOGIN_REQUIRED` readable link, "Since <date>", "Lost your phone?", forced-change greeting.
- Role labels rendered as raw enum ("ORG ADMIN") instead of the human `ROLE_LABELS` map.

**Redirects**
- Old `H.logout` chose the correct home path (`/` vs `/o/CODE`) and carried a flash; new always mutates the SPA hash and shows no message (`AuthContext.jsx:73-76`).
- Old returned `ORG_ADMIN`/`SUPER_ADMIN` to `/dashboard`, staff to `/employees`; new sends everyone to `/` (`App.jsx:113-117`).
- New's global 401 handler force-writes `#/login` (`client.js:40`) even when already on a public auth screen.

**Defaults / flow**
- `mustChangePassword` is set from the API but never reconciled client-side after a successful change (#38) or after MFA change (#53).
- Custom-domain branding now adopts the org code (`AuthContext.jsx:29`) — an improvement over the old behaviour — but that code is not forwarded to `/auth/forgot-password` (#28).
- MFA challenge became its own route; enabling/disabling moved off the My-account card onto separate pages.

---

## 3. Monetary values / currency literals

- **No monetary value appears in the auth/account scope**, so the ₹ / `$` check finds nothing to flag there.
- No bare **`$`** literal is used as a currency symbol anywhere in `frontend/src` (grep for `$` returns only JS template literals / `sessionStorage`).
- Shared `fmt.money` (`client.js:212-220`) uses `Intl.NumberFormat('en-IN', { currency: 'INR' })` → renders `₹`. Note it sets `minimumFractionDigits: 0`, so it prints `₹1,234` whereas the old `H.money` (`core.js:195-199`) printed `₹1,234.00` — a formatting difference, outside the auth scope but worth noting.
- Explicit `₹` is used in `NewEmployeePage.jsx:148,151`, `AllowancesPage.jsx:96`, `PayScalesPage.jsx:169` — consistent, no issue.

---

## 4. Missing UI states, actions, and security affordances

**Missing error/loading/empty states**
- MFA setup has no error state when `/auth/mfa/setup` fails (`MfaSetupPage.jsx:21-25`).
- My-account renders blanks if `user` is null; no loading/error affordance (`MyAccountPage.jsx`).
- Change-password/My-account show no field-level errors (single top-level `.auth-error` only).

**Missing actions**
- No admin **Reset MFA** UI (recovery) — #54.
- No "Use a different account" / back link on the MFA challenge — #23.
- No cancel/back on MFA setup — #50.
- No sign-out on the forced-change page — #40.
- No copy for the MFA manual key or the admin temp password — #50, #55.

**Missing security affordances / regressions**
- Forced-change infinite loop prevents completion and strands the user (#38).
- Global 401 handling destroys the session on ordinary credential typos (login, MFA, change-password, MFA-disable) and mislabels them "Session expired" (#57, #21, #42).
- No mid-session response to a suspended/expired organisation (#58) — the session silently lingers.
- Org-scoped password reset silently never sends mail because orgCode is dropped (#28).
- No licence-expiry warning banner (#59).
- No way to sign out at first sign-in on a shared machine (#40).

---

## 5. Status tally

Counted over the 66 rows above (rows marked "Changed (broken)" count as
**Changed**):

| Status | Count |
|--------|-------|
| Present | 19 |
| Partial | 19 |
| Missing | 17 |
| Changed | 11 |
| **Total rows** | **66** |

High-severity rows: #21, #28, #38, #42, #54, #57, #58.
