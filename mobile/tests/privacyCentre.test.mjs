import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/screens/Services.tsx', import.meta.url), 'utf8');

test('mobile privacy centre uses self-owned DPDP endpoints and symmetric optional consent', () => {
  for (const path of ['/me/dpdp/summary', '/me/dpdp/notices', '/me/dpdp/consents', '/me/dpdp/sharing', '/me/dpdp/requests', '/me/dpdp/nomination', '/me/dpdp/profile']) assert.match(source, new RegExp(path.replaceAll('/', '\\/')));
  assert.match(source, /language: 'ML'/);
  assert.match(source, /channel: 'MOBILE'/);
  assert.match(source, /grant/);
  assert.match(source, /withdraw/);
  assert.doesNotMatch(source, /AsyncStorage|SecureStore.*notice|localStorage/);
});
