import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const compensationOptions = await import('../src/features/org/transferCompensationOptions.js').catch(() => ({}));

test('direct-pay transfer references include exact-date pending proposals and only the latest eligible approval', () => {
  assert.equal(typeof compensationOptions.eligibleTransferCompensation, 'function', 'transfer compensation option policy is available');
  const assignments = [
    { id: 1, status: 'APPROVED', effectiveDate: '2024-01-01' },
    { id: 2, status: 'APPROVED', effectiveDate: '2026-10-01' },
    { id: 3, status: 'APPROVED', effectiveDate: '2027-01-01' },
    { id: 4, status: 'PENDING', effectiveDate: '2026-11-17' },
    { id: 5, status: 'PENDING', effectiveDate: '2026-11-01' },
  ];

  assert.deepEqual(compensationOptions.eligibleTransferCompensation(assignments, true, '2026-11-17').map(row => row.id), [4, 2]);
  assert.deepEqual(compensationOptions.eligibleTransferCompensation(assignments, false, '2026-11-17').map(row => row.id), [4]);

  const page = readFileSync(new URL('../src/features/org/OrganisationStructurePage.jsx', import.meta.url), 'utf8');
  assert.match(page, /eligibleTransferCompensation\(employeeCompensation, selectedTransferEmployee\?\.directPay, transferForm\.effectiveDate\)/);
});
