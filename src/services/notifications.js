'use strict';

const crypto = require('crypto');
const webpush = require('web-push');
const { Op } = require('sequelize');
const {
  sequelize, User, NotificationBroadcast, UserNotification, PushSubscription,
  OrganizationResponsibilityAssignment,
} = require('../models');
const { todayIST } = require('./orgAccess');

const clean = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const endpointHash = endpoint => crypto.createHash('sha256').update(endpoint).digest('hex');

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:notifications@localhost.invalid', publicKey, privateKey);
  return true;
}

async function mayBroadcast(user) {
  if (user.role === 'ORG_ADMIN') return true;
  const today = todayIST();
  return Boolean(await OrganizationResponsibilityAssignment.findOne({ where: {
    organizationId: user.organizationId,
    userId: user.id,
    status: 'ACTIVE',
    responsibility: { [Op.in]: ['SENIOR_MANAGER', 'GENERAL_MANAGER'] },
    effectiveFrom: { [Op.lte]: today },
    [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: today } }],
  } }));
}

async function saveSubscription(user, subscription) {
  const endpoint = clean(subscription?.endpoint, 4000);
  const p256dh = clean(subscription?.keys?.p256dh, 255);
  const auth = clean(subscription?.keys?.auth, 255);
  if (!endpoint.startsWith('https://') || !p256dh || !auth) throw Object.assign(new Error('A valid browser push subscription is required.'), { status: 400 });
  const hash = endpointHash(endpoint);
  const [row] = await PushSubscription.findOrCreate({ where: { endpointHash: hash }, defaults: { organizationId: user.organizationId, userId: user.id, endpoint, endpointHash: hash, p256dh, auth } });
  if (row.userId !== user.id || row.organizationId !== user.organizationId) throw Object.assign(new Error('This browser subscription belongs to another account.'), { status: 409 });
  await row.update({ endpoint, p256dh, auth, status: 'ACTIVE', failureCount: 0 });
  return row;
}

async function disableSubscription(user, endpoint) {
  return PushSubscription.update({ status: 'INACTIVE' }, { where: { userId: user.id, organizationId: user.organizationId, endpointHash: endpointHash(clean(endpoint, 4000)) } });
}

async function deliverPush(broadcast) {
  if (!configureWebPush()) return { delivered: 0, failed: 0, configured: false };
  const subscriptions = await PushSubscription.findAll({ where: { organizationId: broadcast.organizationId, status: 'ACTIVE' } });
  let delivered = 0;
  let failed = 0;
  await Promise.all(subscriptions.map(async row => {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify({ title: broadcast.title, body: broadcast.message, url: '/#/notifications', broadcastId: broadcast.id }), { TTL: 86400, urgency: 'normal' });
      delivered += 1;
      await row.update({ lastDeliveredAt: new Date(), failureCount: 0 });
    } catch (error) {
      failed += 1;
      const expired = [404, 410].includes(error.statusCode);
      await row.update({ failureCount: row.failureCount + 1, ...(expired ? { status: 'INACTIVE' } : {}) });
    }
  }));
  await broadcast.update({ deliveredCount: delivered, failedCount: failed });
  return { delivered, failed, configured: true };
}

async function broadcast(user, input) {
  if (!await mayBroadcast(user)) throw Object.assign(new Error('Only Organisation Admins and assigned Senior or General Managers can broadcast messages.'), { status: 403 });
  const title = clean(input?.title, 120);
  const message = clean(input?.message, 500);
  if (title.length < 3 || message.length < 5) throw Object.assign(new Error('Enter a title and message before sending.'), { status: 400 });
  const recipients = await User.findAll({ where: { organizationId: user.organizationId, status: 'ACTIVE' }, attributes: ['id'] });
  const row = await sequelize.transaction(async transaction => {
    const created = await NotificationBroadcast.create({ organizationId: user.organizationId, senderUserId: user.id, title, message, recipientCount: recipients.length }, { transaction });
    if (recipients.length) await UserNotification.bulkCreate(recipients.map(recipient => ({ organizationId: user.organizationId, userId: recipient.id, broadcastId: created.id })), { transaction });
    return created;
  });
  const delivery = await deliverPush(row);
  return { broadcast: row, delivery };
}

async function inbox(user, limit = 30) {
  const rows = await UserNotification.findAll({
    where: { userId: user.id, organizationId: user.organizationId },
    include: [{ model: NotificationBroadcast, required: true, include: [{ model: User, as: 'Sender', attributes: ['id', 'name'] }] }],
    order: [['id', 'DESC']], limit: Math.min(Math.max(Number(limit) || 30, 1), 100),
  });
  return rows.map(row => ({ id: row.id, readAt: row.readAt, createdAt: row.createdAt, title: row.NotificationBroadcast.title, message: row.NotificationBroadcast.message, sender: row.NotificationBroadcast.Sender?.name || 'Organisation', broadcastId: row.broadcastId }));
}

module.exports = { configureWebPush, mayBroadcast, saveSubscription, disableSubscription, broadcast, inbox };
