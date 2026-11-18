'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'dpdp-consent-api-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { sequelize, Organization, User, Employee, PostCadre, DpdpOrganizationProfile, DpdpConsentRecord } = require('../src/models');
const { signToken } = require('../src/services/authService');
const documents = require('../src/services/dpdpDocuments');
const consent = require('../src/services/dpdpConsent');
const routes = require('../src/routes');

let server;
let base;
let token;

async function request(path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => null) };
}

before(async () => {
  await sequelize.sync({ force: true });
  const org = await Organization.create({ code: 'CONSENT_API', name: 'Consent API Bank' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'OFF', name: 'Officer' });
  const employee = await Employee.create({ organizationId: org.id, empCode: 'CA1', name: 'Consent API Employee', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 10000 });
  const user = await User.create({ organizationId: org.id, employeeId: employee.id, email: 'employee@consentapi.invalid', name: 'Consent API Employee', role: 'EMPLOYEE', passwordHash: 'x' });
  await DpdpOrganizationProfile.create({ organizationId: org.id, dpoName: 'Privacy Officer', dpoEmail: 'privacy@consentapi.invalid', dpoPhone: '0000000000', grievanceProcedure: 'Submit a grievance through the privacy centre.' });
  token = signToken(user);
  const notice = await documents.publishDocument({ ownerType: 'ORGANIZATION', organizationId: org.id, type: 'EMPLOYEE_NOTICE', version: '1', title: 'Notice', body: 'English', bodyMl: 'മലയാളം', actor: user });
  await consent.upsertPurpose({ actor: user, data: { code: 'SURVEY', titleEn: 'Voluntary survey', titleMl: 'സ്വമേധയാ സർവേ', descriptionEn: 'Optional engagement survey', descriptionMl: 'ഐച്ഛിക സർവേ', noticeDocumentId: notice.id, dataCategories: ['SURVEY_RESPONSE'], status: 'ACTIVE' } });
  const app = express(); app.use(express.json()); app.use('/api/v1', routes);
  server = await new Promise((resolve, reject) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); instance.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); await sequelize.close(); });

test('employee lists notices and can grant then withdraw an optional purpose', async () => {
  const notices = await request('/me/dpdp/notices');
  assert.equal(notices.status, 200);
  assert.equal(notices.body.data.employeeNotice.bodyMl, 'മലയാളം');

  const acknowledgement = await request('/me/dpdp/acknowledge', 'POST', { documentIds: [notices.body.data.employeeNotice.id] });
  assert.equal(acknowledgement.status, 200);
  token = acknowledgement.body.token;

  const initial = await request('/me/dpdp/consents');
  assert.equal(initial.status, 200);
  assert.equal(initial.body.data[0].decision, null);

  const grant = await request('/me/dpdp/consents/SURVEY/grant', 'POST', { language: 'ML', channel: 'MOBILE' });
  assert.equal(grant.status, 201);
  assert.equal(grant.body.data.decision, 'GRANTED');
  assert.equal((await DpdpConsentRecord.findByPk(grant.body.data.id)).channel, 'MOBILE');

  const withdraw = await request('/me/dpdp/consents/SURVEY/withdraw', 'POST', { language: 'ML' });
  assert.equal(withdraw.status, 201);
  assert.equal(withdraw.body.data.decision, 'WITHDRAWN');

  const profile = await request('/me/dpdp/profile');
  assert.equal(profile.status, 200);
  assert.deepEqual(profile.body.data, { dpoName: 'Privacy Officer', dpoEmail: 'privacy@consentapi.invalid', dpoPhone: '0000000000', dpoAddress: null, grievanceProcedure: 'Submit a grievance through the privacy centre.' });
});
