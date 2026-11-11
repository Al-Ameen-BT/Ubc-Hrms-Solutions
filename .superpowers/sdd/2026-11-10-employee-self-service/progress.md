# SDD ledger — plan: docs/superpowers/plans/2026-11-10-employee-self-service.md
Pre-flight: Task 1 / Task 2 / Task 3 / Task 4 share src/routes/me.js and identity loader; append route handlers without weakening ownership.
Pre-flight: Task 2 / Task 3 share calendar data; Task 3 adds time entries consumed by calendar, so calendar must handle missing time table until model registered.
Pre-flight: Task 1 / Task 5 share employeeApi and dashboard; Task 5 completes navigation after Task 1 API wiring.
Task 1: complete (commits 1445659..79ae239, tests: node --test tests/employeeSelfService.test.js tests/serviceBookPayslips.test.js → # duration_ms 919.127648)
Task 2: complete (commits 1445659..79ae239, tests: node --test tests/employeePolicyCalendar.test.js → # duration_ms 769.555839)
Task 3: complete (commits 1445659..79ae239, tests: node --test tests/employeeTimeWorkplace.test.js → # duration_ms 803.309549)
Task 4: complete (commits 1445659..79ae239, tests: node --test tests/employeeExpenses.test.js → # duration_ms 812.377352)
Task 5: complete (commits 1445659..79ae239, tests: npm --prefix frontend run build → ✓ built in 1.10s)
Task 6: complete (review fixes for account cache, leave/time races, time evidence, IST correction UI; tests: node --test tests/*.test.js → 49 pass; frontend build and version:check pass)
