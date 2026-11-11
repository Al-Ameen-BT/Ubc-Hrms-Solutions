import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import app from '../app.json' with { type: 'json' };
import { prepareBrandAssets } from '../scripts/prepare-brand-assets.mjs';

const png = await readFile(new URL('../assets/favicon.png', import.meta.url));
const response = (body = png, type = 'image/png') => new Response(body, { status: 200, headers: { 'content-type': type, 'content-length': String(body.length) } });

test('native app identity is UCB-HRMS with numeric-only versioning', () => {
  assert.equal(app.expo.name, 'UCB-HRMS');
  assert.match(app.expo.version, /^\d+\.\d+\.\d+$/);
  assert.equal(app.expo.slug, 'ucb-employee');
  assert.equal(app.expo.android.package, 'in.banihal.ucbemployee.uat');
});

test('brand preparation accepts only HTTPS platform origins', async () => {
  await assert.rejects(
    prepareBrandAssets({ apiBaseUrl: 'http://hrms.example.com', fetchImpl: async () => response(), outputPath: '/tmp/unused-platform-icon.png' }),
    /HTTPS/,
  );
});

test('brand preparation writes a normalized PNG from the current platform favicon', async () => {
  const dir = await mkdtemp(join(process.cwd(), '.ucb-brand-test-'));
  const outputPath = join(dir, 'platform-icon.png');
  let requested = '';
  const result = await prepareBrandAssets({
    apiBaseUrl: 'https://hrms.example.com/',
    fetchImpl: async url => { requested = String(url); return response(); },
    outputPath,
  });
  try {
    const written = await readFile(outputPath);
    assert.equal(requested, 'https://hrms.example.com/assets/platform/favicon');
    assert.equal(written.subarray(1, 4).toString(), 'PNG');
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('invalid favicon does not overwrite a known-good generated asset', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ucb-brand-'));
  const outputPath = join(dir, 'platform-icon.png');
  await writeFile(outputPath, png);
  await assert.rejects(
    prepareBrandAssets({ apiBaseUrl: 'https://hrms.example.com', fetchImpl: async () => response(Buffer.from('not an image'), 'text/plain'), outputPath }),
    /image/,
  );
  assert.deepEqual(await readFile(outputPath), png);
});

test('oversized favicon is rejected before it is decoded', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ucb-brand-'));
  await assert.rejects(
    prepareBrandAssets({ apiBaseUrl: 'https://hrms.example.com', fetchImpl: async () => response(Buffer.alloc(33), 'image/png'), outputPath: join(dir, 'icon.png'), maxBytes: 32 }),
    /32 bytes/,
  );
});
