# SDD ledger — plan: docs/superpowers/plans/2026-11-11-employee-mobile.md

Ruling: Work in current checkout — existing uncommitted employee API and branding work is required and `.git` is not writable in this environment — changes remain reviewable but uncommitted.
Ruling: Use `tsx --test` — this Node 22 binary reports `ERR_NO_TYPESCRIPT` for native strip-types — adds one dev test dependency.
Ruling: Export Android and iOS separately — this is a mobile-only app and `--platform all` would add an unnecessary web target — web export is not a release check.
Pre-flight: Task 2 consumes API/session from Task 1; Task 3 consumes both and native UI. Interfaces match the approved spec.
Task 1: complete (tests: mobile `npm test` 9/9; `npm run typecheck` passed).
Task 2: complete (bank-scoped login, MFA, reset request, forced password change, employee-only session; `npm run typecheck` passed).
Task 3: complete (seven service areas and authenticated file handling; mobile `npm test` 9/9, Android and iOS Expo exports passed).
Task 4: complete (mobile tests 13/13, backend 88/88, mobile TypeScript, Android/iOS exports, frontend build, version and diff checks passed).
Final: fixed rejected-receipt cache leak — `receipt.test.mjs` RED→GREEN, mobile suite 13/13.
Final: fixed password-change expiry handling — `api.test.mjs` and `authPasswordCode.test.js` RED→GREEN, mobile suite 13/13, backend suite 88/88.
Final: fixed bank-suspension session retention — `api.test.mjs` RED→GREEN, mobile suite 13/13.
Final: reviewed by fresh agent; no remaining Critical or Important findings.
Final: signed native builds and device testing unavailable here; app icon uses the existing 64px platform mark and needs a high-resolution release asset.
Final: npm audit reports 5 moderate transitive advisories in Expo CLI glob/minimatch chain; no high or critical advisories. Avoided forced major downgrade that would break SDK compatibility.
