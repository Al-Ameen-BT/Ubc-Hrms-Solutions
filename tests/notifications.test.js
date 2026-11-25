'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const webpush = require('web-push');
const models = require('../src/models');
const notifications = require('../src/services/notifications');

test('broadcasts are tenant-isolated, persisted, and restricted to top authorities', async () => {
  await models.sequelize.sync();
  const suffix = `${process.pid}${Date.now()}`.slice(-12);
  const organization = await models.Organization.create({ code: `N${suffix}`, name: 'Notice Bank' });
  const otherOrganization = await models.Organization.create({ code: `O${suffix}`, name: 'Other Bank' });
  const admin = await models.User.create({ organizationId: organization.id, role: 'ORG_ADMIN', name: 'Admin', email: `admin-${suffix}@notice.invalid`, passwordHash: 'x' });
  const employee = await models.User.create({ organizationId: organization.id, role: 'EMPLOYEE', name: 'Employee', email: `employee-${suffix}@notice.invalid`, passwordHash: 'x' });
  await models.User.create({ organizationId: otherOrganization.id, role: 'EMPLOYEE', name: 'Other', email: `other-${suffix}@notice.invalid`, passwordHash: 'x' });

  await assert.rejects(() => notifications.broadcast(employee, { title: 'Test', message: 'Not allowed' }), /Only Organisation Admins/);
  const keys = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  await notifications.saveSubscription(employee, { endpoint: `https://push.example.invalid/${suffix}`, keys: { p256dh: 'employee-public-key', auth: 'employee-auth-key' } });
  const originalSend = webpush.sendNotification;
  webpush.sendNotification = async () => ({ statusCode: 201 });
  let result;
  try { result = await notifications.broadcast(admin, { title: 'Branch meeting', message: 'Please join the meeting at 3:00 PM.' }); }
  finally { webpush.sendNotification = originalSend; }
  assert.equal(result.broadcast.recipientCount, 2);
  assert.equal(result.delivery.delivered, 1);
  assert.equal(await models.UserNotification.count({ where: { broadcastId: result.broadcast.id } }), 2);
  assert.equal((await notifications.inbox(employee))[0].title, 'Branch meeting');
  assert.equal((await notifications.inbox(await models.User.findOne({ where: { organizationId: otherOrganization.id } }))).length, 0);
});
