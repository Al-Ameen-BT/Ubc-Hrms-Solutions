'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('history-preserving lifecycle endpoints are exposed through guarded organisation routes', () => {
  const structure = read('src/routes/orgStructure.js');
  const users = read('src/routes/orgUsers.js');
  const serviceBook = read('src/routes/serviceBook.js');
  assert.match(structure, /departments\/:id\/archive/);
  assert.match(structure, /branches\/merge\/preview/);
  assert.match(structure, /branches\/merge\/apply/);
  assert.match(structure, /branches\/:id\/retire/);
  assert.match(users, /archiveUser/);
  assert.doesNotMatch(users, /hardDelete/);
  assert.match(serviceBook, /archiveEmployee/);
});

test('structure lifecycle confirmations use clear cancel and confirm actions without typed verification', () => {
  const page = read('frontend/src/features/org/OrganisationStructurePage.jsx');
  const api = read('frontend/src/api/organizationAccess.js');
  assert.match(api, /previewBranchMerge/);
  assert.match(api, /applyBranchMerge/);
  assert.match(api, /archiveDepartment/);
  assert.match(page, /Merge branch/);
  assert.match(page, /requireVerification=\{false\}/);
});

test('payroll blocks employees parked in the standalone holding branch', () => {
  const engine = read('src/services/payrollEngine.js');
  assert.match(engine, /__STANDALONE__/);
  assert.match(engine, /resolve.*branch.*assignment.*before.*payroll/i);
});
