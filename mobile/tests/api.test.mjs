import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/api.ts';

test('QR link claim is sent only to the configured origin', async () => {
  const calls = [];
  const api = createApi('https://hrms.example.invalid', async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ data: { linkId: 1 } }) };
  });
  await api.post('/mobile/link/claim', { challenge: 'challenge', claimSecret: 'secret', platform: 'android', deviceName: 'Phone' });
  assert.equal(calls[0].url, 'https://hrms.example.invalid/api/v1/mobile/link/claim');
  assert.deepEqual(JSON.parse(calls[0].options.body), { challenge: 'challenge', claimSecret: 'secret', platform: 'android', deviceName: 'Phone' });
  assert.throws(() => createApi('javascript:alert(1)'), /HTTPS/);
  assert.throws(() => createApi('https://hrms.example.invalid/path'), /origin/);
});

test('authenticated request sends bearer and clears expired session', async () => {
  let expired = false;
  const api = createApi('https://hrms.example.invalid', async (_, options) => {
    assert.equal(options.headers.Authorization, 'Bearer expiring-token');
    return { ok: false, status: 401, json: async () => ({ message: 'Expired' }) };
  }, () => { expired = true; });
  await assert.rejects(api.get('/me/payslips', 'expiring-token'), /Expired/);
  assert.equal(expired, true);
});

test('expired device access renews and retries once with the new token', async () => {
  const seen = []; let expired = false;
  const api = createApi('https://hrms.example.invalid', async (_, options) => {
    seen.push(options.headers.Authorization);
    return seen.length === 1 ? { ok: false, status: 401, json: async () => ({ message: 'Expired' }) } : { ok: true, status: 200, json: async () => ({ data: { rows: [1] } }) };
  }, () => { expired = true; }, async stale => { assert.equal(stale, 'old'); return 'new'; });
  assert.deepEqual(await api.get('/me/payslips', 'old'), { rows: [1] });
  assert.deepEqual(seen, ['Bearer old', 'Bearer new']);
  assert.equal(expired, false);
});

test('password change keeps session for wrong current password but clears expired token', async () => {
  let expired = 0;
  const wrongPassword = createApi('https://hrms.example.invalid', async () => ({ ok: false, status: 401, json: async () => ({ code: 'INVALID_CURRENT_PASSWORD', message: 'Current password is incorrect' }) }), () => { expired++; });
  await assert.rejects(wrongPassword.post('/auth/change-password', { currentPassword: 'wrong' }, 'valid-token'), /incorrect/);
  assert.equal(expired, 0);
  const stale = createApi('https://hrms.example.invalid', async () => ({ ok: false, status: 401, json: async () => ({ message: 'Invalid or expired token' }) }), () => { expired++; });
  await assert.rejects(stale.post('/auth/change-password', { currentPassword: 'correct' }, 'stale-token'), /expired/);
  assert.equal(expired, 1);
});

test('bank suspension clears authenticated employee data', async () => {
  let expired = false;
  const api = createApi('https://hrms.example.invalid', async () => ({ ok: false, status: 403, json: async () => ({ code: 'ORG_SUSPENDED', message: 'Bank suspended' }) }), () => { expired = true; });
  await assert.rejects(api.get('/me/payslips', 'token'), /suspended/);
  assert.equal(expired, true);
});

test('binary download sends bearer and keeps response bytes out of JSON parsing', async () => {
  const api = createApi('https://hrms.example.invalid', async (url, options) => {
    assert.equal(url, 'https://hrms.example.invalid/api/v1/me/payslips/7/pdf');
    assert.equal(options.headers.Authorization, 'Bearer employee-token');
    return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/pdf' }), arrayBuffer: async () => Uint8Array.from([37, 80, 68, 70]).buffer };
  });
  const file = await api.download('/me/payslips/7/pdf', 'employee-token');
  assert.deepEqual([...file.bytes], [37, 80, 68, 70]);
  assert.equal(file.mimeType, 'application/pdf');
});
