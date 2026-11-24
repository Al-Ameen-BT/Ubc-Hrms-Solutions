import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commandCentreParams,
  updateCommandCentreFilter,
  clearCommandCentreFilters,
  filterActions,
  distributionDestination,
} from '../src/features/dashboard/dashboardModel.js';

test('command centre filters round-trip through URL parameters without empty values', () => {
  const params = new URLSearchParams('branchId=12&departmentId=7&employmentType=REGULAR&date=2026-11-24&period=30d&search=Anjali');
  assert.deepEqual(commandCentreParams(params), {
    branchId: 12,
    departmentId: 7,
    employmentType: 'REGULAR',
    date: '2026-11-24',
    period: '30d',
    search: 'Anjali',
  });
  assert.deepEqual(commandCentreParams(new URLSearchParams('branchId=&search=++')), {});
});

test('changing branch clears a stale department and preserves non-filter history state', () => {
  const current = new URLSearchParams('branchId=1&departmentId=4&actionTab=payroll&panel=details');
  const next = updateCommandCentreFilter(current, 'branchId', 2);
  assert.equal(next.get('branchId'), '2');
  assert.equal(next.has('departmentId'), false);
  assert.equal(next.get('actionTab'), 'payroll');
  assert.equal(next.get('panel'), 'details');
  assert.equal(current.get('branchId'), '1');

  const cleared = clearCommandCentreFilters(next);
  assert.equal(cleared.has('branchId'), false);
  assert.equal(cleared.get('actionTab'), 'payroll');
  assert.equal(cleared.get('panel'), 'details');
});

test('action centre filters all, critical and category views without mutating rows', () => {
  const actions = [
    { id: 'a', priority: 'CRITICAL', category: 'PAYROLL', branchId: 1, owner: 'Payroll Officer', dueDate: '2026-11-20' },
    { id: 'b', priority: 'HIGH', category: 'ATTENDANCE', branchId: 2, owner: 'HR Admin', dueDate: '2026-11-24' },
    { id: 'c', priority: 'MEDIUM', category: 'APPROVALS', branchId: 1, owner: 'Reporting manager', dueDate: null },
  ];
  assert.deepEqual(filterActions(actions, { tab: 'all' }).map(row => row.id), ['a', 'b', 'c']);
  assert.deepEqual(filterActions(actions, { tab: 'critical' }).map(row => row.id), ['a']);
  assert.deepEqual(filterActions(actions, { tab: 'attendance' }).map(row => row.id), ['b']);
  assert.deepEqual(filterActions(actions, { tab: 'all', branchId: 1, owner: 'Payroll Officer' }).map(row => row.id), ['a']);
  assert.deepEqual(actions.map(row => row.id), ['a', 'b', 'c']);
  assert.deepEqual(filterActions([], { tab: 'critical' }), []);
});

test('distribution drill-down produces a stable filtered People destination', () => {
  assert.equal(distributionDestination({ query: { departmentId: 7, branchId: 2 } }), '/people?branchId=2&departmentId=7');
  assert.equal(distributionDestination({ destination: '/organisation-structure?view=vacancies' }), '/organisation-structure?view=vacancies');
  assert.equal(distributionDestination({ query: {} }), '/people');
});
