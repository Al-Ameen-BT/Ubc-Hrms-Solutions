import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboardModel = await import('../src/features/dashboard/dashboardModel.js').catch(() => ({}));

test('dashboard percentages stay within a valid range', () => {
  assert.equal(typeof dashboardModel.clampedPercent, 'function', 'dashboard percentage policy is available');
  assert.equal(dashboardModel.clampedPercent(5, 0), 0);
  assert.equal(dashboardModel.clampedPercent(-1, 10), 0);
  assert.equal(dashboardModel.clampedPercent(11, 10), 100);
  assert.equal(dashboardModel.clampedPercent(1, 3), 33);
});

test('platform health excludes expiring licences from healthy active organisations', () => {
  assert.equal(typeof dashboardModel.platformHealth, 'function', 'platform health policy is available');
  assert.deepEqual(
    dashboardModel.platformHealth({ active: 8, expiringSoon: 3, suspended: 2, expired: 1 }),
    { active: 5, expiring: 3, suspended: 2, expired: 1 },
  );
  assert.deepEqual(
    dashboardModel.platformHealth({ active: 1, expiringSoon: 4, suspended: -2 }),
    { active: 0, expiring: 4, suspended: 0, expired: 0 },
  );
});

test('dashboard model excludes synthetic unassigned rows from configured branches', () => {
  assert.deepEqual(
    dashboardModel.configuredBranches([{ id: 0, name: 'Unassigned' }, { id: 4, name: 'Main Branch' }]),
    [{ id: 4, name: 'Main Branch' }],
  );
});

test('licence attention follows the server state and treats zero days as expiring today', () => {
  assert.deepEqual(
    dashboardModel.licenceAttention({ state: 'ACTIVE', daysLeft: 0 }),
    { warning: true, expired: false, title: 'Licence expires today' },
  );
  assert.deepEqual(
    dashboardModel.licenceAttention({ state: 'ORG_LICENSE_EXPIRED', daysLeft: 0 }),
    { warning: true, expired: true, title: 'Organisation licence has expired' },
  );
  assert.deepEqual(dashboardModel.licenceAttention({ state: 'ACTIVE', daysLeft: 31 }), { warning: false, expired: false, title: '' });
});

test('platform attention prioritises expired and suspended organisations before renewals', () => {
  const rows = [
    { id: 1, severity: 'warning', license: { daysLeft: 20 } },
    { id: 2, severity: 'danger', license: { daysLeft: 0 } },
    { id: 3, severity: 'warning', license: { daysLeft: 4 } },
  ];
  assert.deepEqual(dashboardModel.prioritisePlatformAttention(rows).map((row) => row.id), [2, 3, 1]);
});

test('platform dashboard uses a compact mixed-chart portfolio and keeps exceptions operational', () => {
  const source = fs.readFileSync(new URL('../src/features/platform/PlatformDashboard.jsx', import.meta.url), 'utf8');
  for (const label of ['Portfolio health', 'Bank-class coverage', 'Active user footprint', 'Needs attention', 'Organisation attention register']) assert.match(source, new RegExp(label));
  assert.match(source, /PieChart/);
  assert.match(source, /BarChart/);
  assert.match(source, /innerRadius="68%"/);
  assert.match(source, /layout="vertical"/);
  assert.match(source, /Add organisation/);
});

test('tab keyboard navigation wraps across the available views', () => {
  assert.equal(dashboardModel.nextTabIndex(0, 'ArrowRight', 5), 1);
  assert.equal(dashboardModel.nextTabIndex(4, 'ArrowRight', 5), 0);
  assert.equal(dashboardModel.nextTabIndex(0, 'ArrowLeft', 5), 4);
  assert.equal(dashboardModel.nextTabIndex(2, 'Home', 5), 0);
  assert.equal(dashboardModel.nextTabIndex(2, 'End', 5), 4);
  assert.equal(dashboardModel.nextTabIndex(2, 'Enter', 5), 2);
});

test('pie data keeps the largest categories and combines the remainder', () => {
  const rows = [
    { label: 'A', value: 8, tone: 'success' },
    { label: 'B', value: 7 },
    { label: 'C', value: 6 },
    { label: 'D', value: 5 },
    { label: 'E', value: 4 },
    { label: 'F', value: 3 },
    { label: 'G', value: 2 },
    { label: 'Empty', value: 0 },
  ];
  assert.deepEqual(dashboardModel.preparePieItems(rows, 6), [
    { label: 'A', value: 8, tone: 'success' },
    { label: 'B', value: 7 },
    { label: 'C', value: 6 },
    { label: 'D', value: 5 },
    { label: 'E', value: 4 },
    { label: 'Other', value: 5 },
  ]);
});

test('pie data groups records by a visible label', () => {
  assert.deepEqual(
    dashboardModel.countByLabel([
      { bankClassLabel: 'Class I' },
      { bankClassLabel: 'Class II' },
      { bankClassLabel: 'Class I' },
      {},
    ], 'bankClassLabel'),
    [
      { label: 'Class I', value: 2 },
      { label: 'Class II', value: 1 },
      { label: 'Unclassified', value: 1 },
    ],
  );
});

test('operational dashboard filters omit empty values and retain valid scope', () => {
  assert.deepEqual(dashboardModel.dashboardParams({
    date: '2026-11-18',
    branchId: '',
    departmentId: 4,
    employmentType: 'REGULAR',
    search: '  EMP-1042  ',
    shiftId: '',
  }), {
    date: '2026-11-18',
    departmentId: 4,
    employmentType: 'REGULAR',
    search: 'EMP-1042',
  });
});

test('today actions are ordered by priority and then employee name', () => {
  assert.deepEqual(dashboardModel.prioritiseActions([
    { id: 1, priority: 'MEDIUM', employeeName: 'Zara' },
    { id: 2, priority: 'HIGH', employeeName: 'Bina' },
    { id: 3, priority: 'HIGH', employeeName: 'Anu' },
  ]).map((row) => row.id), [3, 2, 1]);
});

test('organisation dashboard composes the approved operational sections in priority order', () => {
  const source = fs.readFileSync(new URL('../src/features/org/OrgDashboard.jsx', import.meta.url), 'utf8');
  const filterIndex = source.indexOf('<DashboardFilterBar');
  const explorerIndex = source.indexOf('<OrganisationExplorer');
  const summaryIndex = source.indexOf('<OperationalSummary');
  assert.ok(filterIndex > 0 && filterIndex < explorerIndex && explorerIndex < summaryIndex);
  assert.match(source, /<h1>Overview<\/h1>/);
  assert.match(source, /useSearchParams/);
  assert.match(source, /commandCentreParams/);
  assert.doesNotMatch(source, /ActionCentre|actionFilters|BranchHealth|OrganisationOverview/);
  assert.doesNotMatch(source, /Today’s HR Actions|Approvals & Alerts|dashboard-workspace/);
  assert.equal(fs.existsSync(new URL('../src/features/dashboard/WorkforceInsights.jsx', import.meta.url)), false);
});

test('dashboard typography and controls use the shared role system without an overlaying filter bar', () => {
  const tokens = fs.readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../src/features/dashboard/Dashboard.css', import.meta.url), 'utf8');
  const globalStyles = fs.readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  for (const role of ['--font-display', '--font-data', '--type-page-title', '--type-section-title', '--type-card-title', '--type-label', '--type-meta']) assert.match(tokens, new RegExp(role));
  assert.match(globalStyles, /button,[\s\S]*select[\s\S]*font: inherit/);
  assert.match(styles, /\.command-filter-bar \{ position: relative/);
  assert.doesNotMatch(styles, /\.command-filter-bar \{ position: sticky/);
  assert.match(styles, /\.explorer-branch-grid > button > \.badge \{ align-self: start; justify-self: end; \}/);
});

test('branch health and secondary summaries expose text status, mobile actions and contextual empty states', () => {
  const branches = fs.readFileSync(new URL('../src/features/dashboard/BranchHealth.jsx', import.meta.url), 'utf8');
  const summary = fs.readFileSync(new URL('../src/features/dashboard/OperationalSummary.jsx', import.meta.url), 'utf8');
  for (const label of ['Healthy', 'Watch', 'Needs attention', 'Critical', 'No branches configured yet']) assert.match(branches, new RegExp(label, 'i'));
  assert.match(branches, /aria-label=.*Open.*branch dashboard/i);
  assert.match(branches, /command-branch-cards/);
  for (const label of ['Employee Movement', 'Payroll Readiness', 'Organisation Setup Issues']) assert.match(summary, new RegExp(label));
  assert.match(summary, /unavailable/i);
});

test('command-centre styling uses solid surfaces, responsive cards and visible focus states', () => {
  const styles = fs.readFileSync(new URL('../src/features/dashboard/Dashboard.css', import.meta.url), 'utf8');
  assert.match(styles, /command-surface/);
  assert.match(styles, /focus-visible/);
  assert.match(styles, /@media \(max-width: 560px\)/);
  assert.doesNotMatch(styles, /linear-gradient|radial-gradient|backdrop-filter/);
});

test('Action Centre unifies seven queues and only performs allowlisted leave decisions inline', () => {
  const source = fs.readFileSync(new URL('../src/features/dashboard/ActionCentre.jsx', import.meta.url), 'utf8');
  for (const label of ['All', 'Critical', 'Attendance', 'Payroll', 'Compliance', 'Onboarding', 'Approvals']) assert.match(source, new RegExp(`['\"]${label}['\"]`));
  for (const label of ['CRITICAL', 'HIGH', 'MEDIUM', 'ROUTINE']) assert.match(source, new RegExp(label));
  for (const label of ['Owner', 'Branch', 'Due date']) assert.match(source, new RegExp(label));
  assert.match(source, /command-action-table/);
  assert.match(source, /command-action-cards/);
  assert.match(source, /All clear/);
  assert.match(source, /quickAction === 'LEAVE_DECISION'/);
  assert.match(source, /canPermission\('leave\.approve'/);
  assert.match(source, /leaveApi\.decideApplication/);
  assert.match(source, /onNavigate\(destinationFor/);
  assert.doesNotMatch(source, /attendanceApi\.(update|correct)|compensationApi\.(update|decide)|payrollApi\.(update|approve)/);
});
