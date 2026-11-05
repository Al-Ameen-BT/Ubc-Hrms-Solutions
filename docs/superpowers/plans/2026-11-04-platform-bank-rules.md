# Platform bank rules Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task.

**Goal:** Deliver platform administration of government bank-class rules, posts,
staged pay scales and payroll setup, with immutable published versions.

**Architecture:** A platform-owned catalogue stores one class per revision.
Structured posts, rule references and payroll defaults form an immutable snapshot
after publication. Tenant payroll and employee salary records are not mutated by
publishing. Reuse existing bank classes, scale expansion, payroll field metadata,
authentication and house React components.

**Tech Stack:** Existing Express/Sequelize/MySQL and React/React Query; node:test
with an isolated in-memory SQLite database. No new dependencies.

**Spec:** docs/superpowers/specs/2026-11-04-government-pay-catalogue-design.md

## Global constraints

- Latest request focuses this delivery on platform administration. Tenant adoption
  and employee financial proposals are subsequent integrations, not silently applied.
- Existing seed figures are reference-only until verified against an official order.
- Preserve existing user changes and database data; run tests only in memory.
- One bank class per catalogue revision is the smallest independent publication unit.
- A source URL and administrator verification record establish provenance; the system
  does not claim to verify government authenticity or scrape remote documents.

## Review focus

Malformed expressions must not hang expansion. Invalid calendar dates and unsupported
payroll fields must fail before writes. Published snapshots must resist edit/delete
and stale updates. Class/role tampering must be denied by the API. Successors must
not supersede a different class or alter tenant salaries.

### Task 1: Catalogue validation and persistence

Files: src/models/bankRuleCatalogue.js, src/models/index.js,
src/services/bankRuleCatalogue.js, tests/bankRuleCatalogue.test.js.

- [x] Write and run failing tests for metadata, stage expansion, bounded parsing,
  payroll field validation, publication and successor invariants.
- [x] Implement validateCatalogue(body), referenceForClass(bankClass), createDraft,
  updateDraft, publish and deleteDraft. Use transactions and optimistic version
  conditions; validate again before publishing. Source-required publication and
  explicit verification. Copy reference library only into unverified drafts.
- [x] Run tests against a fresh in-memory database; verify tenant tables unchanged.

### Task 2: Platform API and navigation

Files: src/routes/bankRuleCatalogue.js, src/routes/index.js,
frontend/src/api/client.js, frontend/src/App.jsx,
frontend/src/components/Sidebar.jsx.

- [x] Write and run failing HTTP tests for denied organisation roles and complete
  draft/update/publish/delete/reference flow.
- [x] Add SUPER_ADMIN-only metadata/reference/list/detail/mutation endpoints.
  Audit changes; never expose arbitrary model updates. Return explicit errors.
- [x] Add typed-by-metadata API calls and a role-restricted React route/menu item.

### Task 3: Bank rules administration UI

Files: frontend/src/features/platform/BankRulesPage.jsx and BankRulesPage.css.

- [x] Build class filtering, revision list, full-page draft editor and published
  view. Include government source, rule register, post/scale editor, stage preview,
  payroll setup, verification and publish confirmation. Support explicit successor
  copies and reference-library drafts. Keep action loading independent.
- [x] Run frontend build, inspect responsive UI where browser tooling permits,
  run the Impeccable detector once, and fix material findings.

### Task 4: Verification and handoff

Files: docs/platform-bank-rules.md, this plan.

- [x] Document setup via existing non-destructive db:init, platform workflow,
  reference limitations and remaining tenant adoption integration.
- [x] Run focused tests, build and diff checks. Request one independent final review.
  Fix material issues and report actual verification without claiming deployment.

## Execution ledger

- User instructed building after reviewing the design; proceed without another
  approval round. Work directly in their IDE workspace; no branch changes or commits.
- Ruling: platform catalogue first, as explicitly requested in the latest turn.
  No existing salary update or approval behaviour is changed by this delivery.

- Completed: persisted platform catalogue, metadata/reference APIs, preview and
  publication workflow, class-wise posts/stages/rules/payroll editor, guarded
  route/navigation and operator documentation.
- Verification: 10 service tests and 3 HTTP tests pass; HTTP tests cover all eight
  organisation roles through the real route mount. React build passes.
- Independent review found payroll own-key/range validation and unsaved-edit
  navigation/reconnect risks; corrected them.
- Ruling: switched HashRouter to the existing package's hash data router so the
  standard useBlocker hook can protect SPA navigation; URLs stay unchanged.
- Browser QA attempted but blocked by unavailable browser access host. MySQL
  concurrency and production deployment were not exercised.
- Schema registration uses existing additive db:init/startup behaviour; no live
  schema operation, database reset or seed was run.
