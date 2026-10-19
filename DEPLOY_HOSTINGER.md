# Deploying to Hostinger (TEST environment only)

This covers getting the current framework slice running on Hostinger for
testing. **Production will run on your own Linux server** — nothing here is
meant to be the permanent home for real employee/pay data; treat anything
loaded here as disposable test data.

Deploy method: **ZIP upload** through hPanel's Node.js App screen.
Shell access: **SSH available** — used below for `npm install` and the
one-time DB setup, which is faster and more reliable than hPanel's own
install button for a project this size.

---

## 1. Create the MySQL database

In hPanel → **Databases → MySQL Databases**:

1. Create a new database (e.g. `ucbhrms`) — Hostinger will name it
   `u123456789_ucbhrms` (your account's actual prefix).
2. Create a new database user, and **note the generated password** —
   Hostinger doesn't show it again.
3. Attach the user to the database with **All Privileges**.
4. Note down: database name, username, password, host (usually `localhost`
   from within Hostinger, or a shown hostname if using a remote MySQL
   endpoint).

## 2. Create the Node.js App

In hPanel → **Advanced → Node.js**:

1. Create a new application.
   - **Application root**: a folder under your hosting account, e.g.
     `ucb-hrms` (this is where the ZIP gets extracted to).
   - **Application URL**: the subdomain/path you want for testing, e.g.
     `ucb-hrms-test.yourdomain.com` or Hostinger's auto-assigned
     `*.hostingersite.com` domain (matches the pattern of your existing
     Banihal HR app deployment).
   - **Application startup file**: `src/server.js`
   - **Node.js version**: 18.x or later.
2. Save. Hostinger will show you the application root's full server path —
   you'll need it for the SSH steps below.

## 3. Upload the code

1. Zip the project **without `node_modules`** (already excluded — see the
   ZIP delivered alongside this guide).
2. hPanel → **Files → File Manager**, navigate to the application root
   folder created in step 2, upload the ZIP, and extract it there.
   (Alternatively, SSH in and `scp`/`sftp` the ZIP up, then `unzip` it.)

## 4. Configure environment variables

Two options — either works, use whichever hPanel's Node.js screen offers
for your plan:

- **hPanel's Node.js App → Environment variables** section: add each
  `DB_*` / `NODE_ENV` key from `.env.hostinger.example` individually, with
  your real DB credentials from step 1.
- **Or**: SSH in, `cd` to the application root, `cp .env.hostinger.example
  .env`, then edit `.env` with the real values (`nano .env` or `vi .env`).

Either way, do **not** commit real credentials back into the ZIP/repo.

**Also required now (auth):** set `JWT_SECRET` to a real random value (see
the comment in `.env.hostinger.example` for how to generate one) — the app
won't be able to sign/verify login tokens without it. Leave `SETUP_TOKEN`,
`SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` unset for now; you'll set
those temporarily, and only briefly, in step 5a below.

> **Note on managed deploy-pipeline Hostinger accounts:** if your plan uses
> the newer Websites → Deployments product instead of classic SSH-accessible
> Node App hosting (no `npm`/shell access in the runtime environment), skip
> the SSH commands in step 5 — use the token-gated `/admin/setup/init-db`
> and `/admin/setup/bootstrap-super-admin` HTTP endpoints described in the
> README's "Bootstrapping (no SSH/shell access needed)" section instead.
> `npm install` still happens automatically on deploy in that product.

## 5. Install dependencies and set up the database (via SSH)

```bash
ssh your-user@your-hostinger-host
cd ~/path/to/ucb-hrms          # the application root from step 2
npm install --omit=dev         # skips sqlite3 (dev-only, not needed here)
NODE_ENV=production npm run db:init   # creates tables — non-destructive
```

`db:init` only creates tables that don't already exist; re-running it later
(after you add more tables in the next slice) is safe and won't touch
existing data. Do **not** run `npm run db:reset` here — that drops every
table and is for local development only (it also refuses to run under
`NODE_ENV=production` unless you explicitly override it).

Optional, to see the framework working end-to-end with clearly-marked
sample data (same as the local demo, but persisted to this MySQL DB):

```bash
node src/seed/index.js
```

### 5a. Create the first Super Admin login

There is no self-service signup — the first login on a fresh deployment is
created via a one-time, token-gated endpoint (same idea as `init-db`
above). Steps:

1. Temporarily set `SETUP_TOKEN`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`
   in the environment variables and restart/redeploy.
2. Visit `https://<your-app-url>/admin/setup/bootstrap-super-admin?token=<SETUP_TOKEN>`
   once — it refuses to run again once a SUPER_ADMIN exists.
3. Remove `SETUP_TOKEN` (and the `SUPER_ADMIN_*` vars, optional) and
   redeploy so the endpoint disables itself again.
4. `POST /api/v1/auth/login` with those credentials, then use `POST
   /api/v1/admin/organizations` + `POST
   /api/v1/admin/organizations/:id/admin-users` to onboard the first real
   UCB tenant.

## 6. Start / restart the app

Back in hPanel's Node.js App screen, click **Restart**. Hostinger's
Passenger process manager starts `src/server.js` and keeps it running.

## 7. Verify

```
https://<your-app-url>/health      → {"status":"ok", ...}
https://<your-app-url>/health/db   → {"status":"ok","dialect":"mysql"}
```

If `/health/db` returns an error, double-check the `.env` DB credentials
against what hPanel shows for the database (step 1) — this is almost
always a credentials/host mismatch.

## 8. Re-deploying after a code change

1. Re-zip the project (excluding `node_modules`).
2. Upload and re-extract over the application root (or `git pull` if you
   later switch to the GitHub-connected method).
3. SSH in, `npm install --omit=dev` again if `package.json` changed.
4. `npm run db:init` again if new tables were added (non-destructive, safe
   to always re-run).
5. Restart the app in hPanel.

---

**Reminder:** this Hostinger setup is for testing the framework only. Once
a module is verified here, the same `schema.sql` / Sequelize models /
`.env`-driven config move to your own Linux server for production, with the
DPDP/security hardening from the architecture doc (encryption at rest,
proper secrets management, backups) applied before any real employee data
is loaded.

---

## Upgrading to the platform-administration slice (MFA, licences, logos, SMTP)

Your live database already has the earlier tables. This slice adds five
tables and some new columns on `organization`; nothing existing is changed.

1. Upload the new ZIP and deploy (npm install runs automatically — it adds
   `nodemailer`, `otplib`, `qrcode`, `helmet`, `express-rate-limit`).
2. That's it for the database: on startup the app adds any missing tables
   and columns itself (additive only — never drops or changes existing
   ones). The Runtime log shows `Schema upgraded — added: …` the first
   time, and `Schema up to date.` after that. No `SETUP_TOKEN` needed.
   (If you ever see `Unknown column …`, the startup upgrade didn't run —
   check the Runtime log for `Schema check failed`, or run
   `/admin/setup/init-db?token=…` as before.)
3. Sign in at `https://hrms.banihal.in/` → Settings: upload the main logo
   and favicon, set the application URL, and set up Email (SMTP). For a
   Hostinger mailbox: host `smtp.hostinger.com`, port `465`, security
   **SSL/TLS**, username = the full mailbox address, From = the same
   address. Use **Send test** to confirm.
4. Open each existing bank under Organisations and set its licence (plan,
   validity, limits). Banks with no licence fields set keep working exactly
   as before — empty means "no expiry, unlimited".
5. Give each bank its own sign-in address (`/o/<CODE>`, shown on its page).
   Bank users can no longer sign in on the platform page — they'll be shown
   their bank's address if they try.

**Do not change `JWT_SECRET`** once MFA or SMTP are in use — it also
encrypts those secrets (see README → Security posture).

---

## Upgrading to the bank-class / pay-scale library slice

Adds `organization.bank_class` and `employee.employment_type`; upgraded the
same way as above (deploy the new ZIP, the app adds the columns itself on
startup — no manual step). Nothing existing changes.

- **Every new organisation now requires a bank class** (Special Grade,
  Class I–V) at creation — it's a new required field on the onboarding
  form. Choosing it auto-provisions that class's posts and pay scales
  (current + previous) from the Kerala UCB pay-scale annexure straight into
  the bank's Post/Cadre and Pay Scale screens, so there's no manual
  transcription. It can be changed at any time afterwards (Organisation
  profile → Bank class) — switching adds that class's posts/scales if the
  bank doesn't already have them; nothing already there, or in use by an
  employee, is ever changed or removed.
- **Existing organisations are unaffected** — `bank_class` stays NULL for
  them and nothing is retroactively seeded; their existing posts/scales are
  untouched. If a live bank wants the reference library, it's fastest to
  transcribe the handful of posts it actually uses rather than migrate.
- **Employees now have an "Employment type"** field (Regular or Part-Time
  Contingent). Every organisation — regardless of class — is also seeded
  with a single common "Part-Time Contingent" post and pay scale (Annexure-II
  of the source document); picking that employment type on an employee
  points them at it.
- One documented gap in the source: **Class III has no "System
  Administrator" post** in the pay-scale annexure (the row numbering itself
  skips it) — it isn't seeded for that class. Add it by hand if/when the
  correct scale is confirmed.
- The seeded pay revisions are marked "Rule verification required" in their
  description: the source gives pre-revised/revised scale amounts but no
  Government Order effective date, so placeholder dates are used until
  confirmed.
