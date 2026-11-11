# Employee Device Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace phone password onboarding with a portal-confirmed QR device link and revocable employee mobile session.

**Architecture:** A signed-in employee creates a short-lived link challenge in the portal. The phone claims it, the browser confirms a matching code, and the server issues a device-scoped access token plus rotating refresh token. Existing `/me` employee ownership guards remain. Native home-screen icon stays generic in this release; authenticated bank branding appears inside the app.

**Tech Stack:** Express, Sequelize/MySQL, React web, Expo SDK 58 React Native, SecureStore, Expo Camera, existing `qrcode` and `express-rate-limit`.

**Spec:** `docs/superpowers/specs/2026-11-11-employee-device-linking-design.md`

## Global Constraints

- QR valid at most two minutes, single purpose, no bearer or refresh token inside.
- Only active, uniquely linked `EMPLOYEE` accounts may create and approve device links.
- Portal confirmation and matching code required before a mobile session is issued.
- Device-scoped access checked against active device record on every request; refresh rotates and expires after 30 days of inactivity.
- QR-only mobile sign-in; web password/MFA/reset remain.
- No bank-specific native icons in first release; bank uploaded logo/name appear inside app.
- Keep unrelated payroll and prior staged work untouched. `.git` metadata is read-only here; skip commits.

## Review Focus

- A QR photographed before approval must not yield a session; backend test for pending claim versus approval.
- Two phones scanning the same QR must not both link; backend test for atomic single claim.
- A second refresh using an old token must revoke the device; backend test for token reuse.
- A revoked device's still-valid access token must fail; middleware test.
- A mobile app with no camera permission must show recovery guidance and no account data; mobile component/manual test.

---

### Task 1: Device records and token guard

**Files:** Create `src/models/employeeDeviceLink.js`, `src/models/employeeMobileDevice.js`; modify `src/models/index.js`, `src/middleware/auth.js`, `src/services/authService.js`, `src/sql/schema.sql` (new tables only); test `tests/employeeDeviceLink.test.js`.

**Interfaces:** `EmployeeDeviceLink` has user/org, challengeHash, claimHash, status, verificationCode, platform, deviceName, expiresAt. `EmployeeMobileDevice` has user/org, name/platform, refreshHash, rotation, lastUsedAt, revokedAt. `signDeviceAccessToken(user, deviceId)` and `signDeviceRefreshToken(user, deviceId, rotation)`; middleware checks `deviceId` claim against active row, same user/org.

- [x] Write failing model/middleware tests for wrong user/org, revoked device and normal browser token compatibility.
- [x] Run `node --test tests/employeeDeviceLink.test.js`; confirm failure.
- [x] Add models, associations, SQL table definitions, JWT helpers and middleware guard.
- [x] Run focused test; confirm pass.

### Task 2: Link, approve, refresh, and revoke API

**Files:** Create `src/routes/employeeDevices.js`; modify `src/routes/index.js`, `src/routes/auth.js`, `src/server.js`; test `tests/employeeDeviceLink.test.js`.

**Interfaces:** Authenticated `/me/devices` GET, `POST /me/devices/link` `{currentPassword}`, `GET /me/devices/link/:id`, `POST /me/devices/link/:id/approve|deny|cancel`, `POST /me/devices/:id/revoke`; unauthenticated `POST /mobile/link/claim` `{challenge,claimSecret,platform,deviceName}`, `POST /mobile/link/status` `{linkId,claimSecret}`, `POST /mobile/session/refresh` `{refreshToken}`, `POST /mobile/session/revoke` `{refreshToken}`. JSON `{data:...}` where suitable; failures with status/code. The approved status endpoint returns `{accessToken,refreshToken,user}` once, using conditional state change. QR data is a fixed-prefix challenge string, never an API URL.

- [x] Write failing integration tests for expiry, claim replay, cross-user approval, unlinked/nonemployee rejection, approval-only issuance, revoke, refresh/reuse, password reset, bank suspension.
- [x] Run focused test; confirm failure.
- [x] Implement transactional link service/route with `crypto.randomBytes`, `secretBox.sha256`, existing employee ownership check, and rate limiters; add password-reset revocation.
- [x] Run focused and root backend tests; confirm pass.

### Task 3: Portal linked-device controls

**Files:** Modify `frontend/src/api/employee.js`, `frontend/src/features/auth/MyAccountPage.jsx`; optional focused styles in `frontend/src/styles/components.css`.

**Interfaces:** Device API methods mirror Task 2. `Linked devices` tab creates QR only after password recheck, renders server-generated QR data URL and countdown, polls status while visible, asks for the six-digit code shown only on the phone before approval, lists and revokes devices. Uses existing `Card`, `Button`, and `ApiError` behavior.

- [x] Add a focused UI/API check for QR response shape and employee-only controls if test harness supports it; otherwise assert with build and source review.
- [x] Implement the tab and API calls, including cancellation on unmount and `Cache-Control: no-store` handling at server.
- [x] Run `npm --prefix frontend run build` and focused UI check; confirm pass.

### Task 4: Expo QR onboarding, session renewal, and bank branding

**Files:** Modify `mobile/src/screens/Auth.tsx`, `mobile/src/session.ts`, `mobile/src/api.ts`, `mobile/App.tsx`, `mobile/src/screens/Services.tsx`, `mobile/package.json`, `mobile/package-lock.json`, `mobile/app.json`, `mobile/README.md`; create `mobile/src/link.ts`; modify `mobile/tests/api.test.mjs` and add link/session tests.

**Interfaces:** `CameraView` scans only QR; link parser accepts only the fixed challenge scheme and uses the configured API origin. `EmployeeSession` stores access plus refresh in SecureStore. API refresh is single-flight, rotates tokens, retries a failed authenticated request once, then clears session on revocation/invalid refresh. QR-only Auth screen shows pending bank/code and polls until approved. Authenticated header/profile use `user.organization.logoUrl`, name, and code. Sign-out revokes this device and clears secure storage.

- [x] Write failing tests for QR origin rejection, nonemployee link rejection, refresh rotation/restore, network outage retention, and revocation clearing.
- [x] Run `npm --prefix mobile test`; confirm failure.
- [x] Install `expo-camera` using `npx expo install expo-camera` in `mobile/`, configure camera permission without microphone permission, implement scanner/linking/session/branding.
- [x] Run `npm --prefix mobile test`, `npm --prefix mobile run typecheck`, Android and iOS `expo export`; confirm pass.

### Task 5: Integration and documentation

**Files:** Modify `README.md`, `CHANGELOG.md`, `mobile/README.md`, and this plan's checkboxes.

- [x] Verify root backend suite, mobile tests/typecheck, frontend build, version consistency, and diff checks.
- [x] Review the complete diff for secrets, cross-tenant exposure, reset/revoke behavior, and staged unrelated files.
- [x] Record device/hardware validation limits and generic icon fallback in docs and final report.
