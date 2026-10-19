# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Frontend is being rebuilt from the incumbent vanilla JS/CSS SPA (no build step) to **React + Vite** (user decision, Oct 2026). Backend is Node.js/Express (SQLite for demo, MySQL for production) and is **preserved unchanged** — the UI rebuild talks to the same `/api/v1` REST API. Deploy target is a **dedicated hosting server** (own Linux server per README); a simple static-build-served-by-Express flow is still the default [INFERRED from README "production is planned for your own Linux server"].

## Users

Eight roles across two surfaces:

- **Super Admin** (Banihal platform staff) — operates the platform console at `/`: overview, organisations (banks) onboarding & licensing, platform users, settings, audit log.
- **Organisation Admin** — operates one bank's console at `/o/<CODE>`: overview, users, establishment data, settings, organisation profile, audit log.
- **HR Admin / HR Officer / Accounts Officer / Payroll Officer / Approving Authority / Department Head** — bank staff with role-scoped read/write on establishment data (employees, service book, posts & cadres, pay revisions/scales, GO register, KSR rules).
- **Employee** — currently sees only "My account"; self-service (service book, payslips) is roadmap work this overhaul should address.

## Product Purpose

A multi-tenant HRMS & Payroll system for Urban Co-operative Banks (UCBs) following Kerala service rules. It manages the full establishment chain — Organisation → Post/Cadre → Pay Revision → Pay Scale → Pay Stage → Increment Policy → Pay Fixation Policy → Employee → Calculation Engine → Service Book — with increment-date and pay-fixation engines driven entirely by configuration, not code. Success means a bank's HR/payroll staff can run the complete establishment-to-payroll workflow without touching code, and every calculation is traceable and auditable.

## Positioning

The config-driven calculation engine: increment dates and promotion pay-fixation are per-organisation policies (date bases, notionally-increment-then-fix vs direct-next-higher-stage vs defer-to-next-increment), with persisted calculation traces for audit. A generic HRMS cannot truthfully copy this — the product is the Kerala service-rules engine made tenant-configurable.

## Operating Context

- Two sign-in surfaces share one app: platform (`/`) and per-bank (`/o/<CODE>`), each with its own branding; a user can only sign in on their own surface.
- JWT in sessionStorage (dies with the tab); every request re-checks user + bank licence/suspension.
- Bank operations run on shared branch machines; density and keyboard efficiency matter; 15px-ish base, long tables, frequent modal-light workflows [INFERRED from incumbent UI patterns].
- Indian context: en-IN locale, ₹ formatting, DD Mon YYYY dates, Kerala service rules, DPDP Act compliance layer planned.
- Workflows: user provisioning with one-time temp passwords, MFA setup, bank onboarding with licence windows, pay scale stage ladders, service book append-only events, payroll runs, arrears, leave, allowances.

## Capabilities and Constraints

- **Preserve (hard floor):** data model & REST API; security posture (bcrypt, TOTP MFA with AES-256-GCM-encrypted secrets, tenant isolation, audit log, rate limits, CSP, helmet).
- **Currently built:** auth (login/MFA/forgot/reset), platform console (dashboard, organisations, platform users, settings, audit), bank console (dashboard, users, employees, posts & cadres, pay scales, payroll, DA arrears, allowances, leave types, year-end, GO register, KSR rules, org settings, org profile, audit), shared components (forms, tabs, stat tiles, logo uploader, SMTP, audit table).
- **Roadmap (UI currently missing or thin):** increment & pay-fixation policy screens, bulk pay revision run, employee self-service (own service book, payslips), DPDP layer, loans, pension.
- **Constraints:** no real UCB pay-scale values, increment dates, or promotion rules ship with the product — all seed data is placeholder `[SAMPLE/UNVERIFIED]`; the UI must work with config-driven data, never hard-coded rules. The two-entry-point branding model (platform vs bank) must survive the rebuild.
- **Open decisions:** visual identity (elevate incumbent dark-teal system vs replace the world) — undecided, goes to the direction round; exact charting library; component library vs hand-rolled.

## Brand Commitments

The user confirmed (Oct 2026) the **Salary Passbook** visual direction for the frontend rebuild: warm ivory paper ground, bank-blue ink, a red-ink accent reserved for money/dates, ruled hairline boundaries, tabular figures, a running-balance signature move, and an authority-stamp approval motif. This is the product's confirmed visual identity. The incumbent dark-teal identity is replaced. Two sign-in surfaces (platform + per-bank) with their branding remain binding product constraints.

## Evidence on Hand

- `README.md` — full product documentation (authoritative product truth).
- `public/` incumbent UI — runnable reference of every current screen.
- `src/` backend — schema, engines, routes (preserved).
- No real bank data, no customer logos, no testimonials, no marketing assets. Demo data is synthetic and `[SAMPLE/UNVERIFIED]`-tagged.

## Product Principles

1. **Configuration over code** — every rule is tenant data; the UI never hard-codes Kerala service logic, only renders it.
2. **Trust through trace** — calculations carry traces; every action is auditable; the UI surfaces both.
3. **Tenant isolation by default** — the UI can never show one bank's data in another's console; branding makes the boundary visible.
4. **Earned familiarity** — Operate-mode craft: the tool disappears into the task; consistency over surprise; density where users need it.
5. **Security as a floor** — MFA, licensing, and session posture are preserved untouched; the UI enforces, never weakens, them.

## Accessibility & Inclusion

No product-specific requirement established beyond a working strict-CSP web console. Branch-machine context (shared screens, likely mixed ages/abilities) favors keyboard operability and clear focus states [INFERRED].
