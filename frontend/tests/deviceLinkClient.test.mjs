import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, isSessionEndingError } from '../src/api/client.js';

test('only genuine authentication and organisation access failures end a browser session', () => {
  assert.equal(isSessionEndingError({ status: 401, body: {} }), true);
  assert.equal(isSessionEndingError({ status: 403, body: { code: 'ORG_SUSPENDED' } }), true);
  assert.equal(isSessionEndingError({ status: 429, body: {} }), false);
  assert.equal(isSessionEndingError({ status: 500, body: {} }), false);
  assert.equal(isSessionEndingError({ status: 0, body: null }), false);
});

test('wrong password while creating a QR leaves the portal session intact', async () => {
  const values = new Map([['token', 'browser-session']]);
  globalThis.sessionStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  let logout = false;
  globalThis.window = { dispatchEvent: () => { logout = true; } };
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ code: 'INVALID_CURRENT_PASSWORD', message: 'Current password is incorrect.' }) });
  await assert.rejects(api.post('/me/devices/link', { currentPassword: 'wrong' }), /incorrect/);
  assert.equal(values.get('token'), 'browser-session');
  assert.equal(logout, false);
});
