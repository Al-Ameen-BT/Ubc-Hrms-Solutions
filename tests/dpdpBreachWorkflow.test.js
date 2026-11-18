'use strict';
process.env.DB_DIALECT = 'sqlite'; process.env.DB_STORAGE = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sequelize, Organization, User } = require('../src/models');
const cases = require('../src/services/dpdpCases');
let org; let actor;
before(async () => { await sequelize.sync({ force: true }); org = await Organization.create({ code: 'BREACH', name: 'Breach Bank' }); actor = await User.create({ organizationId: org.id, email: 'dpo@breach.invalid', name: 'DPO', role: 'ORG_ADMIN', passwordHash: 'x' }); });
after(async () => sequelize.close());

test('breach deadline is 72 hours from awareness and closure requires evidence', async () => {
  const incident = await cases.createIncident({ actor, title: 'Payroll export exposed', severity: 'HIGH', discoveredAt: '2026-11-17T08:00:00Z', awareAt: '2026-11-18T10:00:00Z' });
  assert.equal(incident.boardDetailedDueAt.toISOString(), '2026-11-21T10:00:00.000Z');
  await assert.rejects(cases.updateIncident({ actor, incidentId: incident.id, status: 'CLOSED' }), /root cause.*corrective.*notification/i);
  await cases.updateIncident({ actor, incidentId: incident.id, status: 'CONTAINED', rootCause: 'Mis-scoped export', correctiveActions: 'Scope validation added', affectedPrincipalNotificationStatus: 'NOT_REQUIRED', boardNotificationStatus: 'NOT_REQUIRED' });
  const closed = await cases.updateIncident({ actor, incidentId: incident.id, status: 'CLOSED' });
  assert.equal(closed.status, 'CLOSED');
});
