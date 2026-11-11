'use strict';

const assert = require('node:assert/strict');

const root = require('../package.json');
const frontend = require('../frontend/package.json');
const mobile = require('../mobile/package.json');
const rootLock = require('../package-lock.json');
const frontendLock = require('../frontend/package-lock.json');
const mobileLock = require('../mobile/package-lock.json');
const mobileConfig = require('../mobile/app.json');

assert.match(root.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
for (const [name, version] of [
  ['frontend/package.json', frontend.version],
  ['mobile/package.json', mobile.version],
  ['package-lock.json', rootLock.version],
  ['package-lock.json root', rootLock.packages[''].version],
  ['frontend/package-lock.json', frontendLock.version],
  ['frontend/package-lock.json root', frontendLock.packages[''].version],
  ['mobile/package-lock.json', mobileLock.version],
  ['mobile/package-lock.json root', mobileLock.packages[''].version],
]) {
  assert.equal(version, root.version, `${name} must match package.json`);
}
assert.equal(mobileConfig.expo.version, root.version.split('-')[0], 'mobile/app.json must show the release version');
const originalApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
try {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://172.17.121.200:8443';
  const uatConfig = require('../mobile/app.config.js')({ config: { ...mobileConfig.expo } });
  assert.equal(uatConfig.version, root.version, 'UAT APK version must match package.json');
} finally {
  if (originalApiBaseUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBaseUrl;
}

console.log(`Application version ${root.version} is consistent.`);
