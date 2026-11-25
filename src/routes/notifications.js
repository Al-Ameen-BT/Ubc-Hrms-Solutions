'use strict';
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireFeaturePermission } = require('../middleware/permissions');
const { UserNotification, NotificationBroadcast } = require('../models');
const notifications = require('../services/notifications');
const { audit } = require('../services/audit');

const router = express.Router();
const USERS = ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'DEPARTMENT_HEAD', 'EMPLOYEE'];
router.use(authenticate, requireFeaturePermission('self.profile', USERS));

router.get('/config', async (req, res) => res.json({ data: { publicKey: process.env.VAPID_PUBLIC_KEY || null, pushConfigured: notifications.configureWebPush() } }));
router.get('/', async (req, res) => {
  try { const data = await notifications.inbox(req.user, req.query.limit); res.json({ data, unread: data.filter(row => !row.readAt).length }); }
  catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
});
router.post('/subscriptions', async (req, res) => {
  try { await notifications.saveSubscription(req.user, req.body); res.status(201).json({ data: { subscribed: true } }); }
  catch (error) { res.status(error.status || 500).json({ status: 'error', message: error.message }); }
});
router.delete('/subscriptions', async (req, res) => {
  try { await notifications.disableSubscription(req.user, req.body?.endpoint); res.json({ data: { subscribed: false } }); }
  catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
});
router.post('/:id/read', async (req, res) => {
  const row = await UserNotification.findOne({ where: { id: req.params.id, userId: req.user.id, organizationId: req.user.organizationId } });
  if (!row) return res.status(404).json({ status: 'error', message: 'Notification not found.' });
  await row.update({ readAt: row.readAt || new Date() });
  res.json({ data: { id: row.id, readAt: row.readAt } });
});
router.get('/broadcast/authority', async (req, res) => res.json({ data: { allowed: await notifications.mayBroadcast(req.user) } }));
router.get('/broadcast/history', async (req, res) => {
  if (!await notifications.mayBroadcast(req.user)) return res.status(403).json({ status: 'error', message: 'Broadcast access is not assigned.' });
  const data = await NotificationBroadcast.findAll({ where: { organizationId: req.user.organizationId }, order: [['id', 'DESC']], limit: 30 });
  res.json({ data });
});
router.post('/broadcast', async (req, res) => {
  try {
    const result = await notifications.broadcast(req.user, req.body);
    await audit(req, 'notification.broadcast.send', { targetType: 'notification_broadcast', targetId: result.broadcast.id, details: { recipientCount: result.broadcast.recipientCount, deliveredCount: result.delivery.delivered, failedCount: result.delivery.failed } });
    res.status(201).json({ data: result });
  } catch (error) { res.status(error.status || 500).json({ status: 'error', message: error.message }); }
});

module.exports = router;
