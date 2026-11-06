# Payroll implementation status

The Platform Admin can draft and publish bank-class rule catalogues. Publication is immutable and does not change a bank's salary records. The application currently has no organisation adoption, governed employee assignment or financial proposal/approval workflow. Until those controls exist, its existing bank-owned pay-scale routes remain editable and the salary tables must not be described as government-enforced.

The user-supplied government PDF is pending. Do not import the reference scale seed or publish a government catalogue from its placeholder figures or dates. When the PDF arrives, verify class applicability, posts, stages, effective dates and bonus/allowance provisions against it before implementing adoption and assigning employees. Preserve prior scale versions and finalized payroll snapshots.

Implemented source-independent rules in the current working tree: nearest-rupee money rounding; fixed profit/loss bonus of 20%/8.33% of Basic; overdraft minimum offer of (Basic + DA) × 15 and a maximum 84-month repayment window; HR-entered total repayment and monthly payment for new overdraft, housing and vehicle loans; approved/paid payslips in the Service Book. A linked RD record follows the overdraft schedule and is not charged twice. Existing loan rows retain their historical rate-based schedules. No production database migration has been run.

Direct-pay staff use a bank-set monthly gross amount, without government grade allowances; configured deductions still apply. HR can change that amount with a reason recorded in the Service Book. An employee self-service account cannot be linked to a direct-pay staff record.

Still required: government catalogue adoption and strict scale enforcement across single, bulk and pay-fixation writes; HR-prepared and authority-approved two-stage stagnation progression after eight years without promotion; production MySQL migration and browser validation.
