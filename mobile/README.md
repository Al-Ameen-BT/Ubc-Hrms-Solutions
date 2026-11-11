# UCB Employee mobile app

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

The bank name and uploaded logo appear inside the app after linking. This first release uses one generic home-screen icon for every bank; bank-specific home-screen icons require approved high-resolution artwork packaged in a later native release. The current generic icon is low resolution and needs a release-quality source before store submission.

If a connection drops after the server issues or rotates a device token but before the phone receives it, link the phone again with a new portal QR. Revoke any stranded device from **Linked devices**. This preserves strict refresh-token replay detection.

## Checks

`npm test` checks API/session, QR parsing, and input validation. `npm run typecheck` checks TypeScript. `npx expo export --platform android` and `npx expo export --platform ios` verify Metro bundles. These checks do not certify camera behavior, device linking against a deployed backend, or signed store binaries.
