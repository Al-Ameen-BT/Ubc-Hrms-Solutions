'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const {
  sequelize,
  Organization,
  User,
  Employee,
  PostCadre,
} = require('../src/models');
const dpdpDocuments = require('../src/services/dpdpDocuments');
const routes = require('../src/routes');

let server;
let base;
let org;
let adminUser;
let privacyDoc;

const request = async (path) => {
  const res = await fetch(`${base}${path}`);
  return {
    status: res.status,
    headers: res.headers,
    body: await res.json().catch(() => null),
  };
};

before(async () => {
  await sequelize.sync({ force: true });
  org = await Organization.create({ code: 'PUB_ORG', name: 'Public Privacy Bank' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'OFF', name: 'Officer' });
  const emp = await Employee.create({ organizationId: org.id, empCode: 'E1', name: 'Admin', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 50000 });
  adminUser = await User.create({ organizationId: org.id, email: 'admin@public.invalid', name: 'Platform Admin', role: 'PLATFORM_ADMIN', employeeId: emp.id, passwordHash: 'dummy', mustChangePassword: false });

  privacyDoc = await dpdpDocuments.publishDocument({
    ownerType: 'PLATFORM',
    type: 'PLATFORM_PRIVACY',
    title: 'Platform Privacy Policy',
    body: 'We protect your data in compliance with the DPDP Act 2023.',
    version: '1.0',
    actor: adminUser,
  });

  const app = express();
  app.use(express.json());
  app.use('/api/v1', routes);

  server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await sequelize.close();
});

test('public endpoint /public/dpdp returns platform privacy and terms without authentication', async () => {
  const res = await request('/public/dpdp');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.platformPrivacy.title, 'Platform Privacy Policy');
  assert.equal(res.body.data.platformPrivacy.version, '1.0');
  assert.ok(res.body.data.platformPrivacy.body.includes('DPDP Act 2023'));
  // Does not expose internal or private employee data
  assert.equal(res.body.data.employees, undefined);
  assert.equal(res.body.data.users, undefined);
});

test('public privacy page renders the effectiveAt API field', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../frontend/src/features/privacy/PublicPrivacyPage.jsx'), 'utf8');
  assert.match(source, /platformPrivacy\.effectiveAt/);
  assert.match(source, /terms\.effectiveAt/);
  assert.doesNotMatch(source, /\.effectiveDate/);
});
