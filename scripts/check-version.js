'use strict';

const assert = require('node:assert/strict');

const root = require('../package.json');
const frontend = require('../frontend/package.json');
const rootLock = require('../package-lock.json');
const frontendLock = require('../frontend/package-lock.json');

assert.match(root.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
for (const [name, version] of [
  ['frontend/package.json', frontend.version],
  ['package-lock.json', rootLock.version],
  ['package-lock.json root', rootLock.packages[''].version],
  ['frontend/package-lock.json', frontendLock.version],
  ['frontend/package-lock.json root', frontendLock.packages[''].version],
]) {
  assert.equal(version, root.version, `${name} must match package.json`);
}

console.log(`Application version ${root.version} is consistent.`);
