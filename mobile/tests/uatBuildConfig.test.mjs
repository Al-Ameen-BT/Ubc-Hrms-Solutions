import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';

const require = createRequire(import.meta.url);
const configure = require('../app.config.js');
const { version } = require('../package.json');

test('UAT certificate plugin is enabled only for the fixed UAT origin', () => {
  const original = process.env.EXPO_PUBLIC_API_BASE_URL;
  try {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://172.17.121.200:8443';
    const uat = configure({ config: { plugins: [] } });
    assert.deepEqual(uat.plugins, ['./plugins/withUatCertificate']);
    assert.equal(uat.version, version);
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://hrms.example.com';
    assert.deepEqual(configure({ config: { plugins: [] } }).plugins, []);
  } finally {
    if (original === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = original;
  }
});

test('bundled UAT trust anchor is a public certificate for the selected IP', () => {
  const certificate = new X509Certificate(readFileSync(new URL('../certs/uat-server.pem', import.meta.url)));
  assert.match(certificate.subjectAltName, /IP Address:172\.17\.121\.200/);
  assert.equal(certificate.fingerprint256, '49:B0:22:64:9D:58:9D:06:46:50:EE:A1:04:2E:8B:06:55:37:1D:26:26:64:C0:2F:7B:2F:25:0A:16:88:E8:52');
});
