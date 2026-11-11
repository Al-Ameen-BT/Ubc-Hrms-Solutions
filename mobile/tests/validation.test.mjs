import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimAmount, receiptDetails, periodQuery } from '../src/validation.ts';

test('claim amount requires positive whole rupees', () => {
  assert.equal(claimAmount('140'), 140);
  assert.throws(() => claimAmount('140.5'), /whole/);
  assert.throws(() => claimAmount('0'), /positive/);
  assert.throws(() => claimAmount('99999999999999999'), /amount/);
});

test('receipt accepts only supported files up to five megabytes', () => {
  assert.equal(receiptDetails({ name: 'bill.pdf', mimeType: 'application/pdf', size: 1024 }).mimeType, 'application/pdf');
  assert.throws(() => receiptDetails({ name: 'bad.svg', mimeType: 'image/svg+xml', size: 10 }), /PDF or image/);
  assert.throws(() => receiptDetails({ name: 'big.pdf', mimeType: 'application/pdf', size: 5 * 1024 * 1024 + 1 }), /5 MB/);
});

test('period query rejects invalid months and preserves requested bank period', () => {
  assert.equal(periodQuery(2026, 11), 'year=2026&month=11');
  assert.throws(() => periodQuery(2026, 13), /month/);
});
