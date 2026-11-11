'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'branding-settings-test-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { sequelize, Organization, User } = require('../src/models');
const { signToken } = require('../src/services/authService');
const routes = require('../src/routes');

let server, base, orgToken, employeeToken, platformToken;
const image = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, '../public/favicon.png')).toString('base64')}`;
async function call(method, route, token, body) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  await sequelize.sync();
  const org = await Organization.create({ code: 'BRAND', name: 'Brand Bank', customDomain: 'hrms.brand.invalid' });
  orgToken = signToken(await User.create({ organizationId: org.id, email: 'admin@brand.invalid', name: 'Admin', role: 'ORG_ADMIN', passwordHash: 'unused' }));
  employeeToken = signToken(await User.create({ organizationId: org.id, email: 'employee@brand.invalid', name: 'Employee', role: 'EMPLOYEE', passwordHash: 'unused' }));
  platformToken = signToken(await User.create({ email: 'platform@brand.invalid', name: 'Platform', role: 'SUPER_ADMIN', passwordHash: 'unused' }));
  const app = express(); app.use(express.json({ limit: '2mb' })); app.use('/api/v1', routes);
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await sequelize.close(); });

test('org admin uploads separate banner and icon; public branding uses icon as favicon', async () => {
  assert.equal((await call('PUT', '/org/settings/favicon', employeeToken, { dataUrl: image })).status, 403);
  assert.equal((await call('PUT', '/org/settings/favicon', orgToken, { dataUrl: image })).status, 200);
  assert.equal((await call('PUT', '/org/settings/logo', orgToken, { dataUrl: image })).status, 200);
  const settings = await call('GET', '/org/settings', orgToken);
  assert.ok(settings.body.data.logo?.version);
  assert.ok(settings.body.data.favicon?.version);
  const branding = await call('GET', '/public/org/BRAND', null);
  assert.match(branding.body.data.faviconUrl, /\/assets\/org\/BRAND\/favicon\?v=/);
  assert.match(branding.body.data.logoUrl, /\/assets\/org\/BRAND\/logo\?v=/);
  assert.equal((await call('DELETE', '/org/settings/favicon', orgToken)).status, 200);
  assert.equal((await call('GET', '/org/settings', orgToken)).body.data.favicon, null);
});

test('platform admin can upload separate banner and icon; organisation user cannot', async () => {
  assert.equal((await call('PUT', '/admin/settings/favicon', orgToken, { dataUrl: image })).status, 403);
  assert.equal((await call('PUT', '/admin/settings/logo', platformToken, { dataUrl: image })).status, 200);
  assert.equal((await call('PUT', '/admin/settings/favicon', platformToken, { dataUrl: image })).status, 200);
  const settings = await call('GET', '/admin/settings', platformToken);
  assert.ok(settings.body.data.logo?.version);
  assert.ok(settings.body.data.favicon?.version);
});
