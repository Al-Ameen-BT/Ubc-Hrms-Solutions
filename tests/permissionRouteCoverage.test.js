'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'permission-route-test-secret';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { permission } = require('../src/services/permissionCatalog');
const { authenticate } = require('../src/middleware/auth');
const { isPermissionMiddleware } = require('../src/middleware/permissions');
const { isDeviceOwnGuard } = require('../src/routes/employeeDevices');
const api = require('../src/routes');
const models = require('../src/models');
after(() => models.sequelize.close());
const excluded = new Map([
  [require('../src/routes/public'), 'Public login branding'],
  [require('../src/routes/auth'), 'Authentication, MFA and own-account recovery'],
  [require('../src/routes/admin'), 'Explicit platform gate'],
  [require('../src/routes/bankRuleCatalogue'), 'Explicit platform gate'],
]);
function uncovered(router, inherited = [], prefix = '') {
  const missing = [];
  let guards = [...inherited];
  for (const layer of router.stack) {
    if (layer.route) {
      const chain = [...guards, ...layer.route.stack.map(item => item.handle)];
      let authenticated = false, valid = false, wrongOrder = false;
      for (const handler of chain) {
        if (handler === authenticate) authenticated = true;
        if (isPermissionMiddleware(handler)) {
          const guard = handler.authorization;
          if (!authenticated) wrongOrder = true;
          if (guard.codes?.length && guard.codes.every(code => permission(code)) && guard.resource) valid = true;
        } else if (isDeviceOwnGuard(handler) && handler.authorization.description) valid = true;
      }
      valid = valid && !wrongOrder;
      if (!valid) for (const method of Object.keys(layer.route.methods)) missing.push(`${method.toUpperCase()} ${prefix}${layer.route.path}`);
    } else if (layer.handle.stack && !excluded.has(layer.handle)) {
      missing.push(...uncovered(layer.handle, guards, `${prefix}${layer.regexp.source} `));
    } else if (layer.regexp.fast_slash) guards.push(layer.handle);
  }
  return missing;
}
test('every mounted organisation method registers permission/resource or strict employee/device ownership middleware', () => {
  const missing = uncovered(api);
  assert.deepEqual(missing, [], `Uncovered mounted methods:\n${missing.join('\n')}`);
});
test('coverage fails closed for a new mounted method without middleware metadata', () => {
  const root = express.Router(), feature = express.Router();
  feature.get('/new-feature', (req, res) => res.json({ data: [] }));
  root.use('/org', feature);
  assert.equal(uncovered(root).length, 1);
});
test('coverage rejects next-only handlers carrying forged permission or device metadata', () => {
  for (const authorization of [{ kind: 'permission', codes: ['people.view'], resource: 'TENANT' }, { kind: 'device-own', description: 'Pretends to validate a device' }]) {
    const feature = express.Router();
    const noop = (req, res, next) => next();
    noop.authorization = authorization;
    feature.get('/forged', require('../src/middleware/auth').authenticate, noop, (req, res) => res.json({ data: [] }));
    assert.equal(uncovered(feature).length, 1);
  }
});
test('coverage rejects permission middleware registered before authentication', () => {
  const feature = express.Router();
  feature.get('/wrong-order', require('../src/middleware/permissions').requirePermission('people.view'), require('../src/middleware/auth').authenticate, (req, res) => res.json({ data: [] }));
  assert.equal(uncovered(feature).length, 1);
});
