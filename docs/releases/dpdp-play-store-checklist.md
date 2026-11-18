# Google Play Store Release & Review Checklist — UCB-HRMS

**Target Release:** 0.3.0

**Application ID:** `in.banihal.ucbemployee.uat`
**Governance Framework:** Digital Personal Data Protection Act, 2023 (DPDP Act, Act No. 22 of 2023)

---

## 1. Distribution & Account Model

- [x] **Enterprise / Controlled Distribution:** Account creation is prohibited inside the mobile application. All accounts are provisioned by cooperative bank employers through the web self-service platform.
- [x] **QR Linking Device Authentication:** Device registration requires scanning a short-lived cryptographic challenge generated from the employee's web portal (`My Account → Linked devices`).
- [x] **Age Verification ($\ge 18$):** By policy and verified Date of Birth from employee service records, mobile app access is strictly limited to individuals aged 18 and above.

---

## 2. In-App Permissions Verification

| Permission | Technical Requirement | User Context / Timing | DPDP Purpose & Scope |
| :--- | :--- | :--- | :--- |
| **Camera** (`CAMERA`) | QR Barcode scanning | Requested only after platform terms/privacy affirmations are accepted and when clicking "Scan portal QR code". | Scanning web portal link challenge only. No photos/videos stored or transmitted. |
| **Foreground Location** (`ACCESS_FINE_LOCATION`) | Geofenced attendance | Prompted only upon initiating Check-in or Check-out at bank premises. | Immediate point-in-time branch distance verification. No background tracking or continuous monitoring. |
| **System Document Picker** | Action sheet attachment | User opens system document or image picker. | Scoped to individual selected expense receipt. No broad `READ_EXTERNAL_STORAGE` or `MANAGE_EXTERNAL_STORAGE` access requested. |

---

## 3. Play Console Data Safety Alignment

- [x] **Data Encryption in Transit:** All network requests enforce TLS (HTTPS) with origin pinning and certificate validation.
- [x] **Secure Credential Storage:** Tokens and refresh secrets are stored exclusively in hardware-backed secure storage (`expo-secure-store` / Android Keystore / iOS Keychain).
- [x] **Account Erasure & Rights Mechanism:** In-app path provided at `Services → More → Privacy & data rights` for employees to submit `ACCESS`, `CORRECTION`, `ERASURE`, `GRIEVANCE`, and `NOMINATION` requests to their appointed Data Protection Officer.
- [x] **Public Privacy URL:** Stable, public, non-authenticated HTML web page hosted at `/privacy` providing platform terms, privacy policy, and DPO grievance channels.

---

## 4. Manual Verification Gates Before Store Submission

1. **Test Account Credentials:** Provide pre-linked test account instructions and QR codes in Play Console review notes.
2. **Review Video Demonstration:** Ensure review video demonstrates:
   - Privacy onboarding screen with explicit unchecked checkboxes.
   - Camera permission request only after user initiates scan.
   - Profile and Privacy rights request submission.
3. **Legal Review Sign-Off:** Confirm that bank Data Protection Officer (DPO) and legal counsel have reviewed the platform terms and data safety declarations.
