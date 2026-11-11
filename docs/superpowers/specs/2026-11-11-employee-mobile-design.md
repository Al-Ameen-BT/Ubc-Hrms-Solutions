# Employee Mobile App Design

Status: approved for implementation on 2026-11-11.

## Intent

Provide a separate Android and iOS app for employees of tenant banks to use the existing HRMS self-service features from a phone. Platform and bank administration remain in the web console.

## Approaches

- **Expo React Native (chosen):** Shares React skills with the current frontend; gives native navigation, secure token storage, system document picker and file sharing. Requires an Expo app and Android/iOS release process.
- **Flutter:** Also native, but introduces a second UI language and toolchain to this React repository.
- **Installable web app:** Reuses more UI, but the user chose a separate Android/iOS app.

## Scope and behavior

- One employee-only app for both Android and iOS, with the existing bank identity. Bank code and work email/password start sign-in against a configured HTTPS HRMS server. The app never accepts an arbitrary server URL typed by employees. Fetch public bank branding using the code. The server still validates the bank and role.
- Support MFA challenge, forced first-login password change, ordinary password change, session expiry, sign-out, and unlinked employee guidance. After login/MFA verify `user.role === 'EMPLOYEE'` and `/me/context` before storing a token; on restore recheck `/auth/me` role. The app never retains a nonemployee session. Forgot-password calls the existing `/auth/forgot-password` with email and bank code; the emailed web reset link opens in the system browser.
- Store only the bearer token in OS secure storage; clear it and all in-memory employee data on sign-out or expired session. Never persist payslips, directory, policy text, or receipts in general app storage. Authenticated PDF and receipt downloads use bearer headers, temporary cache files for OS sharing, and cache cleanup where possible.
- Home: identity, current leave balance and quick actions. Pages: finalized payslips with PDF share/download; leave types, balances, request and withdrawal; current policy and acknowledgement history; month calendar of holidays, leave and time; workplace tree by branch, department and role; check-in/out with server timestamps and monthly entries; reimbursement claims with document picker, status, receipt view and withdrawal. Profile shows work identity and password change. No payroll editing, approval, HR, org admin or platform screens.
- Every employee action uses `/api/v1/me/*` and never supplies another employee ID. The server remains responsible for tenant isolation, approval states, time, money, upload validation, and financial calculations. Claims stay separate from payroll; time does not automatically change pay.
- The app is online only. Show clear loading, empty, server, 401 and 409 states; avoid caching confidential data after sign-out. Use Asia/Kolkata for bank-day displays, retain fractional leave days, and show whole-rupee money. No push notifications or offline writes in this version.
- Use native controls and accessible labels, readable text, sufficient contrast, and touch targets. UI follows the existing HRMS bank-blue, light surface system, adjusted for one-handed phone use and system text scaling.

## Integration and release

- A new `mobile/` Expo project with a documented `EXPO_PUBLIC_API_BASE_URL` set to the deployment's HTTPS origin. Development may point to a local LAN server explicitly configured by the developer; production must use HTTPS.
- Use the current JSON API contracts and auth endpoints. No database migration or payroll behavior change is needed for the mobile app.
- Add a small API-client test for bank-scoped auth and employee-only guard behavior. Verify app type checking and an Expo bundle/build smoke check. Device testing and signed store releases require Android/iOS tooling and release credentials outside this repository.

## Remaining builder choices

- Exact Expo SDK and package versions compatible at implementation time.
- Native navigation/layout details and the document handoff implementation, while preserving the behaviors above.
