import { test } from 'node:test';
import assert from 'node:assert/strict';

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
