import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('Reports uses one clear page identity and selected-report export labels', () => {
  const page = source('features/reports/ReportsPage.jsx');
  assert.match(page, /<h1 className="reports-title">Reports<\/h1>/);
  assert.doesNotMatch(page, /Audit & Operational Reports/);
  assert.match(page, /Export \{activeReport\.shortLabel\} as CSV/);
  assert.match(page, /Export \{activeReport\.shortLabel\} as Excel/);
  assert.match(page, /id: 'salary', label: 'Master Salary Register', shortLabel: 'Salary'/);
});

test('report selector exposes accessible tab and panel semantics', () => {
  const page = source('features/reports/ReportsPage.jsx');
  assert.match(page, /role="tablist"/);
  assert.match(page, /aria-label="Available reports"/);
  assert.match(page, /role="tab"/);
  assert.match(page, /aria-selected=\{activeTab === report\.id\}/);
  assert.match(page, /aria-controls=\{`report-panel-\$\{report\.id\}`\}/);
  assert.match(page, /role="tabpanel"/);
  assert.match(page, /aria-labelledby=\{`report-tab-\$\{activeTab\}`\}/);
});

test('Reports associates filter labels with controls and supports recovery states', () => {
  const page = source('features/reports/ReportsPage.jsx');
  for (const id of ['reports-branch', 'reports-search', 'reports-loan-type', 'reports-loan-status', 'reports-policy-type', 'reports-policy-status', 'reports-salary-year', 'reports-salary-month', 'reports-salary-status']) {
    assert.match(page, new RegExp(`htmlFor="${id}"`));
    assert.match(page, new RegExp(`id="${id}"`));
  }
  assert.match(page, /role="alert"/);
  assert.match(page, /Retry loading \{activeReport\.shortLabel\}/);
  assert.match(page, /onClick=\{resetActiveFilters\}/);
  assert.match(page, />Clear filters</);
});

test('Reports uses scoped design-system controls and contained register scrolling', () => {
  const page = source('features/reports/ReportsPage.jsx');
  assert.doesNotMatch(page, /className="form-control"/);
  assert.match(page, /className="input reports-control"/);
  assert.match(page, /className="reports-table-scroll"/);

  const css = source('features/reports/ReportsPage.css');
  assert.match(css, /\.reports-page \.reports-control/);
  assert.match(css, /\.reports-tab-btn:focus-visible/);
  assert.match(css, /\.reports-table-scroll\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.reports-table thead th\s*\{[^}]*position:\s*sticky/s);
  assert.match(css, /@media \(max-width:\s*760px\)/);
  assert.match(css, /min-height:\s*44px/);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient/);
});

test('Reports gives loading, empty and error states compact readable structure', () => {
  const css = source('features/reports/ReportsPage.css');
  assert.match(css, /\.reports-loading-box,[\s\S]*\.reports-empty-box,[\s\S]*\.reports-state/);
  assert.match(css, /\.reports-empty-box strong/);
  assert.match(css, /\.reports-error-state/);
  assert.match(css, /\.reports-panel/);
});
