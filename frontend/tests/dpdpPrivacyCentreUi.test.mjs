import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const web = fs.readFileSync(new URL('../src/features/employee/PrivacyRequestsPage.jsx', import.meta.url), 'utf8');

test('web privacy centre covers data, bilingual notices, optional choices, sharing, requests and nomination', () => {
  for (const label of ['Your Data', 'Notices & Choices', 'Sharing', 'Requests & Nomination', 'English', 'Malayalam', 'Data Protection Officer']) assert.match(web, new RegExp(label.replace('&', '\\&')));
  assert.match(web, /grantConsent/);
  assert.match(web, /withdrawConsent/);
  assert.match(web, /myPrivacySummary/);
  assert.match(web, /mySharingHistory/);
  assert.match(web, /submitNomination/);
  assert.doesNotMatch(web, /localStorage|sessionStorage/);
});
