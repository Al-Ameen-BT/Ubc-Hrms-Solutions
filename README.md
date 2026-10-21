# UCB HRMS & Payroll — Framework (First Slice)

Multi-tenant HRMS/Payroll foundation for Urban Co-operative Banks following
Kerala service rules. This slice implements the architecture end-to-end —
Organization → Post/Cadre → Pay Revision → Pay Scale → Pay Stage →
Increment Policy → Pay Fixation Policy → Employee → Calculation Engine →
Transaction (Service Book) — with a working Increment Date engine and Pay
Fixation engine, both driven entirely by configuration, not code.

## Why this shape

Different UCBs will have different increment-date rules and different
promotion pay-fixation rules. Nothing about either is hard-coded:

- **Increment date** comes from an `increment_policy` row per organization
  (and optionally per grade/category), with `date_basis` one of
  `FIXED_COMMON_DATE`, `DOJ_ANNIVERSARY`, `DOA_ANNIVERSARY`,
  `EMPLOYEE_SPECIFIC`, or `RULE_GRADE_CATEGORY_SPECIFIC`. Service events
  (LWA, suspension, break in service, extraordinary leave) can push it.
- **Pay fixation on promotion** comes from a `pay_fixation_policy` row, with
  `promotion_method` one of `NOTIONAL_INCREMENT_THEN_FIX` (Option A),
  `DIRECT_NEXT_HIGHER_STAGE`, `DEFER_TO_NEXT_INCREMENT` (Option B), or
  `CUSTOM` (bank-specific logic plugged in via a callback).

See `src/sql/schema.sql` for the full DDL and comments, and
`src/services/incrementEngine.js` / `src/services/payFixationEngine.js` for
the calculation logic.

**No actual UCB pay-scale values, increment dates, or promotion rules are
included.** All seed data in `src/seed/index.js` is placeholder, clearly
tagged `[SAMPLE/UNVERIFIED]`, so it can never be mistaken for a real bank's
configuration. Populate real values only after the applicable service
regulations/settlements/GOs have been verified.

## Project layout

```
src/
  config/       DB connection (MySQL for production, SQLite for zero-setup demo)
  sql/          Canonical MySQL DDL (schema.sql)
  models/       Sequelize models + associations mirroring the schema
  middleware/   authenticate / requireRole / requireOwnOrg (tenant isolation)
  services/     Calculation engines (increment date, pay fixation), auth (JWT+bcrypt), date helpers
  routes/       Auth, Super Admin onboarding, org user management, master-data
                CRUD (post-cadres, government-orders, ksr-rules, employees)
                + the Service Book endpoint
  seed/         Clearly-marked sample/demo data (also runnable directly: npm run seed)
  scripts/      dbInit.js (create tables, non-destructive), dbSync.js (drop+recreate, dev only), demo.js
  server.js     Express app: security headers, rate limits, /health, /api/v1/*, static console
public/         The web console — plain HTML/CSS/JS, no build step
  index.html    App shell
  css/app.css   All styling
  js/app.js     Hash-routed views + API client
```

## Web console

Everything is done in the browser — there is no step that needs `curl`.
There are two kinds of sign-in page, served by the same app:

| Address | Who signs in there | Branding |
| --- | --- | --- |
| `https://<host>/` | Super Admins (Banihal staff) only | Platform logo + name |
| `https://<host>/o/<CODE>` | That bank's users only | The bank's logo + name, "Powered by Banihal" with the platform favicon |
| `https://hrms.theirbank.in/` (optional) | That bank's users only | The same page as `/o/<CODE>` — the app resolves the bank from the domain |

Each bank's page is unique to it: a user can sign in only on their own
bank's page, a Super Admin only on the platform page. A bank user who types
their (correct) password on the platform page is told their bank's address;
a wrong password gets the same generic error either way, so the hint can't
be used to find out which emails exist.

**Custom domain (CNAME).** A bank can be served on its own subdomain instead
of the shared `/o/<CODE>` link. At onboarding (or later, on the bank's page)
a Super Admin records the domain; the client creates a DNS **CNAME** from that
hostname to the application's host. Every request then resolves the tenant
from its `Host` header, so that address renders the bank's own sign-in page
with no `/o/<CODE>` in the URL, and welcome emails use it. **Verify connection**
does a live DNS lookup (CNAME, or A/AAAA matching the app's address) and records
when it last passed — informational, never an access gate. TLS/termination is
the reverse proxy's job; the app only stores the hostname and resolves it.

The console is **white/light by default** for everyone; the top-bar toggle
switches to dark and remembers that explicit choice per browser.

**Super Admin screens**

- **Overview** — organisation counts, licences expiring in 30 days,
  suspended/expired banks, failed sign-ins in the last 24 hours, and a
  "needs attention" list (expiring, expired, suspended, at a seat limit).
- **Organisations** — onboard a bank (code, names, regulator, address,
  licence, and an optional own web address in one form); open a bank to
  manage its **licence & access** (plan, valid from/until, max users, max
  employees, notes, "Extend by 1 year", **Suspend / Reactivate**), profile,
  logo, **custom domain** (with the CNAME record to hand the client and a
  **Verify connection** check), and Organisation Admins; copy its sign-in
  address; manage all its users.
- **Platform users** — create more Super Admins; reset password, reset
  MFA, deactivate/reactivate. You can't deactivate yourself or the last
  active Super Admin.
- **Settings** — *General* (platform name, company name shown as "Powered
  by", support email/phone, application URL for emailed links, a message
  shown on every sign-in page); *Branding* (**main logo** and **favicon** —
  the favicon is the browser-tab icon everywhere and the small mark on every
  bank's pages); *Email (SMTP)* with a test button.
- **Audit log** — everything, filterable by bank and activity.

**Organisation Admin screens**

- **Overview** — licence plan and validity, seats used, email status, the
  bank's sign-in address, and a getting-started checklist.
- **Users** — create users (optionally emailing them their sign-in
  details), change role inline, reset password, reset MFA,
  deactivate/reactivate. Seat usage against the licence is shown.
- **Establishment** — Employees, Posts & cadres, Pay scales (with a stage
  ladder editor) and Pay revisions; **Rules** — GO register and KSR rules;
  per-employee **Service Book** (timeline + add entry).
- **Settings** — organisation details (the registered name/code/licence are
  read-only here — only a Super Admin changes those), **logo**, **web
  address** (the bank's sign-in link plus, when the platform has connected
  one, its custom domain and the CNAME to set), and the bank's **own SMTP**
  server (when off, the platform's is used).
- **Audit log** — the bank's own activity only.

HR Admin / HR Officer / Accounts / Payroll / Approving Authority /
Department Head see the establishment and rules screens (what they can
*change* depends on role — see below). Employee logins see only My account
for now. Everyone has **My account**: profile, change password, and
two-factor authentication.

The console is plain HTML/CSS/JS in `public/` — **no build step, no CDN** —
split into `core.js` (session, API, router, layout), `components.js`
(shared widgets), and one `views-*.js` file per area. The JWT is kept in
`sessionStorage` (closing the tab signs out). No inline scripts or styles,
so the strict CSP holds.

## Multi-tenant access, licensing and MFA

**Tenants.** Every bank is an `organization`; every data row belongs to one.
For every org-scoped route, a bank user's `organizationId` comes from their
token and is force-applied: lists are filtered to it, creates are stamped
with it, another bank's row answers `404`. **References are checked too** —
an employee can't be pointed at another bank's post, pay scale or stage, a
rule can't cite another bank's GO (`refs` in `src/routes/crudFactory.js`).

**Onboarding.** No self-service signup. A Super Admin creates the bank and
its Organisation Admin; the Org Admin creates everyone else. Temporary
passwords are shown once (and optionally emailed), bcrypt-hashed, and must
be changed at first sign-in. The only way to create the *first* Super Admin
is the token-gated bootstrap endpoint (see Bootstrapping).

**Licence & access** (per bank, set by a Super Admin):

| Control | Effect |
| --- | --- |
| Suspend / Reactivate | Suspended = nobody from the bank can sign in, and sessions already open stop working on their next click. Nothing is deleted. |
| Valid from / Valid until | Outside the window, sign-in and existing sessions are refused with a clear message. Dates are Indian calendar dates; access lasts through the whole expiry day. |
| Max active users | Creating or reactivating a user beyond the limit is refused. Deactivating someone frees a seat. Empty = unlimited. |
| Max active employees | Same, for active employee records. |
| Plan | Trial / Standard / Professional / Enterprise / Custom — picking one pre-fills suggested dates and limits, which you can change. |

Bank users see a warning banner from 30 days before expiry. Access checks
run on **every request**, not just at sign-in (`src/services/orgAccess.js`).

**Two-factor authentication (TOTP).** Off by default for everyone;
each person turns it on for themselves in **My account** by scanning a QR
code with any authenticator app and confirming a code (the secret is saved
only after a correct code, so a botched setup can't lock anyone out). Turning
it off asks for the password again. Secrets are AES-256-GCM encrypted at
rest. Lost phone: an Org Admin resets MFA for their bank's users, a Super
Admin for anyone including other Super Admins; if the *only* Super Admin
loses their phone, use the break-glass `/admin/setup/reset-super-admin-mfa`
endpoint (token-gated, same as bootstrap). The console prompts admin
accounts to turn it on; it isn't forced — make it mandatory later if the
banks' policy requires.

**Roles on establishment data** (server-enforced; the UI just hides buttons):

| Data | Can view | Can change |
| --- | --- | --- |
| Employees, Service Book entries | all staff roles except Employee | Org Admin, HR Admin, HR Officer |
| Posts & cadres, GO register, KSR rules | all staff roles except Employee | Org Admin, HR Admin |
| Pay revisions, pay scales, stages | all staff roles except Employee | Org Admin, HR Admin, Payroll Officer |
| Users, Settings, Audit log | Org Admin | Org Admin |

**Email.** Platform SMTP (Super Admin → Settings → Email) and per-bank SMTP
(Org Admin → Settings → Email). A bank's mail uses its own server when
enabled, otherwise the platform's; if neither is set up, nothing breaks —
temporary passwords are always shown on screen, and "Forgot password?"
simply can't deliver. SMTP passwords are encrypted and never returned by the
API. Mail sent: welcome emails with temporary passwords (only when the
admin ticks the box), password-reset links (single use, 30 minutes, only the
token's hash is stored), and test messages.

**Audit log.** Append-only record of sign-ins, failed sign-ins (with the
reason), MFA changes, password resets, user/role/status changes, bank
onboarding, licence changes, suspensions, logo/settings/SMTP changes, pay
scale stage changes and Service Book entries — with actor, IP and time.

## API

All JSON under `/api/v1`; `GET /api` lists every route. Main groups:

| Group | Routes | Who |
| --- | --- | --- |
| Public | `GET /public/branding` (resolves the tenant from the request `Host`, else the platform), `GET /public/org/:code` | anyone (branding only) |
| Auth | `POST /auth/login {email,password,orgCode?}`, `POST /auth/mfa/verify-login`, `GET /auth/me`, `POST /auth/change-password`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/mfa/setup`, `POST /auth/mfa/confirm`, `POST /auth/mfa/disable` | — |
| Platform | `/admin/dashboard`, `/admin/organizations[/:id]` (GET/POST/PUT — `customDomain` field), `/admin/organizations/:id/domain` (GET the CNAME record), `/admin/organizations/:id/verify-domain` (POST live DNS check), `/admin/organizations/:id/admin-users`, `/admin/organizations/:id/logo`, `/admin/platform-users[/:id]` (+ `/reset-password`, `/reset-mfa`), `/admin/settings`, `/admin/settings/{logo,favicon,smtp}`, `/admin/settings/smtp/test`, `/admin/audit` | Super Admin |
| Bank admin | `/org/settings`, `/org/settings/{logo,smtp}`, `/org/settings/smtp/test`, `/org/audit`, `/organizations/:orgId/users[/:id]` (+ `/reset-password`, `/reset-mfa`) | Org Admin (users: also Super Admin) |
| Establishment | `/post-cadres`, `/government-orders`, `/ksr-rules`, `/pay-revisions`, `/pay-scales`, `/pay-scales/:id/stages` (GET/PUT), `/employees`, `/employees/:id/service-book`, `POST /employees/:id/service-book/events` | bank staff, per role table above |
| Images | `/assets/platform/logo`, `/assets/platform/favicon` (also `/favicon.ico`), `/assets/org/:code/logo` | anyone |

`DELETE` on establishment data is always a soft delete (deactivate /
supersede). Pay stages can be added but never removed, and a stage already
used in someone's pay record can't have its amount changed — introduce a new
pay revision instead. Service Book entries are append-only and limited to
non-pay events; increments, promotions and pay revisions will be posted by
the pay engines so their calculation trace is kept.

## Running the demo (no MySQL needed)

```bash
npm install
npm run demo
```

This uses SQLite (`dev.sqlite`, created fresh each run) and prints the
increment-date and pay-fixation engines working against sample data,
including a step-by-step calculation trace for each result — the same
`calculation_trace` JSON that gets persisted to `employee_increment_status`
and `employee_pay_history` for audit purposes.

## Seeding demo tenants (organisations + staff)

```bash
npm run seed:demo             # create the sample banks — idempotent, safe to re-run
npm run seed:demo -- --reset  # rebuild this seeder's own employee rows first
```

Creates five sample banks (DEMO-UCB plus TVM-UCB, EKM-UCB, KKD-UCB and KTM-UCB,
spanning different Kerala UCB licensing classes). Each one gets its provisioned
post/pay-scale/stage library, the default leave types, an **Org Admin** and
**HR Admin** login, and a full staff roster (≈10–13 employees) with matching
Service Book and pay-ledger entries. Every seeded login shares the password
**`DemoPass123!`**; bank users sign in on their bank's own page — e.g.
`admin@tvm-ucb.in` at `/o/TVM-UCB` (or `admin@demo-ucb.in` at `/o/DEMO-UCB`).

It only ever adds: organisations are matched by code, users by e-mail and
employees by (bank, emp code), so re-running never duplicates or overwrites
anything. `--reset` deletes only rows this seeder itself created (recognised by
a marker it writes) — hand-entered employees are left untouched. All of it is
invented sample data for testing only; never point it at a real bank's database.

## Running against real MySQL

Summary:

1. Copy `.env.example` to `.env` and fill in real MySQL credentials
   (`DB_DIALECT=mysql`), a real `JWT_SECRET` (generate one — see the comment
   in the `.env.example` file), and — only while you run the setup calls
   below — `SETUP_TOKEN` plus `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`.
2. Create the tables, non-destructively: `npm run db:init` (safe to re-run;
   only creates tables that don't exist yet, never drops or alters).
   `npm run db:reset` also exists but **drops every table first** — local
   development only; it refuses to run under `NODE_ENV=production` unless
   explicitly overridden.
3. Start the app: `npm start` (binds to `process.env.PORT`, exposes
   `/health` and `/health/db` for verifying the deployment).
4. **Bootstrapping (no shell access needed — see below)**: create the first
   Super Admin, then log in as them and use `POST
   /api/v1/admin/organizations` + `POST
   /api/v1/admin/organizations/:id/admin-users` to onboard your first real
   UCB tenant and its Org Admin.
5. Replace `src/seed/index.js` with real organization/scale/policy data once
   verified, or build the admin screens to enter it (next slice).

## UAT deployment (rootless Podman on Rocky Linux)

`deploy.sh` automates the whole UAT stack: nginx TLS edge (self-signed),
backend container, MySQL 8, Redis 7, nightly DB backups, systemd user units
(Quadlet) so everything restarts on reboot — all rootless, on a stable named
network `hrms-net` with a fixed subnet and static per-container IPs.

```bash
# one-time: get the checkout on the server
rsync -a --exclude node_modules --exclude '.env*' --exclude '*.sqlite' \
      ./ server:/srv/ucb-hrms/

# every deploy (from the checkout on the server)
./deploy.sh
```

What you get after a full run:

- **Main links** — `https://<host>/` (console), `https://<host>/api`,
  health at `https://<host>/healthz` and `/ready`.
- **Secrets** — generated once into `~/.config/ucb-hrms/.env` (0600) and
  reused on every re-deploy. Never copied from `.env.example`.
- **Data** — a mysqldump-style `.sql` (schema + data) import prompted at
  stage 7. **No seeding ever runs.** On boot the app applies its additive
  schema upgrade (`AUTO_MIGRATE=true` — missing tables/columns only; a
  restored dump that predates later slices is brought up to code level).
- **Network drift verification** (stage 6) — stores the network ID baseline;
  if the network is recreated or a container lands off its static IP between
  deploys, the deploy aborts loudly. Deliberate rebuild requires
  `./deploy.sh --recreate-network` (then re-restore).
- **Backups** — nightly at 01:05 UTC (`systemd --user` timer spawning a
  throwaway mysqldump container), 14 dumps kept in `hrms-backups`:

```bash
./deploy.sh --backup-now   # manual dump
./deploy.sh status         # units, timer, network, last restore hash
```

Requirements: a Linux server with systemd (tested intent: Rocky 9 primary;
Ubuntu/Debian 24.04+, Fedora, openSUSE, Arch also work — the script reads
`/etc/os-release` and uses that distro's package manager for the podman
install). Podman ≥ 4.4 is mandatory (Quadlet); a regular (non-root) user
with sudo for the few setup commands the script prints when it needs them,
~15 GB disk. Podman must run rootless (`podman info` reports Rootless=true).

### Bootstrapping (no SSH/shell access needed)

Same pattern as the DB-setup endpoint: a token-gated URL you hit once from a
browser, then lock back down.

1. Set `SETUP_TOKEN`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, and `JWT_SECRET`
   (a real random secret — this one stays set permanently). Redeploy.
2. Visit `https://yourapp/admin/setup/init-db?token=YOUR_SETUP_TOKEN` once
   (creates the `users` table along with everything else, if not already
   run for this slice).
3. Visit
   `https://yourapp/admin/setup/bootstrap-super-admin?token=YOUR_SETUP_TOKEN`
   once. It refuses to run a second time (checks whether a SUPER_ADMIN
   already exists), so it's safe to leave the URL lying around briefly.
4. Remove `SETUP_TOKEN` (and `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`,
   optional) from the environment variables and redeploy — both
   `/admin/setup/*` endpoints refuse to do anything once `SETUP_TOKEN` is
   unset.
5. Open `https://yourapp/` in a browser, sign in as the Super Admin, set a
   real password when prompted, turn on two-factor authentication from
   **My account**, then onboard your first bank from **Organisations**.
   Nothing after this step needs `curl`.

**Upgrading an existing deployment**: just deploy. On startup the app
creates missing tables and adds missing columns (additive only; it never
drops or alters existing ones) and logs `Schema upgraded — added: …` or
`Schema up to date.`. Set `AUTO_MIGRATE=false` to switch this off — e.g. on
the production server if schema changes must go through change control —
and use `npm run db:init` / `/admin/setup/init-db` instead.

## Security posture (current)

Not a full hardening pass — that comes before real employee data — but what
is in place:

- **Passwords**: bcrypt (cost 10). Temporary passwords come from a
  cryptographic RNG, are shown once and can only be re-issued. Unknown
  emails take as long to reject as wrong passwords (no timing leak).
- **MFA**: optional TOTP per account; secrets AES-256-GCM encrypted; the
  mid-sign-in challenge token is short-lived (5 min) and can't be used as a
  session.
- **Sessions**: JWT, 12 h default, in `sessionStorage`. Every request
  re-checks the user *and* their bank's licence/suspension, so deactivation
  and suspension take effect immediately.
- **Tenant isolation**: server-side from the token, including foreign-key
  references. Each bank has its own sign-in page that only its users can use.
- **Brute force**: 20 *failed* sign-ins per IP per 15 min (successful ones
  don't count, so a branch full of staff behind one office IP isn't locked
  out; tune with `LOGIN_MAX_FAILURES`); MFA code checks 10 failures;
  password-reset requests 5 per IP per hour; setup endpoints limited.
- **Uploads**: logos are type-checked by their bytes (PNG/JPEG/WebP, ICO for
  the favicon), size-capped, and **SVG is refused** (it can carry script).
  They're served with `Content-Security-Policy: default-src 'none'` and
  `nosniff`.
- **Headers**: helmet with a strict CSP (`default-src 'self'`, no
  `unsafe-inline`), `frame-ancestors 'none'`, HSTS, same-origin referrer.
- **Audit**: append-only log of security-relevant and admin actions.

`JWT_SECRET` also derives the key that encrypts MFA secrets and SMTP
passwords — **changing it** signs everyone out, disables everyone's MFA
(it has to be reset) and requires SMTP passwords to be re-entered. Set it
once, keep it safe, back it up.

Still to do before production: versioned migrations instead of `sync()`,
database encryption at rest and backups, secrets management, httpOnly
cookie sessions with CSRF protection, optional mandatory-MFA policy per bank,
audit-log retention/export, and the DPDP consent/retention layer.

## What's next

- Increment & pay-fixation **policy screens** (currently seeded in code) and
  posting increments/promotions through the engines into the Service Book
- Bulk pay revision run (re-fix every affected employee for a new settlement)
- Leave, allowances & deductions, payroll run, arrears, loans, pension
- Employee self-service (own Service Book, payslips) for the Employee role
- DPDP Act layer (consent records, data-subject requests, retention)
- Versioned migrations before real data goes in
