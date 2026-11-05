# Payroll categories and whole-rupee amounts

User requests separate Festival Advance, Medical Allowance and Stagnation and
eliminate decimal amounts while retaining decimal percentages. Use existing
allowances for additional salary payments; no general expense ledger is requested.

- [x] Separate recoverable advances, annual earnings and service progression in
  organisation payroll setup; point additional earnings to Allowances.
- [x] Enforce whole rupees on new/changed monetary writes (including bulk writes),
  catalogue stages/defaults and numeric forms; preserve decimal percentages,
  fractional leave/attendance and unchanged historical rows. Keep current DECIMAL
  schema for compatibility. User explicitly selected upward rounding; percentage rates and fractional days remain supported.
- [x] Test payslip component totals and repayment splits so rounding cannot create
  or lose money. Keep paise internally for percentage calculations.
- [x] Run focused tests, build and review. No live data/schema operations.

Scope reaches Sequelize monetary fields, catalogue validation, React and legacy
money inputs, payslip custom earnings, Festival Advance recovery and arrears
instalments. Existing money display and PDF formatters already use whole rupees.

Verification: 8 whole-rupee/repayment tests, 10 catalogue tests and 3 API tests
pass; frontend build passes with its bundle-size advisory. Independent review
identified a borrowing-multiplier issue: retain its precision internally and
present eligibility as a percentage in all three setup interfaces. Browser host
is unavailable; visual QA and production MySQL verification remain outstanding.
