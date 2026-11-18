import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { api, dpdpApi } from '../src/api/client.js';

const page = fs.readFileSync(new URL('../src/features/org/DpdpCompliancePage.jsx', import.meta.url), 'utf8');

test('DPDP workspace exposes nine operational readiness views', () => {
  for (const label of ['Overview', 'Processing Register', 'Rights Cases', 'Notices & Consent', 'Vendors', 'Retention', 'Breaches', 'Sensitive Access', 'Security Evidence']) assert.match(page, new RegExp(label.replace('&', '\\&')));
  assert.match(page, /readiness/i);
  assert.doesNotMatch(page, /COMPLIANT & READY|certified compliant/i);
  assert.match(page, /Malayalam/);
  assert.match(page, /window\.confirm/);
  assert.doesNotMatch(page, /Export all|Download all/i);
});

test('DPDP client maps operational workspace endpoints', async () => {
  const oldGet = api.get; const oldPost = api.post; const paths = [];
  api.get = async path => { paths.push(['GET', path]); return {}; };
  api.post = async (path) => { paths.push(['POST', path]); return {}; };
  try {
    await dpdpApi.orgDashboard();
    await dpdpApi.orgProcessingActivities();
    await dpdpApi.orgProcessors();
    await dpdpApi.orgSharingEvents();
    await dpdpApi.orgControls();
    await dpdpApi.orgRetentionProposals();
    await dpdpApi.createRetentionProposal({});
  } finally { api.get = oldGet; api.post = oldPost; }
  assert.deepEqual(paths, [
    ['GET', '/org/dpdp/dashboard'],
    ['GET', '/org/dpdp/processing-activities'],
    ['GET', '/org/dpdp/processors'],
    ['GET', '/org/dpdp/sharing-events'],
    ['GET', '/org/dpdp/controls'],
    ['GET', '/org/dpdp/retention/proposals'],
    ['POST', '/org/dpdp/retention/proposals'],
  ]);
});
