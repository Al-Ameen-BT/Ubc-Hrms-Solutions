import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { api, orgApi } from '../src/api/client.js';
import { canVisitRoute, organizationAccessApi } from '../src/api/organizationAccess.js';

const root = new URL('../src/', import.meta.url);
const source = (path) => { const url = new URL(path, root); return existsSync(url) ? readFileSync(url, 'utf8') : ''; };

test('branch dashboard and Organisation Explorer routes are permission gated', () => {
  assert.equal(canVisitRoute('/branches/7', (code) => code === 'hr.view'), true);
  assert.equal(canVisitRoute('/branches/7', (code) => code === 'chart.view'), false);
  assert.equal(canVisitRoute('/organisation-explorer', (code) => code === 'chart.view'), true);
  assert.equal(canVisitRoute('/organisation-explorer', (code) => code === 'self.profile'), false);
  const app = source('App.jsx');
  assert.match(app, /path="branches\/:branchId"/);
  assert.match(app, /path="organisation-explorer"/);
});

test('branch and chart clients preserve scoped query filters', async () => {
  const originalGet = api.get;
  const paths = [];
  api.get = async (path) => { paths.push(path); return {}; };
  try {
    await orgApi.branchDashboard(7, { date: '2026-11-24', departmentId: 4, search: '' });
    await organizationAccessApi.chart(undefined, { branchId: 7, departmentId: 4, level: 'employee' });
  } finally { api.get = originalGet; }
  assert.deepEqual(paths, [
    '/org/dashboard-analytics/branches/7?date=2026-11-24&departmentId=4',
    '/org/structure/chart?branchId=7&departmentId=4&level=employee',
  ]);
});

test('branch dashboard renders Organisation to Branch breadcrumbs and operational empty/error states', () => {
  const page = source('features/org/BranchDashboardPage.jsx');
  assert.match(page, /<Breadcrumbs/);
  assert.match(page, /Organisation/);
  assert.match(page, /Branch Dashboard/);
  for (const label of ['Department Staffing', 'Attendance Trend', 'Upcoming Approved Leave', 'Vacancies', 'Payroll Blockers', 'Compliance Issues']) assert.match(page, new RegExp(label));
  assert.match(page, /DashboardError/);
  assert.match(page, /No .* recorded|No .* require attention/i);
  assert.doesNotMatch(page, /currentBasicPay|bankAccount|aadhaar|panNumber|contactEmail|contactPhone/i);
});

test('Organisation Explorer supports three modes, progressive employee loading and safe contextual links', () => {
  const explorer = source('features/dashboard/OrganisationExplorer.jsx');
  const page = source('features/org/OrganisationExplorerPage.jsx');
  for (const label of ['Tree', 'Branch View', 'Workforce Map']) assert.match(explorer, new RegExp(label));
  assert.match(explorer, /explorer-details-panel/);
  assert.match(explorer, /explorer-mobile-list/);
  assert.match(explorer, /\/employees\/\$\{node\.id\}/);
  assert.match(page, /level: 'organization'/);
  assert.match(page, /level: 'department'/);
  assert.match(page, /level: 'position'/);
  assert.match(page, /level: 'employee'/);
  assert.match(page, /enabled: !!expandedPositionId/);
  assert.match(page, /No organisation assignments are available|could not be loaded/i);
  assert.doesNotMatch(`${explorer}\n${page}`, /currentBasicPay|bankAccount|aadhaar|panNumber|contactEmail|contactPhone/);
});
