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
