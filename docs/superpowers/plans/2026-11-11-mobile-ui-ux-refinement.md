# UCB-HRMS Mobile UI/UX Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the existing employee mobile app end-to-end, add a broad icon-led bottom navigation, rename it to UCB-HRMS, and make native releases consume the current platform favicon.

**Architecture:** Keep the current Expo app, state-based navigation, API contracts and screen files. Extend the existing shared UI module with a small semantic token/component set, then restyle the shell, onboarding, Home and Services screens in place. Add one build-preparation script for the favicon and expose its generated local asset through Expo configuration.

**Tech Stack:** Expo 58, React Native 0.88, TypeScript, Node test runner, Expo image utilities.

**Spec:** `docs/superpowers/specs/2026-11-11-mobile-ui-ux-refinement-design.md`

## Global Constraints

- Preserve QR-only linking, authorization boundaries, API paths, payloads and payroll behavior.
- Keep the existing five destinations: Home, Payslips, Leave, Time and More.
- Installed display name must be exactly `UCB-HRMS`; retain the existing slug and package identifier.
- Root, frontend and mobile release versions must use numeric `nn.nn.nn` semantic versioning only, with no prerelease label.
- Application versions must use numeric `nn.nn.nn` form only, with no prerelease or other label; root, frontend, mobile and lockfile versions must match.
- The platform favicon is fetched only at native release preparation time from the configured HTTPS HRMS origin and a failed/invalid fetch fails the release.
- Preserve the checked-in UAT certificate trust path; never disable TLS verification globally.
- Keep the existing light visual direction and organisation branding after authentication.
- Use shared semantic tokens and existing files; do not introduce a navigation framework or rebuild the screen architecture.

## Review Focus

- Large text and long organisation/employee names must not overlap the header or five navigation targets.
- Camera denied, QR expired and offline restoration states must remain recoverable.
- A slow or failed screen resource must not make unrelated Home actions unusable.
- Favicon responses that are oversized, non-images or malformed must stop release preparation without replacing the checked-in fallback.
- Mutation controls must prevent duplicate submissions while retaining clear success or failure feedback.

---

### Task 1: Native Branding and Release Asset Preparation

**Files:**
- Create: `mobile/scripts/prepare-brand-assets.mjs`
- Create: `mobile/tests/brandAssets.test.mjs`
- Modify: `mobile/app.json`
- Modify: `mobile/app.config.js`
- Modify: `mobile/package.json`
- Modify: `mobile/.gitignore`
- Modify: `mobile/README.md`

**Interfaces:**
- Produces: `prepareBrandAssets({ apiBaseUrl, fetchImpl, outputPath, maxBytes, certificatePath })` and generated `mobile/assets/generated/platform-icon.png` used by Expo icon, adaptive icon and splash configuration.
- Consumes: existing `EXPO_PUBLIC_API_BASE_URL` and fixed UAT certificate path.

- [ ] **Step 1: Write failing tests for exact app identity, HTTPS-only origin, response limit/type/decode checks, successful PNG generation and failure without overwriting a known-good file.**
- [ ] **Step 2: Run `cd mobile && npm test -- tests/brandAssets.test.mjs`; expect failures because the preparation module and UCB-HRMS config do not exist.**
- [ ] **Step 3: Implement the smallest preparation script and configure Expo to use the generated asset for launcher/adaptive/splash resources; retain slug/package/version values.**
- [ ] **Step 4: Run `cd mobile && npm test -- tests/brandAssets.test.mjs && npm run typecheck`; expect pass.**

### Task 2: Shared Mobile Design System and State Components

**Files:**
- Modify: `mobile/src/ui.tsx`
- Create: `mobile/src/presentation.ts`
- Create: `mobile/tests/presentation.test.mjs`

**Interfaces:**
- Produces: semantic `colors`, spacing/radius/type tokens; refined `Page`, `Card`, `Action`, `Field`, `Loading`, `Empty`, `ErrorText`; new `ScreenHeading`, `StatusBadge`, `DataRow`, `Notice`, and `Skeleton` components.
- Consumes: no screen-specific API data.

- [ ] **Step 1: Write failing pure-function tests for status tone/label mapping, bottom-navigation selection including nested More screens, and safe initials/first-name display for missing or long values.**
- [ ] **Step 2: Run `cd mobile && npm test -- tests/presentation.test.mjs`; expect module-not-found failure.**
- [ ] **Step 3: Implement `presentation.ts` and refine shared components with 48 dp targets, pressed/disabled/busy feedback, accessible roles, keyboard-safe pages and reusable state presentation.**
- [ ] **Step 4: Run `cd mobile && npm test -- tests/presentation.test.mjs && npm run typecheck`; expect pass.**

### Task 3: App Shell, Broad Navigation, Loading and Onboarding

**Files:**
- Modify: `mobile/App.tsx`
- Modify: `mobile/src/screens/Auth.tsx`
- Modify: `mobile/src/screens/Home.tsx`

**Interfaces:**
- Consumes: Task 2 shared components and `isPrimarySectionSelected(section, item)`.
- Produces: broad full-width icon-led five-item navigation; refined authenticated header, branded launch/restoration states, QR states and Home hierarchy.

- [ ] **Step 1: Extend presentation tests for all primary and nested section selection cases and accessible minimal tab labels.**
- [ ] **Step 2: Run the focused presentation test; expect the new navigation metadata assertions to fail.**
- [ ] **Step 3: Implement the full-width navigation with compact icons/labels, active pill, press feedback and accessible selected state; refine header/loading/recovery without changing session behavior.**
- [ ] **Step 4: Refine onboarding and Home using the shared state components, preserving QR polling, camera permission and resource independence.**
- [ ] **Step 5: Run `cd mobile && npm test && npm run typecheck`; expect pass.**

### Task 4: Employee Service Screen Refinement

**Files:**
- Modify: `mobile/src/screens/Services.tsx`
- Modify: `mobile/src/presentation.ts`
- Modify: `mobile/tests/presentation.test.mjs`

**Interfaces:**
- Consumes: Task 2 shared components.
- Produces: consistent Payslips, Leave, Time, Policies, Calendar, Workplace, Claims, Profile and More screen presentation with unchanged API behavior.

- [ ] **Step 1: Add failing presentation tests for payslip status, time-entry state and claim/leave status mapping.**
- [ ] **Step 2: Run the focused tests; expect missing mapping cases to fail.**
- [ ] **Step 3: Refine all service screens in place: ledger rows and net-pay emphasis, balance/status tiles, action-aware Time state, readable policy/history, labelled calendar legend, workplace hierarchy, claim form/history and profile/service menu.**
- [ ] **Step 4: Ensure each mutation uses control-local busy/disabled feedback and a visible success or retry state without altering paths or payloads.**
- [ ] **Step 5: Run `cd mobile && npm test && npm run typecheck`; expect pass.**

### Task 5: Whole-App Verification and Release Documentation

**Files:**
- Modify: `mobile/README.md`
- Modify: `docs/superpowers/specs/2026-11-11-mobile-ui-ux-refinement-design.md` only if implementation evidence requires a factual clarification.

**Interfaces:**
- Consumes: Tasks 1–4 completed implementation.
- Produces: verified source/bundles and exact operator instructions for favicon preparation and APK testing.

- [ ] **Step 1: Run `cd mobile && npm test`, `npm run typecheck`, and root `npm run version:check`; expect all pass.**
- [ ] **Step 2: Export Android and iOS bundles with the checked-in/generated development asset; expect Metro export success.**
- [ ] **Step 3: Run the Impeccable detector against changed mobile UI files and address Critical/Important findings.**
- [ ] **Step 4: Inspect the Android manifest/resources or APK when a build environment is available; confirm UCB-HRMS name, existing package identifier and generated icon references.**
- [ ] **Step 5: Record any unavailable real-device/iOS checks explicitly; do not infer visual or camera success from source checks.**
