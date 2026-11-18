'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PERMISSIONS, ROLE_TEMPLATES } = require('../src/services/permissionCatalog');

test('protected catalogue has nine described templates and immutable permission metadata', () => {
  assert.equal(ROLE_TEMPLATES.length, 10);
  assert.ok(ROLE_TEMPLATES.every(role => role.description && Object.isFrozen(role)));
  assert.ok(PERMISSIONS.every(permission => permission.guardrails && permission.allowedScopes && permission.risk));
});
