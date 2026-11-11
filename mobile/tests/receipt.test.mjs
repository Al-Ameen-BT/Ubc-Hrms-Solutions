import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receiptData } from '../src/receipt.ts';

test('invalid picked receipt is deleted from cache even when validation fails', async () => {
  let deleted = false;
  const file = { base64: async () => 'AAAA', delete: () => { deleted = true; } };
  await assert.rejects(receiptData({ name: 'large.pdf', mimeType: 'application/pdf', size: 5 * 1024 * 1024 + 1 }, file), /5 MB/);
  assert.equal(deleted, true);
});

test('accepted receipt is encoded and its picker copy is deleted', async () => {
  let deleted = false;
  const file = { base64: async () => 'AAAA', delete: () => { deleted = true; } };
  assert.deepEqual(await receiptData({ name: 'bill.pdf', mimeType: 'application/pdf', size: 4 }, file), { name: 'bill.pdf', dataUrl: 'data:application/pdf;base64,AAAA' });
  assert.equal(deleted, true);
});
