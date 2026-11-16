'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'permission-route-test-secret';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { permission } = require('../src/services/permissionCatalog');
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
      const routeGuards = [...guards, ...layer.route.stack.map(item => item.handle.authorization).filter(Boolean)];
      const valid = routeGuards.some(guard =>
        guard.kind === 'permission' && guard.codes?.length && guard.codes.every(code => permission(code)) && guard.resource
        || guard.kind === 'employee-own' && guard.description
        || guard.kind === 'device-own' && guard.description);
      if (!valid) for (const method of Object.keys(layer.route.methods)) missing.push(`${method.toUpperCase()} ${prefix}${layer.route.path}`);
    } else if (layer.handle.stack && !excluded.has(layer.handle)) {
      missing.push(...uncovered(layer.handle, guards, `${prefix}${layer.regexp.source} `));
    } else if (layer.regexp.fast_slash && layer.handle.authorization) guards.push(layer.handle.authorization);
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
