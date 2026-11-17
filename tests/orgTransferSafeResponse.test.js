'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { safeRoleChanges } = require('../src/routes/orgTransfers');

test('transfer responses expose normalized role scope identifiers without internal payloads', () => {
  assert.deepEqual(safeRoleChanges({
    closeAssignmentIds: ['7', 'bad'], retainAssignmentIds: [8],
    start: [{ roleId: '9', scopeType: 'SELECTED_BRANCHES', branchIds: ['2', 'bad'], departmentIds: [], amount: 50000, email: 'private@invalid.test' }],
    internalProposal: { amount: 50000 },
  }), {
    closeAssignmentIds: [7], retainAssignmentIds: [8],
    start: [{ roleId: 9, scopeType: 'SELECTED_BRANCHES', branchIds: [2], departmentIds: [] }],
  });
});
