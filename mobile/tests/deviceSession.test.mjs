import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/api.ts';
import { parseLinkQr } from '../src/link.ts';
import { acceptEmployeeLink, restoreEmployeeSession, refreshEmployeeSession, revokeEmployeeSession } from '../src/session.ts';

const storage = () => {
  const values = new Map();
  return { getItemAsync: async key => values.get(key) || null, setItemAsync: async (key, value) => { values.set(key, value); }, deleteItemAsync: async key => { values.delete(key); }, peek: key => values.get(key) };
};
const linked = { accessToken: 'access-1', refreshToken: 'refresh-1', user: { id: 2, name: 'A', role: 'EMPLOYEE' } };

test('QR parser accepts only app link challenges', () => {
  assert.equal(parseLinkQr(`ucbhrms-link://${'A'.repeat(43)}`), 'A'.repeat(43));
  assert.throws(() => parseLinkQr('https://evil.example.invalid/login?token=abc'), /QR/);
  assert.throws(() => parseLinkQr('ucbhrms-link://short'), /QR/);
});

test('linked employee verification precedes secure token storage', async () => {
  const store = storage();
  const api = { get: async () => ({ linked: true, employee: { id: 3, name: 'A' } }) };
  await assert.rejects(acceptEmployeeLink({ ...linked, user: { role: 'ORG_ADMIN' } }, api, store), /employee/i);
  assert.equal(store.peek('employeeDeviceSession'), undefined);
  const session = await acceptEmployeeLink(linked, api, store);
  assert.equal(session.token, 'access-1');
  assert.deepEqual(JSON.parse(store.peek('employeeDeviceSession')), { accessToken: 'access-1', refreshToken: 'refresh-1' });
});

test('restore rotates refresh before checking employee identity', async () => {
  const store = storage();
  await store.setItemAsync('employeeDeviceSession', JSON.stringify({ accessToken: 'old', refreshToken: 'old-refresh' }));
  const calls = [];
  const api = { post: async (path, body) => { calls.push([path, body]); return { accessToken: 'new', refreshToken: 'new-refresh', user: linked.user }; }, get: async path => path === '/auth/me' ? linked.user : { linked: true, employee: { id: 3, name: 'A' } } };
  const session = await restoreEmployeeSession(api, store);
  assert.equal(session.token, 'new');
  assert.deepEqual(calls[0], ['/mobile/session/refresh', { refreshToken: 'old-refresh' }]);
  assert.equal(JSON.parse(store.peek('employeeDeviceSession')).refreshToken, 'new-refresh');
});

test('network outage preserves refresh credential for retry', async () => {
  const store = storage();
  await store.setItemAsync('employeeDeviceSession', JSON.stringify({ accessToken: 'old', refreshToken: 'old-refresh' }));
  await assert.rejects(restoreEmployeeSession({ post: async () => { throw new ApiError('Offline', 0); } }, store), /Offline/);
  assert.equal(JSON.parse(store.peek('employeeDeviceSession')).refreshToken, 'old-refresh');
});

test('temporary server and rate-limit failures preserve refresh credential for retry', async () => {
  for (const status of [429, 500]) {
    const store = storage();
    await store.setItemAsync('employeeDeviceSession', JSON.stringify({ accessToken: 'old', refreshToken: 'old-refresh' }));
    await assert.rejects(restoreEmployeeSession({ post: async () => { throw new ApiError('Temporary failure', status); } }, store), /Temporary/);
    assert.equal(JSON.parse(store.peek('employeeDeviceSession')).refreshToken, 'old-refresh');
  }
});

test('invalid and suspended sessions clear stored device credentials', async () => {
  for (const error of [new ApiError('Expired', 401), new ApiError('Suspended', 403, 'ORG_SUSPENDED')]) {
    const store = storage();
    await store.setItemAsync('employeeDeviceSession', JSON.stringify({ accessToken: 'old', refreshToken: 'old-refresh' }));
    assert.equal(await restoreEmployeeSession({ post: async () => { throw error; } }, store), null);
    assert.equal(store.peek('employeeDeviceSession'), undefined);
  }
});

test('stale concurrent renewal reuses new access token without rotating twice', async () => {
  const store = storage();
  await store.setItemAsync('employeeDeviceSession', JSON.stringify({ accessToken: 'old', refreshToken: 'old-refresh' }));
  let calls = 0;
  const api = { post: async () => { calls++; return { accessToken: 'new', refreshToken: 'new-refresh', user: linked.user }; } };
  const first = await refreshEmployeeSession(api, store, 'old');
  const second = await refreshEmployeeSession(api, store, 'old');
  assert.equal(first.accessToken, 'new');
  assert.equal(second.accessToken, 'new');
  assert.equal(calls, 1);
});

test('sign-out clears an already-revoked phone but keeps credentials when offline', async () => {
  const store = storage();
  await store.setItemAsync('employeeDeviceSession', JSON.stringify({ accessToken: 'old', refreshToken: 'refresh' }));
  await assert.rejects(revokeEmployeeSession({ post: async () => { throw new ApiError('Offline', 0); } }, store), /Offline/);
  assert.ok(store.peek('employeeDeviceSession'));
  await revokeEmployeeSession({ post: async () => { throw new ApiError('Revoked', 401); } }, store);
  assert.equal(store.peek('employeeDeviceSession'), undefined);
});
