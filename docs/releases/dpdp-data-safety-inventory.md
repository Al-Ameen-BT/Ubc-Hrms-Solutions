# Google Play Store Data Safety Inventory — UCB-HRMS

**App Name:** UCB-HRMS

**Package Name:** `in.banihal.ucbemployee.uat`

**Version:** 0.3.0
**Statutory Framework:** Digital Personal Data Protection Act, 2023 (India)

---

## 1. Data Collection & Sharing Overview

| Data Category | Specific Data Types | Collected? | Shared with Third Parties? | Processing Purpose | Ephemeral / Retained? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Personal Info** | Name, Employee Code, Work Email | Yes | No | Account management, payroll disbursement, statutory service book | Retained per Banking Regulation & labour statutes |
| **Financial Info** | Salary, Deductions, Bank Account Number, Expense Claims | Yes | No | Payroll calculation, statutory contributions, reimbursement processing | Permanently retained in employer's private database |
| **Location** | Precise Location (Foreground only) | Yes | No | Attendance geofence verification at bank branch | **Ephemeral** — used solely for immediate distance calculation; coordinates are not logged |
| **Photos & Videos** | Employee profile photo, Expense receipt images | Yes | No | Workforce directory, expense claim verification | Retained as claim audit evidence |
| **Files & Documents**| PDF / Receipt attachments | Yes | No | Reimbursement verification, payslip downloading | User-controlled, saved to local downloads |
| **App Info & Performance** | Device model, OS version, session refresh rotation | Yes | No | Cryptographic device linking & session security | Retained until device unlinked or revoked |

---

## 2. Security Practices

- **Data Encrypted in Transit:** Yes. All communication between the app and the UCB-HRMS server uses TLS 1.3 (HTTPS).
- **Data Encrypted at Rest:** Tokens and cryptographic link secrets are stored in hardware-backed storage (`Keystore` / `Keychain`).
- **Account Creation Model:** Accounts cannot be registered inside the app. Accounts are created and provisioned exclusively by the employer bank.
- **Data Deletion / Erasure Request Mechanism:** Provided directly in-app under `Services → More → Privacy & data rights`. Employees can submit statutory erasure, correction, and access requests directly to their bank's Data Protection Officer (DPO).

---

## 3. Statutory & Legal Retention Note

Under DPDP Act Section 8 and relevant banking / cooperative society regulations:
- Certain employer-controlled records (salary slips, PF/ESI deductions, service events, audit trails) are subject to statutory retention obligations and cannot be deleted upon casual request.
- The Data Protection Officer records legal retention grounds when rejecting erasure requests for statutory records.
