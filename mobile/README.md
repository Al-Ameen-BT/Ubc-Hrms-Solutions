# UCB-HRMS mobile app

Expo React Native app for Android and iOS. Employees link a phone by scanning a short-lived QR code from their own signed-in self-service portal. Staff and platform administrator accounts cannot link.

## Configure and run

1. Install Node.js and run `npm install` in `mobile/`.
2. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_BASE_URL` to the deployed HRMS **HTTPS origin**, for example `https://hrms.example.invalid`. Use only a server you control. No path or trailing API prefix is needed.
3. Run `npm start` and open the app in a compatible Expo development client. For native builds, follow [Expo's build setup](https://docs.expo.dev/build/setup/) and choose your Android/iOS application identifiers and signing credentials.
4. Sign in to the bank's web self-service portal, open **My Account → Linked devices**, enter the current password, and create a QR. Scan it in the app, then type the six-digit code shown on the phone into the portal to approve. The QR expires after two minutes.

The server must be reachable from the phone. A local development server can use an explicit LAN `http://` origin while running in development mode; production builds require HTTPS. `EXPO_PUBLIC_*` values are embedded in the app bundle, so set the production origin before making a release build. Do not place secrets there.

## Employee features

Home, finalized payslips and PDF sharing, leave balances and requests, current policy acknowledgement, calendar, workplace directory, check-in/out, reimbursement claims with PDF or image receipts, and profile/password change. The app uses the existing `/api/v1/me/*` endpoints. Claims and check-in records do not alter payroll automatically.

The short-lived access token and rotating refresh token are kept in OS secure storage. A portal revocation blocks the phone immediately, including before the access token expires. Mobile sign-in is QR-only; password reset and MFA remain in the web portal. After changing a password, link the phone again. Employee API data stays in memory; authenticated files are placed in app cache only while sharing. The app needs a network connection and does not queue offline writes or send push notifications.

The bank name and uploaded logo appear inside the app after linking. Every native release downloads the current platform provider favicon from `/assets/platform/favicon`, validates it, and normalizes it for the launcher and splash assets. Installed icons change only when a new APK/IPA is built and installed.

If a connection drops after the server issues or rotates a device token but before the phone receives it, link the phone again with a new portal QR. Revoke any stranded device from **Linked devices**. This preserves strict refresh-token replay detection.

## UAT Android APK

Current compiled test artifact: `builds/UCB-HRMS-UAT-0.2.2.apk` (`versionCode` 4). SHA-256: `2dd307cbca6682114d162f3004ee6e0c2a2e5a2696061e953c816646d5a17171`.

The `uat` build profile embeds `https://172.17.121.200:8443` and produces an installable APK. It includes only that UAT server's self-signed public certificate as an Android trust anchor for that IP; normal certificate checks remain in place for other hosts. The certificate fingerprint captured on 11 Nov 2026 is `49:B0:22:64:9D:58:9D:06:46:50:EE:A1:04:2E:8B:06:55:37:1D:26:26:64:C0:2F:7B:2F:25:0A:16:88:E8:52`. Rebuild after the server certificate changes. Never use this UAT package as a production release.

The UAT APK uses the same numeric `nn.nn.nn` version shown in the app's Profile. Prerelease suffixes such as `alpha` and `beta` are not used. Increment `android.versionCode` for every APK distributed to testers so Android can install it over the previous build.

To build locally, install the Android SDK and JDK, then run `EXPO_PUBLIC_API_BASE_URL=https://172.17.121.200:8443 npm run brand:prepare` before `EXPO_PUBLIC_API_BASE_URL=https://172.17.121.200:8443 npx expo prebuild --platform android --no-install`, followed by `EXPO_PUBLIC_API_BASE_URL=https://172.17.121.200:8443 ./android/gradlew -p android :app:assembleRelease`. The branding step fails instead of publishing a stale icon when the platform favicon cannot be securely downloaded or decoded. The APK is under `android/app/build/outputs/apk/release/`. Its generated signing key is for testing; production signing needs its own managed key. EAS runs the branding step automatically through `eas-build-post-install`; use `eas build -p android --profile uat` after signing in to an Expo account.

The phone must be on the UAT network or VPN and able to open `https://172.17.121.200:8443/healthz`. Connect an Android phone by USB, enable Developer options and USB debugging, accept the RSA prompt, then use `adb devices` and `adb install -r <apk-path>`. Alternatively, copy the APK to the phone and open it there. In the app, allow camera access, scan the QR from the employee web portal, and enter the phone's code in that portal.

## Checks

`npm test` checks API/session, QR parsing, and input validation. `npm run typecheck` checks TypeScript. `npx expo export --platform android` and `npx expo export --platform ios` verify Metro bundles. These checks do not certify camera behavior, device linking against a deployed backend, or signed store binaries.
