'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const orgFeatures = require('../src/services/orgFeatures');
const { requireFeature } = require('../src/middleware/featureGate');
const { OrganizationFeature, Organization } = require('../src/models');
const { audit } = require('../src/services/audit');
const { AuditLog } = require('../src/models');

test('FEATURE_CATALOGUE has expected structure and defaults', () => {
  assert.ok(Array.isArray(orgFeatures.FEATURE_CATALOGUE));
  assert.ok(orgFeatures.FEATURE_CATALOGUE.length >= 17);
  
  const payroll = orgFeatures.FEATURE_CATALOGUE.find(f => f.code === 'payroll');
  assert.ok(payroll);
  assert.equal(payroll.defaultEnabled, true);

  const geofence = orgFeatures.FEATURE_CATALOGUE.find(f => f.code === 'geofence');
  assert.ok(geofence);
  assert.equal(geofence.defaultEnabled, false);
});

test('feature toggle overrides save and take effect immediately without stale cache', async () => {
  const [testOrg] = await Organization.findOrCreate({
    where: { code: 'TEST_FEAT_ORG' },
    defaults: { name: 'Test Feature Org', status: 'ACTIVE', bankClass: 'CLASS_I' },
  });
  const orgId = testOrg.id;
  
  // Cleanup any leftover test rows
  await OrganizationFeature.destroy({ where: { organizationId: orgId } });

  // Initially, payroll should be enabled by default
  const defaultStatus = await orgFeatures.isFeatureEnabled(orgId, 'payroll');
  assert.equal(defaultStatus, true);

  // Disable payroll directly
  await orgFeatures.setFeature(orgId, 'payroll', false, 1, 'Disabled for maintenance');

  // Must immediately reflect as false on the very next call
  const disabledStatus = await orgFeatures.isFeatureEnabled(orgId, 'payroll');
  assert.equal(disabledStatus, false);

  // Enable it back
  await orgFeatures.setFeature(orgId, 'payroll', true, 1, 'Re-enabled');
  const enabledStatus = await orgFeatures.isFeatureEnabled(orgId, 'payroll');
  assert.equal(enabledStatus, true);

  // Cleanup
  await OrganizationFeature.destroy({ where: { organizationId: orgId } });
});

test('requireFeature middleware rejects non-authenticated requests', async () => {
  const middleware = requireFeature('payroll');
  const req = {};
  let statusCode = null;
  let responseData = null;
  const res = {
    status(code) {
      statusCode = code;
      return {
        json(data) {
          responseData = data;
        },
      };
    },
  };
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });

  assert.equal(statusCode, 401);
  assert.equal(nextCalled, false);
});

test('requireFeature middleware allows SUPER_ADMIN unconditionally (support bypass)', async () => {
  const [testOrg] = await Organization.findOrCreate({
    where: { code: 'TEST_FEAT_ORG_SA' },
    defaults: { name: 'Test Feature Org SA', status: 'ACTIVE', bankClass: 'CLASS_I' },
  });
  const orgId = testOrg.id;
  // Explicitly disable payroll
  await OrganizationFeature.destroy({ where: { organizationId: orgId } });
  await orgFeatures.setFeature(orgId, 'payroll', false, 1, 'Disabled');

  const middleware = requireFeature('payroll');
  const req = {
    user: {
      id: 1,
      role: 'SUPER_ADMIN',
      organizationId: null,
    },
  };
  let nextCalled = false;
  const res = {};
  await middleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true, 'SUPER_ADMIN must bypass feature gates');

  await OrganizationFeature.destroy({ where: { organizationId: orgId } });
});

test('requireFeature middleware blocks tenant users when feature is disabled', async () => {
  const [testOrg] = await Organization.findOrCreate({
    where: { code: 'TEST_FEAT_ORG_BLOCKED' },
    defaults: { name: 'Test Feature Org Blocked', status: 'ACTIVE', bankClass: 'CLASS_I' },
  });
  const orgId = testOrg.id;
  await OrganizationFeature.destroy({ where: { organizationId: orgId } });
  await orgFeatures.setFeature(orgId, 'payroll', false, 1, 'Disabled for billing');

  const middleware = requireFeature('payroll');
  const req = {
    user: {
      id: 10,
      role: 'ORG_ADMIN',
      organizationId: orgId,
    },
  };
  let statusCode = null;
  let responseData = null;
  const res = {
    status(code) {
      statusCode = code;
      return {
        json(data) {
          responseData = data;
        },
      };
    },
  };
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });

  assert.equal(statusCode, 403);
  assert.equal(responseData?.code, 'FEATURE_DISABLED');
  assert.equal(nextCalled, false);

  await OrganizationFeature.destroy({ where: { organizationId: orgId } });
});

test('temporary passwords and sensitive tokens are strictly scrubbed from audit details', async () => {
  const req = { user: { id: 1, email: 'admin@bank.in', organizationId: 100 } };
  
  await audit(req, 'test.credential.reset', {
    organizationId: 100,
    targetType: 'user',
    targetId: '42',
    details: {
      email: 'officer@bank.in',
      tempPassword: 'SuperSecret123!',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz',
      deliveryMethod: 'PLAINTEXT_MODAL_ACK',
    },
  });

  const row = await AuditLog.findOne({
    where: { action: 'test.credential.reset', targetId: '42' },
    order: [['id', 'DESC']],
  });

  assert.ok(row);
  assert.equal(row.details.email, 'officer@bank.in');
  assert.equal(row.details.deliveryMethod, 'PLAINTEXT_MODAL_ACK');
  assert.equal(row.details.tempPassword, '[REDACTED]', 'tempPassword must be scrubbed');
  assert.equal(row.details.passwordHash, '[REDACTED]', 'passwordHash must be scrubbed');

  await row.destroy();
});
