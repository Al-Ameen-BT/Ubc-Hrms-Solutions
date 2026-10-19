# UCB HRMS & Payroll — Complete UI/UX Design & Structural Plan

**Status:** Direction confirmed — **Salary Passbook** · **Date:** Oct 2026 · **Stack decision:** React + Vite rebuild on the preserved Express/REST backend · **Deploy:** dedicated hosting server

This plan covers the entire application UI/UX: the visual direction, the design system, the structural rebuild, every dashboard, every form, the screen-by-screen inventory, and the phased roadmap. Product truth lives in `PRODUCT.md`; this document owns the design plan.

---

## 1. Executive summary

The incumbent UI is a clean, functional, dark-teal admin console — competent but generic, and missing the entire employee self-service surface. This plan rebuilds the frontend on **React + Vite** (data model, REST API, and security posture preserved untouched), introduces a real design system and component library, replaces every dashboard with role-aware intelligence, rebuilds every form with inline validation and stepper flows, and ships the missing employee portal.

**The visual direction is confirmed: the Salary Passbook** (Section 2) — the ruled, inked, stamped ledger page that every UCB employee knows by heart.

---

## 2. Design direction

### 2.1 The assigned direction — "The Salary Passbook"

**Thesis.** The product's soul is the salary passbook: every employee's permanent record of earnings, deductions, and the running balance of their service. The category default is the grey SaaS admin with rounded cards and a single accent. This direction refuses that. It makes the ruled, inked, stamped ledger page — the one document every UCB employee has held in their hands — the product's visual voice. The passbook is not a metaphor; it is the literal artifact the system produces.

**Own-world (recognizable with all content removed):**
- **Ground:** warm ivory/bone paper (not the incumbent's cool grey `#f4f6f8`) — the passbook's aged paper.
- **Ink:** one bank-blue ink for all rules, labels, and text.
- **Red-ink accent:** reserved exclusively for dates, amounts, and the running balance — the passbook's red date-stamps and figure columns. Colour does a real job: red = money/date, blue = record, and nothing else is coloured.
- **Hairlines:** every boundary is a ruled line (the passbook's ruled rows), not a soft shadow.
- **Figures:** tabular monospace for every number, amount, and date.
- **The stamp:** a rounded-rectangle authority seal motif for verified/approved/fixed states — the bank's rubber stamp.

**Density.** The register rhythm: narrow line-height, dense ruled rows, figures aligned right, dates aligned left. This is a working screen for people who read ledgers all day.

**Signature move — the running balance.** Every monetary list (payroll history, arrears, service-book pay effects, DA revisions) carries a **live running-total column** that recalculates in place as rows change, and approved/fixed states render as a **literal authority stamp**. A visitor who leaves after one viewport describes: "a bank ledger that totals itself and stamps its approvals."

**First viewport (shell-first):** The standard product shell — topbar, sidebar, main — painted in the passbook's material. The topbar is bank-blue with the bank's seal-mark; the sidebar is the passbook's index (ruled sections with lettered keys); the main is the ruled page. On the bank dashboard: KPI tiles read as ruled ledger lines with running-balance figures; the service book is a ruled page; a payroll run renders as a counterfoil voucher.

**Honest risk.** The passbook is warm and paper-born in a category that defaults to cool SaaS grey; if the paper ground is not disciplined it reads as "theme," not as a ledger. The red-ink accent must be held to money/dates only.

### 2.2 Challenger verdicts (weighed, not dropped)

Six catalog challengers were fused with the product and weighed on audience identification and product clarity. None beat the passbook on both axes; four were **competitive** (held one axis) and donate real discipline to the direction; two were **declined**.

| Challenger | Verdict | What it donates to the passbook direction |
|---|---|---|
| Darkroom exposure record | Competitive (clarity) | Its eleven-step tonal ramp → the chart/data-series tonal scale; its 90° cross-hatch → the rule-conflict marker (two overlapping increment/stage rules render cross-atched) |
| Railway timetable slide rack | Competitive (clarity, strong) | Its tick rail → the dashboard position/extent indicator (where you are in a long register); its one-type-size discipline → data surfaces set rank by weight/case/rule, not size |
| Centre-rail reference setting | Competitive (clarity, strong) | Its ruling-engine hairlines drawn at one device pixel → every rule in the app; its keyed centre rail → the sidebar as a lettered key index; its printed-mark state vocabulary (rest / pressed / disabled / focus) |
| Boarding-pass gate board | Competitive (clarity) | Its holds-alert-until-acknowledged pattern → payroll-run and licence/suspension status changes that flash and hold until acknowledged |
| Emigre bitmap specimen | Declined (loses both) | Pixel display type is foreign to banking and harms dense-figure legibility |
| Streaming catalog wall | Declined (loses both) | Tile rails do not serve dense data tables; only its focused-row-lifts state survives as the table's selected-row treatment |

### 2.3 Alternatives on the table

1. **The Salary Passbook** (recommended, assigned) — the ledger world above.
2. **The Government File** (Impeccable's pick) — my top-ranked grounded candidate: the U.O. proceedings register with file numbers, subject lines, margin annotations, and rubber-stamp approvals. The GO register, KSR rules, and service book are literally this artifact. *Honest risk: familiar and effective — it is where the category's strongest government-adjacent products live; the risk is it reads as a generic government-ERP look rather than a bank's.*
3. **The category standard** (canon) — the incumbent dark-teal admin console played straight, or the generic modern SaaS admin look, at full fidelity. The quiet permanent exit; never recommended, always available.

---

## 3. Design system

### 3.1 Tokens

A hand-rolled token layer (`tokens.css`, consumed as CSS custom properties — CSP-safe, no runtime):

- **Ground:** `--paper: #f7f3ea` (warm ivory), `--paper-raised: #fffdf6`, `--paper-sunken: #efe9da`
- **Ink:** `--ink: #1d3a4a` (bank blue), `--ink-soft: #4a6a7a`, `--ink-faint: #8aa0ac`
- **Rule:** `--rule: #d8d0bc` (the passbook's ruled lines), `--rule-strong: #b8ad94`
- **Red-ink accent (money/dates only):** `--red-ink: #a32020`, `--red-ink-soft`
- **State:** approved green `#1c6b3f`, warning ochre `#8a5a00`, danger `#a32020`, info bank-blue
- **Type scale:** 12 / 13 / 14 / 16 / 20 / 28 — tight 1.2 ratio, fixed rem (no fluid type); display rank carried by weight and case, not size (per the timetable donation)
- **Figures:** `--font-mono` tabular for all amounts, dates, codes, running balances
- **Spacing:** 4px base grid; 4 / 8 / 12 / 16 / 24 / 32 / 48
- **Radius:** 2px (the passbook is squared, not rounded) — the centre-rail donation: no radius anywhere on data surfaces; the shell may keep a whisper of radius
- **Motion:** 150–250 ms, ease-out; state change only; `prefers-reduced-motion` respected
- **Dark mode:** a ledger-ink dark variant (`--paper: #141a1e`, ink reversed), defaulting to `prefers-color-scheme` with a manual toggle persisted per user

### 3.2 Type

- **One workhorse family** for UI (system stack is fine and CSP-safe): headings and labels in the same face, rank by weight/case/reversal.
- **A serif with a banking voice** for the wordmark, the passbook cover, and the payslip header — a face that reads as "official record" (candidates: a served serif, never a CDN font — self-hosted woff2 to keep CSP).
- **Tabular mono** for all figures, dates, codes, and running balances.

### 3.3 Primitives (hand-rolled, `src/components/ui/`)

Button · IconButton · Input · Textarea · Select · Checkbox · Radio · Field (label+hint+error) · Card/Panel · Table (sortable, paginated, selectable, sticky header, skeleton, empty state) · Badge/Stamp · Tabs · Modal (via `<dialog>`) · Drawer · Toast · Skeleton · Tooltip · Pagination · DateInput · MoneyInput · SearchInput · Avatar · ProgressBar · EmptyState · ErrorState · StatLedger (the KPI tile as a ruled ledger line) · Timeline (service book) · Chart wrappers.

Every primitive ships with default / hover / focus / active / disabled / loading / error states.

### 3.4 Patterns

- **Ledger list** — the core data pattern: ruled rows, right-aligned figures, red-ink amounts, running-balance column.
- **Counterfoil** — the payroll-run and payslip pattern: a voucher with a stub, serial number, and a stamp on approval.
- **Ruled page** — the service-book pattern: date column, event particulars, pay effect, running balance, signature/stamp.
- **Keyed index** — the sidebar: lettered section keys, ruled separators.
- **Stamp** — the approval state: a rotated rounded-rect seal with the approver and date.

---

## 4. Structural changes

### 4.1 Architecture

```
frontend/                  # Vite + React (new)
  src/
    main.jsx  App.jsx
    tokens.css             # design tokens (CSS custom properties)
    api/client.js          # H.api equivalent — fetch wrapper, 401/403-org handling
    auth/AuthContext.jsx   # session, /auth/me, role guards, branding loader
    components/ui/         # primitives
    components/patterns/   # ledger list, counterfoil, ruled page, keyed index, stamp
    features/              # one folder per area (auth, platform, org, employees, payroll, …)
    hooks/  lib/  styles/
  index.html               # built to dist/
server/                    # Express — preserved; adds static serving of frontend/dist
```

- **Routing:** React Router with `HashRouter`. The two-entry-point branding model (`/` platform, `/o/:CODE` bank) is preserved: the branding loader reads `window.location.pathname`, fetches `/public/branding` or `/public/org/:code`, and applies logo/favicon/title. Hash routing keeps deep links working on a static host with no server rewrites.
- **State:** TanStack Query for server state (caching, loading, error, retry, invalidation); React Context for auth + branding + theme; no global server-state store. Sidebar-collapse and theme as persisted UI prefs.
- **API:** a typed `api(method, path, body)` wrapper replicating `H.api` exactly — same error shape, same 401 session-expiry and 403 org-licence/suspension handling. **The REST API itself is untouched.**
- **Auth:** the JWT-in-sessionStorage model preserved. An `AuthProvider` loads `/auth/me`, exposes `user/role/organization/branding`, and provides route guards mirroring the role table. `mustChangePassword` flow preserved.
- **Security posture:** preserved untouched — bcrypt, TOTP MFA, tenant isolation, audit log, rate limits, helmet CSP. The CSP is updated to allow the React bundle (still `default-src 'self'`, no `unsafe-inline`; Vite's build is compatible — no inline scripts emitted).
- **Forms:** React Hook Form + Zod — per-field inline validation, dirty tracking, unsaved-changes guard, accessible errors. This is the largest single upgrade over the incumbent's client-side `required` checks.
- **Toasts:** transient feedback moves to a toast system; page-level errors stay inline.
- **Charts:** Recharts (React-native, tree-shakeable) for dashboard series — tonal scale from the exposure-record donation.
- **Command palette:** `Cmd/Ctrl+K` global search over employees, users, organisations, and screens — the power-user navigation layer.
- **Accessibility:** semantic landmarks, focus-visible rings, `aria` on all interactive primitives, 44px targets, keyboard-operable tables and modals, `prefers-reduced-motion` support, live regions for toasts.
- **i18n-ready:** en-IN locale built in (DD Mon YYYY dates, `H.money` ₹ formatting); strings externalised for future languages.
- **No inline scripts/styles:** the strict-CSP discipline of the incumbent is preserved — React's compiled bundle satisfies it.

### 4.2 What stays untouched

- The entire backend: schema, routes, engines, security, audit.
- The REST API contract (every `/api/v1` endpoint).
- The two sign-in surfaces and their branding model.
- The role/permission model (UI mirrors server enforcement).
- All existing workflows — the rebuild re-presents every one of them.

---

## 5. Dashboards

Every dashboard is a **role-aware intelligence surface**: KPI ledgers up top, a primary working chart, a needs-attention or queue table, and the running-balance signature where money is involved. All dashboards share the shell and the keyed-index sidebar; the data leads with what that role acts on.

### 5.1 Super Admin — Platform Overview
- KPI ledgers: organisations (total / active), expiring ≤30 days, expired + suspended, bank users, platform users, failed sign-ins (24 h).
- Chart: sign-ins & failures over 30 days (tonal scale).
- Needs-attention table: expiring / expired / suspended / at-seat-limit organisations (preserved, rebuilt).
- **New:** seat-usage heat list (organisations nearest their limits).

### 5.2 Organisation Admin — Bank Overview
- KPI ledgers: licence plan + validity, active users vs seats, active employees vs limit, email status.
- Sign-in address card (preserved) + getting-started checklist (preserved).
- **New:** upcoming increments (next 30 days) ledger; pending payroll runs; recent activity feed; service-book entries pending.

### 5.3 HR Admin / HR Officer — Establishment Overview
- **New:** employees by cadre/status; headcount trend; upcoming increment dates (the increment engine's output as a forecast ledger); leave-liability summary; recent hires; service-book events this month.

### 5.4 Payroll Officer — Payroll Overview
- **New:** current payroll run status (processed → approved → paid) as a counterfoil with a stamp on approval; arrears outstanding (running-balance ledger); DA revision status; estimated vs actual variance.

### 5.5 Accounts Officer — same establishment view + a financial summary (net pay out, arrears, recoveries).

### 5.6 Approving Authority — an approvals queue: payroll runs and service-book entries awaiting decision, with one-tap approve/reject.

### 5.7 Department Head — a department-scoped summary of the establishment view.

### 5.8 Employee — Self-Service Portal (new surface, the roadmap's missing half)
- My profile · my payslips (list + PDF download via `H.downloadFile` equivalent) · my leave balance + leave application · my service book (read-only ruled page) · my documents.
- The passbook direction is native here: the salary history *is* a passbook page — date, particulars, amount, running balance, stamped "PAID."

---

## 6. Forms

Every form is rebuilt on React Hook Form + Zod with per-field inline validation, hints, dirty-state, and unsaved-changes guards. Multi-section forms become **steppers with a progress rail** (the tick-rail donation); single-section forms stay single-card.

| Form | Today | Planned treatment |
|---|---|---|
| Login / MFA / forgot / reset | inline card | Rebuilt: split-screen with the seal-mark, inline validation, password-strength + show/hide |
| User create | single card | Rebuilt: single card + role-scoped field visibility; temp-password counterfoil preserved |
| Organisation onboarding | single card + licence sub-form | **Stepper:** identity → address → licence → review; plan presets preserved |
| Employee create/edit | (large single form) | **Stepper:** identity → service (DOJ, cadre, post) → pay (scale, stage, fixation preview) → documents → review; the pay-fixation engine's trace preview inline |
| Pay scale + stages | stage ladder table editor | Rebuilt: ladder editor with running-stage validation, in-place stage add (stages never removed — preserved) |
| Pay revision | single form | Rebuilt: revision wizard with affected-employee preview |
| Service book entry | single form | Rebuilt: append-only ruled entry with the event vocabulary |
| Leave application / leave types | basic | Rebuilt: application with balance check + approval flow |
| Allowances / DA arrears | basic tables | Rebuilt: ledger lists with running balances |
| GO register / KSR rules | single forms | Rebuilt: register with numbered entries (the file donation) |
| Payroll process | inline month/year + run list | **Counterfoil wizard:** select month → preview affected → process → approve/reject → mark paid, each state stamped |
| Settings (org / platform / SMTP) | cards | Rebuilt: sectioned settings with the SMTP test-button pattern preserved |
| Increment / pay-fixation policy screens | *missing (roadmap)* | **New:** policy config screens — the increment-date basis picker and the promotion-method picker, with a live calculation-trace preview |
| Organisation profile / board / branches | forms + tables | Rebuilt: profile card, board-member table with headshots, branch list |

---

## 7. Screen inventory & changes

| Current route | Fate in the rebuild |
|---|---|
| `/login`, `/forgot-password`, `/reset-password` | Rebuilt (split-screen, validation) |
| `/change-password`, `/account` (My account, MFA) | Rebuilt (MFA setup preserved; QR + manual key) |
| Platform: `/dashboard` | Rebuilt (§5.1) |
| Platform: `/organisations`, `/organisations/:id`, `…/users` | Rebuilt (stepper onboarding, counterfoil cred panel) |
| Platform: `/platform-users`, `/settings`, `/audit` | Rebuilt (audit table: sortable, filterable, holds-alert on failures) |
| Bank: `/dashboard` | Rebuilt (§5.2) |
| Bank: `/users` | Rebuilt (§6 user form) |
| Bank: `/employees`, `/employees/:id` (service book) | Rebuilt (stepper create; ruled service-book page) |
| Bank: `/posts`, `/pay-scales`, `/pay-scales/:id/stages` | Rebuilt (ladder editor) |
| Bank: `/payroll`, `/payroll/:id` | Rebuilt (counterfoil wizard) |
| Bank: `/da-revisions`, `/allowances`, `/leave-types`, `/year-end` | Rebuilt (ledgers) |
| Bank: `/government-orders`, `/ksr-rules` | Rebuilt (numbered registers) |
| Bank: `/org-settings`, `/org-profile`, `/audit` | Rebuilt |
| **Employee portal (all routes)** | **New** (§5.8) |
| **Command palette** | **New** (Cmd+K) |
| **Increment / pay-fixation policy screens** | **New** (roadmap) |

---

## 8. Phased roadmap

| Phase | Scope | Exit |
|---|---|---|
| **0 — Scaffold** | Vite+React app, tokens, shell, HashRouter, AuthProvider, API client, branding loader, theme, CSP update, design-system primitives | Shell boots on both entry points; login works |
| **1 — Auth surfaces** | Login, MFA, forgot/reset, change-password rebuilt | All auth flows pass |
| **2 — Platform console** | Super Admin: dashboard, organisations, platform users, settings, audit | Every Super Admin screen rebuilt |
| **3 — Bank console core** | Org dashboard, users, employees, service book | Every Org Admin core screen rebuilt |
| **4 — Establishment data** | Posts, pay scales, payroll (counterfoil), leave, allowances, arrears, year-end | The payroll run works end-to-end in the new UI |
| **5 — Rules & settings** | GO register, KSR rules, org settings, org profile | Every bank screen rebuilt |
| **6 — Employee self-service + palette** | Employee portal, command palette, dark-mode polish | The missing surface ships |
| **7 — Hardening** | A11y audit, responsive pass, reduced-motion, perf budget, empty/error/loading states everywhere | Finish review pass |

Each phase ends with a screenshot review round (desktop + mobile) against the direction contract, per the build discipline.

---

## 9. Open decisions (non-blocking; Phase 0 can start)

1. **Serif for the wordmark/payslip** — which self-hosted face (must be CSP-served, no CDN).
2. **Charting library** — Recharts recommended (React-native, small).
3. **Dark-mode default** — auto (`prefers-color-scheme`) with a manual toggle; confirm the toggle's default.

---

## 10. Guardrails

- The REST API, data model, and security posture are **preserved untouched**.
- The two sign-in surfaces and their branding survive the rebuild.
- No real Kerala pay-scale values, increment dates, or promotion rules are invented — the UI renders config-driven data only; demo data stays `[SAMPLE/UNVERIFIED]`.
- No CDN fonts or scripts — everything self-hosted under the strict CSP.
- No inline scripts or styles — the incumbent's CSP discipline holds in the React build.
