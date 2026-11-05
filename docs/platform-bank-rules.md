# Platform bank classes, government rules and payroll setup

Open **Platform → Bank Classes & Rules** as a Platform Admin, or use
`#/bank-rules`. Organisation users cannot access this screen or its APIs.

## Workflow

1. Choose Special Grade or Class I–V and create a revision.
2. Record the government order number, issuing authority, order date, actual
   effective date and official HTTPS source-document URL.
3. Add the job posts allowed for this class. Enter each full scale expression,
   for example `10000-500/2-11000`. Validate to preview stages 10000, 10500 and
   11000. This is an arithmetic example, not a government-prescribed salary.
4. Optionally load the existing class reference library as a draft starting point.
   These figures and payable-day defaults must be checked against the official
   order. Importing a reference never marks it verified.
5. Record service-rule clauses and conditions. Add only the payroll settings
   actually prescribed by the order: DA, HRA, PF, insurance, professional-tax
   schedules, allowance/bonus settings, loan limits or other supported fields.
6. Save, review and publish after checking every figure and date. Record how it
   was verified. Publication freezes the stored content and records actor/time.
7. Use **Create successor revision** for later orders. Supply the new order,
   source and later effective date. Publication supersedes the prior revision
   for the same class and retains its full historical snapshot.

Rules are documentary references, not executable formulas. Job posts such as
Junior Clerk remain distinct from application permissions such as Payroll Officer.
No automatic government scraping or claim of government authenticity is made.
The official source URL is stored; remote document bytes are not archived and a
remote publisher may change its content independently of this application.

## Data and activation boundary

The new `bank_rule_catalogue` table is platform-owned. One revision covers one
bank class; drafts may be incomplete. Published revisions require complete order
metadata and at least one validated post. Payroll settings remain optional and
are validated against existing supported field types and storage ranges.

Publishing does **not** modify organisation payroll settings, employees, salary
stages, pay histories or existing payroll runs. Tenant adoption, payroll-officer
proposals, approving-authority signoff and employee assignment are the next
integration, as described in the design document. The platform catalogue is the
source for that integration; no approval bypass or mass salary migration is added.
Original account onboarding/profile changes are also outside this delivery.

## Database setup and deployment

No live database was changed during development. The model is registered with
Sequelize and needs one new table. Follow the normal deployment process:

- Build the React console with `npm run build --prefix frontend`.
- With the intended database environment selected, run the existing additive
  `npm run db:init` when authorised to deploy schema changes.
- Existing server startup also creates missing tables when `AUTO_MIGRATE` is
  enabled. With `AUTO_MIGRATE=false`, apply setup before serving the new feature.
- Do not use `db:reset` or seed scripts on a database containing real records.

No new packages, environment variables, seed changes or existing-table alterations
are required. Take the normal deployment backup before applying schema changes.

## Verification

Run these commands separately (each test uses its own in-memory SQLite database):

```sh
node tests/bankRuleCatalogue.test.js
node tests/bankRuleCatalogueApi.test.js
npm run build --prefix frontend
```

The API tests temporarily listen on loopback; a sandbox must allow that socket.
They exercise the actual API mount and deny all eight organisation roles. Tests
cover stage arithmetic and bounds, dates, payroll values, source protocols,
version conflicts, immutable publication, successor constraints and unchanged
salary tables. SQLite emits existing Sequelize warnings for MySQL unsigned types.
Production MySQL locking/concurrency has not been exercised.

The app uses React Router's hash data router to support the catalogue's unsaved
navigation guard; existing URLs remain hash-based. Detail queries do not refetch
on focus or reconnect while editing. Browser testing could not run because the
browser access host was unavailable; validate navigation, publication and the
responsive layout in a browser before deployment. The frontend build passes,
with a bundle-size advisory from Vite.

## Payroll categories and rounding

Organisation payroll setup separates Festival Advance (recoverable advance),
Medical Allowance (annual salary earning), and Stagnation (service-based pay
progression). Additional monthly/yearly/one-time employee payments use Allowances;
recurring individual payments may use the employee's Other Allowance. Non-payroll
expenses belong to accounting; no general expense ledger was added.

New/changed monetary values round upward to whole rupees. Percentages retain
their supported decimal precision and leave/attendance retain day fractions.
Borrowing eligibility is displayed as a percentage (1550% means 15.5 times
Basic+DA), preserving the original multiplier internally. Catalogue monetary
defaults and scale expressions require whole-rupee values.

Payslip earning/deduction rows are rounded before their displayed totals are
summed. Repayment schedules adjust the rounding remainder without collecting
more than the amount owed; arrears schedules reserve at least one rupee per
instalment. Existing historical rows are not migrated or rewritten by unrelated
edits. Database DECIMAL column types remain unchanged for compatibility.

Additional regression check: `node tests/wholeRupees.test.js`.
