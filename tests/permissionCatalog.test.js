'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PERMISSIONS, ROLE_TEMPLATES, permission, template } = require('../src/services/permissionCatalog');

test('catalogue has exactly nine protected immutable templates and stable unique codes', () => {
  assert.deepEqual(ROLE_TEMPLATES.map(t => t.code).sort(), ['ORGANISATION_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'DEPARTMENT_HEAD', 'BRANCH_MANAGER', 'DATA_PROTECTION_OFFICER', 'EMPLOYEE'].sort());
  assert.equal(new Set(PERMISSIONS.map(p => p.code)).size, PERMISSIONS.length);
  assert.ok(Object.isFrozen(PERMISSIONS));
  assert.ok(Object.isFrozen(ROLE_TEMPLATES));
  for (const p of PERMISSIONS) {
    assert.equal(permission(p.code), p);
    assert.ok(p.module && p.action && p.risk);
    assert.ok(Object.isFrozen(p.allowedScopes));
    assert.ok(Object.isFrozen(p.guardrails));
  }
  for (const t of ROLE_TEMPLATES) {
    assert.equal(template(t.code), t);
    assert.ok(Object.isFrozen(t.permissionCodes));
    assert.ok(t.permissionCodes.length);
    for (const code of t.permissionCodes) {
      assert.ok(permission(code), code);
      assert.ok(t.allowedScopes.some(scope => permission(code).allowedScopes.includes(scope)), code);
    }
  }
  assert.equal(permission('__proto__'), null);
  assert.equal(template('SUPER_ADMIN'), null);
});

test('template ceilings separate HR, financial preparation, approval, payment and branch structure', () => {
  const has = (role, code) => template(role).permissionCodes.includes(code);
  assert.ok(has('HR_ADMIN', 'people.edit'));
  assert.ok(!has('HR_ADMIN', 'payroll.prepare'));
  assert.ok(!has('HR_OFFICER', 'compensation.prepare'));
  assert.deepEqual(template('HR_OFFICER').allowedScopes, ['SELECTED_BRANCHES']);
  assert.deepEqual(template('DEPARTMENT_HEAD').allowedScopes, ['DEPARTMENT']);
  assert.ok(has('PAYROLL_OFFICER', 'payroll.prepare'));
  assert.ok(!has('PAYROLL_OFFICER', 'payroll.approve'));
  assert.ok(has('APPROVING_AUTHORITY', 'payroll.approve'));
  assert.ok(!has('APPROVING_AUTHORITY', 'payments.pay'));
  assert.ok(has('ACCOUNTS_OFFICER', 'payments.pay'));
  assert.ok(!has('ACCOUNTS_OFFICER', 'compensation.prepare'));
  assert.ok(has('BRANCH_MANAGER', 'geofence.manage'));
  assert.ok(!has('BRANCH_MANAGER', 'branches.manage'));
  assert.deepEqual(template('EMPLOYEE').allowedScopes, ['OWN']);
  assert.ok(!has('EMPLOYEE', 'people.edit'));
  assert.ok(permission('payroll.approve').guardrails.includes('PREPARER_CANNOT_APPROVE'));
  assert.ok(permission('payments.pay').guardrails.includes('APPROVER_CANNOT_PAY'));
  assert.equal(permission('geofence.manage').requiresFeature, 'geofence');
});
