import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('organisation navigation uses the eight approved functional groups without generic More truncation', () => {
  const sidebar = source('components/Sidebar.jsx');
  for (const label of ['Overview', 'Workforce', 'Time & Attendance', 'Pay & Benefits', 'Governance', 'Analytics', 'My Workspace', 'Administration']) {
    assert.match(sidebar, new RegExp(`label: '${label.replace('&', '\\&')}'`));
  }
  assert.match(sidebar, /Reports & Analytics/);
  assert.doesNotMatch(sidebar, /sidebar-more-btn|>More<|TOP_LIMIT/);
  assert.doesNotMatch(sidebar, /Recruitment|Performance/);
  assert.match(sidebar, /if \(!authorizedItems\.length\) return null/);
});

test('navigation groups persist for the session and expose the active route', () => {
  const sidebar = source('components/Sidebar.jsx');
  assert.match(sidebar, /sessionStorage\.getItem\('ucb:sidebar-groups'\)/);
  assert.match(sidebar, /sessionStorage\.setItem\('ucb:sidebar-groups'/);
  assert.match(sidebar, /hasActiveItem/);
  assert.match(sidebar, /aria-expanded=\{isOpen\}/);
  assert.match(sidebar, /location\.pathname\.startsWith/);
});

test('employee search is permission scoped, keyboard operable and renders only safe work identity fields', () => {
  const sidebar = source('components/Sidebar.jsx');
  assert.match(sidebar, /canPermission\('people\.view'/);
  assert.match(sidebar, /masterDataApi\.employees/);
  assert.match(sidebar, /onKeyDown/);
  assert.match(sidebar, /ArrowDown/);
  assert.match(sidebar, /ArrowUp/);
  assert.match(sidebar, /Enter/);
  assert.match(sidebar, /navigate\(`\/employees\/\$\{employee\.id\}`\)/);
  for (const field of ['name', 'empCode', 'branch', 'department', 'position', 'status']) assert.match(sidebar, new RegExp(`employee\\.${field}`));
  assert.doesNotMatch(sidebar, /contactPhone|contactEmail|mobile|aadhaar|panNumber|bankAccount|currentBasicPay/i);
});

test('navigation styles include compact search results and collapsible group controls', () => {
  const css = source('styles/app.css');
  assert.match(css, /sidebar-employee-search/);
  assert.match(css, /sidebar-search-results/);
  assert.match(css, /sidebar-group-toggle/);
  assert.match(css, /:focus-visible/);
});
