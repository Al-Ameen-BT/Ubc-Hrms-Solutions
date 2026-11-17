import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as apiModule from '../src/api.ts';

const { createApi } = apiModule;

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

test('access changes end the session without refreshing a revoked token', async () => {
  let renewals = 0; const ended = [];
  const api = createApi('https://hrms.example.invalid', async () => ({ ok: false, status: 401, json: async () => ({ code: 'ACCESS_CHANGED', message: 'Access changed' }) }), async code => { await new Promise(resolve => setTimeout(resolve, 5)); ended.push(code); }, async () => { renewals++; return 'new'; });
  await assert.rejects(api.get('/me/chart', 'old'), error => error.code === 'ACCESS_CHANGED');
  assert.equal(renewals, 0);
  assert.deepEqual(ended, ['ACCESS_CHANGED']);
});

test('employee chart parser keeps only scoped work identity and private photo references', () => {
  assert.equal(typeof apiModule.parseEmployeeChart, 'function');
  const chart = apiModule.parseEmployeeChart({
    at: '2026-11-17', view: 'employee', salary: 999999, bankAccount: 'private',
    context: { assigned: true, branch: { id: 10, code: 'BR1', name: 'Main Branch', unitType: 'BRANCH', address: 'private' }, department: { id: 20, code: 'OPS', name: 'Operations' }, position: { id: 30, code: 'CLERK', name: 'Clerk', reportsToPositionId: 40 } },
    employees: [{ id: 1, empCode: 'E001', name: 'A very long employee name that must remain complete', photoRef: '/api/v1/employees/1/photo?view=employee', mobile: 'private', currentBasicPay: 50000, branch: { id: 10, code: 'BR1', name: 'Main Branch', unitType: 'BRANCH' }, department: { id: 20, code: 'OPS', name: 'Operations' }, position: { id: 30, code: 'CLERK', name: 'Clerk', reportsToPositionId: 40 } }],
    leadership: [{ id: 2, name: 'External Chair', role: 'CHAIRMAN', roleOther: null, displayOrder: 1, photoRef: 'https://evil.example.invalid/photo', email: 'private@example.invalid' }],
  });
  assert.equal(chart.employees[0].name, 'A very long employee name that must remain complete');
  assert.equal(chart.employees[0].photoRef, '/api/v1/employees/1/photo?view=employee');
  assert.equal(chart.leadership[0].photoRef, null);
  assert.equal(JSON.stringify(chart).includes('private'), false);
  assert.deepEqual(Object.keys(chart.employees[0]).sort(), ['branch', 'department', 'empCode', 'id', 'name', 'photoRef', 'position']);
});

test('employee chart sections separate Head Office leadership from the current branch', () => {
  assert.equal(typeof apiModule.employeeChartSections, 'function');
  const chart = apiModule.parseEmployeeChart({
    at: '2026-11-17', view: 'employee', context: { assigned: true, branch: { id: 10, code: 'BR1', name: 'Main Branch', unitType: 'BRANCH' }, department: null, position: null },
    employees: [
      { id: 1, empCode: 'E1', name: 'Own branch employee', photoRef: null, branch: { id: 10, code: 'BR1', name: 'Main Branch', unitType: 'BRANCH' }, department: null, position: null },
      { id: 2, empCode: 'E2', name: 'Head Office leader', photoRef: null, branch: { id: 11, code: 'HO', name: 'Head Office', unitType: 'HEAD_OFFICE' }, department: null, position: { id: 12, code: 'GM', name: 'General Manager', reportsToPositionId: null } },
    ],
    leadership: [{ id: 3, name: 'Chair', role: 'CHAIRMAN', roleOther: null, displayOrder: 1, photoRef: null }],
  });
  const sections = apiModule.employeeChartSections(chart);
  assert.deepEqual(sections.leadership.map(row => row.name), ['Chair', 'Head Office leader']);
  assert.equal(sections.branch?.name, 'Main Branch');
  assert.deepEqual(sections.branch?.employees.map(row => row.name), ['Own branch employee']);
});

test('rate-limited access renewal does not end the device session', async () => {
  let expired = false;
  const api = createApi('https://hrms.example.invalid', async () => ({ ok: false, status: 401, json: async () => ({ message: 'Expired' }) }), () => { expired = true; }, async () => {
    throw Object.assign(new Error('Too many requests'), { status: 429 });
  });
  await assert.rejects(api.get('/me/payslips', 'old'), /Too many/);
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
