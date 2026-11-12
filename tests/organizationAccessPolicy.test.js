'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canAccessEmployee, selectLeaveApprover } = require('../src/services/organizationAccessPolicy');

test('branch grants never cross tenants or grant an unrelated action', () => {
  const actor = { id: 1, organizationId: 10, employeeId: 20 };
  const grants = [{ action: 'employee.read', scope: 'BRANCH', branchIds: [3] }];
  assert.equal(canAccessEmployee(actor, { id: 21, organizationId: 10, branchId: 3 }, 'employee.read', grants), true);
  assert.equal(canAccessEmployee(actor, { id: 21, organizationId: 11, branchId: 3 }, 'employee.read', grants), false);
  assert.equal(canAccessEmployee(actor, { id: 21, organizationId: 10, branchId: 4 }, 'employee.read', grants), false);
  assert.equal(canAccessEmployee(actor, { id: 21, organizationId: 10, branchId: 3 }, 'employee.edit', grants), false);
});

test('own scope and absent branch assignments fail closed', () => {
  const actor = { id: 1, organizationId: 10, employeeId: 20 };
  assert.equal(canAccessEmployee(actor, { id: 20, organizationId: 10 }, 'employee.read', [{ action: 'employee.read', scope: 'OWN' }]), true);
  assert.equal(canAccessEmployee(actor, { id: 21, organizationId: 10 }, 'employee.read', [{ action: 'employee.read', scope: 'BRANCH', branchIds: [] }]), false);
});

test('branch manager routing uses responsibility, not salary grade', () => {
  const request = { organizationId: 10, requesterId: 1, branchId: 3, responsibility: 'BRANCH_MANAGER', payGrade: 'SENIOR_CLERK' };
  const rule = { organizationId: 10, branchId: 3, requesterResponsibility: 'BRANCH_MANAGER', approverResponsibility: 'GM' };
  const assignments = [{ organizationId: 10, userId: 2, responsibility: 'GM', active: true, scope: 'ORGANISATION' }];
  assert.equal(selectLeaveApprover(request, rule, assignments), 2);
  assert.equal(selectLeaveApprover({ ...request, requesterId: 2 }, rule, assignments), null);
  assert.equal(selectLeaveApprover(request, rule, [...assignments, { ...assignments[0], userId: 3 }]), null);
  assert.equal(selectLeaveApprover(request, { ...rule, organizationId: 11 }, assignments), null);
});
