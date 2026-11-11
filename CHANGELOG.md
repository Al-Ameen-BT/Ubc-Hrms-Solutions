# Changelog

This project uses [Semantic Versioning](https://semver.org/). Record user-visible changes under **Unreleased**; move them into a dated version section when releasing.

## Unreleased

### Added

- Add portal-confirmed QR onboarding for the employee mobile app, with revocable linked devices, rotating mobile sessions, and bank branding inside the app.
- Add a separate Expo Android/iOS employee self-service app for payslips, leave, policies, calendar, workplace, time, reimbursement claims and profile/password management.
- Let platform and organisation administrators upload separate banner and icon logos; serve each organisation's icon as its custom-domain favicon.

### Changed

- Use QR-only mobile sign-in; employees approve a phone by entering its six-digit code in their web self-service portal. The first release keeps the generic installed app icon.

## 0.2.0-alpha.1 — 2026-11-06

### Added

- Display the application version in the sign-in screen and sidebar.
- Check that backend, frontend, and lockfile versions match in CI.

### Changed

- Round monetary amounts to the nearest rupee, with 50 paise rounding up, while keeping rates and attendance fractions precise.
- Calculate declared profit/loss bonus as 20%/8.33% of Basic, without adding Basic again or applying the old caps.
- Include overdraft repayment in payroll deductions without charging a linked RD record a second time.
- Show approved and paid monthly payslip snapshots in the Service Book, including an employee's own view.
- Let bank HR enter loan principal, total repayment, and monthly payment for new overdraft, housing, and vehicle records; the application does not calculate interest for these new records.
- Treat (Basic + DA) × 15 as the overdraft minimum offer and cap its repayment window at 84 months.
- Add direct-pay staff with a bank-set monthly gross salary, statutory deductions, HR record, and no self-service account.

## 0.1.0 — Baseline

The existing application version is the starting point for this changelog. Earlier changes have not been reconstructed as releases.
