# Employee mobile device linking and bank branding

Status: approved for implementation on 2026-11-11. Extends the approved employee mobile app design.

## Intent

An employee installs the shared Android/iOS app, opens their own signed-in web self-service portal, scans a QR code with the phone, confirms that phone in the portal, and gains access to only their own bank's employee features. The app shows the bank's branding after linking. Where the app release includes that bank's icon, its installed home-screen icon changes to the corresponding prebuilt icon.

## Approaches

- **Confirmed device link (selected by user):** The portal creates a short-lived QR; the app scans and requests linking; the employee checks a matching code and device name, then confirms in the portal. The server issues a revocable device session. This prevents a photographed QR by itself from granting access.
- **Immediate scan-to-sign-in:** Simpler, but possession of a QR image during its validity would be enough to claim the session. Rejected.
- **Phone password login:** Already implemented, but does not provide the requested portal-led onboarding. The user chose QR-only mobile onboarding, so the mobile password/MFA sign-in and forgot-password screens are removed. Password reset and MFA remain in the web portal.

## Employee flow

1. The employee signs in to their bank's web self-service portal with the existing password and MFA, completes any forced password change, and opens **My Account → Linked devices**. Only an active `EMPLOYEE` account with exactly one active employee link may create a QR.
2. The employee confirms their current password to start a device link. The portal shows a QR for at most two minutes, with a countdown, cancel action, and security note. A new QR invalidates the previous pending QR. The QR holds a random, single-purpose linking challenge and the app's fixed backend identity; it contains no access or refresh token, password, employee data, or arbitrary server URL.
3. On first launch, the app presents **Scan QR from your self-service portal** and requests camera permission only when the employee opens the scanner. The app submits the challenge and a random claim secret kept in memory for this attempt; the server stores only its hash. It shows the bank name and a six-digit code. The portal receives the pending device name/platform but not the code.
4. The employee types the code shown on the phone into the authenticated portal to approve that device; the server checks it. The pending link is consumed exactly once. After approval, the claimed phone has one additional minute to collect its session, while the QR cannot be scanned again. The app polls with its claim secret and receives its own device session only after approval. If the app closes before approval, the employee starts a fresh QR. Expired, cancelled, denied, replayed, cross-user, inactive-account, suspended-bank, and already-consumed requests grant nothing.
5. The app verifies `EMPLOYEE` role and `/me/context` before saving the session, loads the organisation card by the server-returned bank code, and then opens the employee screens. It never accepts a user-entered API origin or employee ID.
6. The portal lists linked devices with name, platform, linked time, last use, and revocation. The employee can revoke any device. Mobile sign-out revokes the current device and clears secure storage. A revoked device loses access on the next request, including while an access token is still within its stated lifetime.

## Sessions and security

- New server-side records represent pending links and approved devices; store only hashes of challenge, claim, and refresh tokens. Do not log QR contents or tokens. Use database transactions and conditional state updates for one-time consumption.
- Mobile receives a short-lived device-scoped access token and a rotating refresh token held only in OS secure storage. Refresh is tied to the active device record and rotates on each use; reuse of an old refresh token revokes that device. Expire an unused device session after 30 days, requiring a new QR. Browser sessions keep their existing behavior.
- The shared auth middleware continues to reload user and organisation status. Device-scoped access tokens additionally require an active, matching device record on every request. Existing `/me` authorization continues to derive the employee from `req.user`; linked devices cannot request another employee's data. Admin roles cannot link.
- Password reset, account deactivation, employee unlinking, and organisation suspension invalidate device access. Password changes and admin resets revoke linked devices; the employee links their phone again from the portal. Account role or employee assignment changes also revoke existing phone links.
- Apply rate limits to QR creation, scan attempts, approval, and refresh; return generic error text for invalid challenges. Audit creation, approval, denial, refresh-token reuse, and revocation without secrets. Never cache confidential employee data beyond the existing in-memory and temporary-file behavior.
- The QR is a login credential until it expires. The portal must show it only over HTTPS and avoid storing it in browser storage; responses use `Cache-Control: no-store`.

## Branding and icon behavior

- In-app header, onboarding completion screen, and profile use the organisation's public banner/logo and name returned for the authenticated organisation. The logo can update without an app release. On sign-out, revert to platform branding.
- The first release uses the generic installed home-screen icon for all banks because no approved bank-specific high-resolution artwork is available. In-app branding still uses each bank's uploaded logo. When approved bank icons are later supplied, a native release can add a manifest mapping bank codes to bundled icon names. Bank codes from the server are lookup keys only; arbitrary image URLs cannot become native icons.
- Future iOS bank icons use the system's alternate-icon support, which may show a system alert. Future Android bank icons use bundled launcher activity aliases. Both require Expo native configuration and a development/production build; Expo Go and a JavaScript-only update cannot deliver new icon variants. The currently bundled 64px generic icon is not a store-ready source.

## Integration surface

- Backend: models/migrations for pending links and devices; employee-only linking API, token issuance/rotation/revocation; mobile token guard in shared auth middleware; audit/rate limiting. Existing payroll and financial rules are untouched.
- Web: `MyAccountPage` Linked devices tab, QR display and confirmation, device list/revoke; API client methods. Existing account and self-service routes remain.
- Mobile: QR scanner and link polling, secure device session, refresh/revoke handling, organisation branding, and removal of the password/MFA sign-in UI. Existing employee services remain behind the verified session. The generic home-screen icon remains in the first release.
- Tests: link expiry, replay, approval ownership, cross-tenant isolation, unlinked/nonemployee accounts, revoke, refresh rotation/reuse, password reset/deactivation, and app session restore; native icon/scanner verification on real Android and iOS development builds.

## User decisions and deferred asset work

- First release: generic home-screen icon for every bank. Bank-specific installed icons require later approved high-resolution artwork, bank-code mapping, and a new native release. The bank logo inside the app remains dynamic.
- Mobile sign-in: QR linking only. A lost or replaced phone is relinked from the employee's authenticated web portal. Password reset and MFA remain web features.
- If the network drops after the server issues or rotates a token but before the phone receives the response, the phone may need a fresh QR link. The portal can revoke the stranded device. Retry-safe token handoff requires a separate recovery protocol that does not weaken refresh-token replay detection.

## Platform references

- Apple alternate icons: https://developer.apple.com/documentation/xcode/configuring-your-app-to-use-alternate-app-icons
- Android activity aliases: https://developer.android.com/guide/topics/manifest/activity-alias-element
- Android component state: https://developer.android.com/reference/android/content/pm/PackageManager#setComponentEnabledSetting(android.content.ComponentName,int,int)
- Expo config plugins for native project changes: https://docs.expo.dev/config-plugins/introduction/
