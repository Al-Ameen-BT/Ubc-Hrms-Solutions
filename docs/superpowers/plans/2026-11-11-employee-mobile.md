# Employee Mobile App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a separate Expo Android/iOS employee self-service app backed by the current HRMS employee API.

**Architecture:** A small Expo React Native project under `mobile/` has a bank-scoped API client, secure token session, and native pages for the seven existing `/me` areas. Server authorization and calculations remain the source of truth.

**Tech Stack:** Expo SDK compatible React Native, TypeScript, SecureStore, DocumentPicker, FileSystem, Sharing, Node tests.

**Spec:** `docs/superpowers/specs/2026-11-11-employee-mobile-design.md`

## Global Constraints

- Only `EMPLOYEE` sessions are retained; validate role at login and restore.
- Use a configured HTTPS API origin in production, no employee-supplied server URL.
- Never persist confidential response data in general storage.
- Reuse `/api/v1/me/*` and existing auth endpoints; never send another employee ID.
- Claims remain separate from payroll; time entries do not directly change pay.

## Review Focus

- A staff user entering valid credentials is rejected before token storage.
- A stale token on app restore is removed without showing prior employee data.
- MFA challenge stays in memory only, and cannot be confused with a full token.
- PDF and receipt downloads use bearer headers and cache cleanup.
- Missing employee linkage and 409 conflicts have recoverable explanations.

---

### Task 1: API and session core

**Files:** Create `mobile/src/api.ts`, `mobile/src/session.ts`, `mobile/tests/api.test.cjs`; scaffold `mobile/package.json`, `mobile/app.json`, `mobile/tsconfig.json`, `mobile/.env.example`, `mobile/.gitignore`.

**Interfaces:** `createApi(baseUrl, transport)` exposes `get`, `post`, `download`; `acceptEmployeeLogin(result, fetchContext, store)` rejects nonemployees and unlinked accounts before saving the token. Session restore checks `/auth/me` and `/me/context`.

- [x] Write API tests for bank-scoped login, nonemployee rejection, unlinked rejection, restore, 401 clearing, and malformed origin.
- [x] Run the focused test and confirm expected failure (used `tsx --test` because local Node lacks TypeScript support).
- [x] Implement client/session and Expo scaffold with package versions compatible with chosen SDK.
- [x] Run focused test, `npm run typecheck`, and compare expected green output.

### Task 2: Auth and mobile shell

**Files:** Create `mobile/App.tsx`, `mobile/src/ui.tsx`, `mobile/src/screens/Auth.tsx`; extend `mobile/src/session.ts` as needed.

**Interfaces:** `App` owns employee session and active section; Auth handles bank code, password, MFA, forgot-password, forced and ordinary password change.

- [x] Add focused auth/session tests for role guard, restore, 401 handling and secure persistence; verify failure.
- [x] Implement native auth screens and navigation shell with accessible touch controls.
- [x] Run focused tests and TypeScript check.

### Task 3: Employee self-service

**Files:** Create `mobile/src/screens/Home.tsx`, `mobile/src/screens/Services.tsx`, `mobile/src/files.ts`; extend `mobile/src/api.ts`.

**Interfaces:** Screens consume `/me` methods only; files module shares authenticated PDF/receipt downloads and selects claim receipts.

- [x] Add tests for whole-rupee claim input, receipt MIME/size validation, date/query handling and auth download headers; verify failure.
- [x] Implement home, payslips, leave, policy, calendar, workplace, time and claims with loading/empty/error states.
- [x] Run focused tests, TypeScript check, and Expo export/bundle smoke check.

### Task 4: Documentation and final verification

**Files:** Create `mobile/README.md`; update root `README.md` with app run/build setup.

- [x] Document HTTPS origin, employee bank sign-in, install/run, Android/iOS build prerequisites, online behavior and current limitations.
- [x] Run mobile `npm test`, `npm run typecheck`, separate Android/iOS Expo exports, backend `node --test tests/*.test.js`, frontend `npm run build`, and `git diff --check`.
- [x] Review the mobile app against the approved design, fix significant gaps, and record unverified device/store behavior.
