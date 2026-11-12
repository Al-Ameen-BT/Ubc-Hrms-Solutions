'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { provisionPushSecrets } = require('../src/scripts/provisionPushSecrets');
test('provisions once, preserves settings and rejects broken pairs without writes', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hrms-push-test-'));
  const filename = path.join(directory, '.env');
  try {
    fs.writeFileSync(filename, 'APP_BASE_URL=https://example.invalid\n');
    assert.equal(provisionPushSecrets(filename), 3);
    const saved = fs.readFileSync(filename, 'utf8');
    assert.equal(provisionPushSecrets(filename), 0);
    assert.equal(fs.readFileSync(filename, 'utf8'), saved);
    assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
    fs.writeFileSync(filename, 'VAPID_PUBLIC_KEY=incomplete\n');
    assert.throws(() => provisionPushSecrets(filename), /Incomplete/);
    assert.equal(fs.readFileSync(filename, 'utf8'), 'VAPID_PUBLIC_KEY=incomplete\n');
  } finally { fs.rmSync(directory, { recursive: true }); }
});
