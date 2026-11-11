import test from 'node:test';
import assert from 'node:assert/strict';
import {
  firstName,
  initials,
  isPrimarySectionSelected,
  navigationItems,
  statusMeta,
} from '../src/presentation.ts';

test('status metadata gives financial and workflow states readable labels and tones', () => {
  assert.deepEqual(statusMeta('APPROVED'), { label: 'Approved', tone: 'success' });
  assert.deepEqual(statusMeta('PENDING'), { label: 'Pending', tone: 'warning' });
  assert.deepEqual(statusMeta('REJECTED'), { label: 'Rejected', tone: 'danger' });
  assert.deepEqual(statusMeta('IN_PROGRESS'), { label: 'In progress', tone: 'info' });
  assert.deepEqual(statusMeta('something_new'), { label: 'Something new', tone: 'neutral' });
  assert.deepEqual(statusMeta('FINALIZED'), { label: 'Finalized', tone: 'success' });
  assert.deepEqual(statusMeta('EXPIRED'), { label: 'Expired', tone: 'danger' });
  assert.deepEqual(statusMeta('ACTIVE'), { label: 'Active', tone: 'info' });
});

test('nested employee services keep More selected in primary navigation', () => {
  assert.equal(isPrimarySectionSelected('Home', 'Home'), true);
  assert.equal(isPrimarySectionSelected('Claims', 'More'), true);
  assert.equal(isPrimarySectionSelected('Calendar', 'More'), true);
  assert.equal(isPrimarySectionSelected('Payslips', 'More'), false);
  assert.equal(isPrimarySectionSelected('Time', 'Time'), true);
  for (const section of ['Policies', 'Calendar', 'Workplace', 'Claims', 'Profile']) {
    assert.equal(isPrimarySectionSelected(section, 'More'), true, `${section} should select More`);
  }
  for (const item of navigationItems) {
    assert.equal(isPrimarySectionSelected(item.section, item.section), true);
  }
});

test('navigation metadata keeps five compact accessible destinations', () => {
  assert.deepEqual(navigationItems.map(item => item.label), ['Home', 'Pay', 'Leave', 'Time', 'More']);
  assert.equal(new Set(navigationItems.map(item => item.section)).size, 5);
  assert.ok(navigationItems.every(item => item.glyph.length > 0));
  assert.ok(navigationItems.every(item => item.accessibilityLabel.length > item.label.length));
});

test('employee display helpers remain safe for missing and long names', () => {
  assert.equal(firstName('  Al Ameen N R  '), 'Al');
  assert.equal(firstName(''), 'Employee');
  assert.equal(initials('Al Ameen N R'), 'AA');
  assert.equal(initials('Single'), 'S');
  assert.equal(initials(undefined), 'E');
});
