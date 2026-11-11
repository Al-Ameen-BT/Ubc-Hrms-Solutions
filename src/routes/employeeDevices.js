'use strict';

const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Op } = require('sequelize');
const { sequelize, User, Employee, Organization, EmployeeDeviceLink, EmployeeMobileDevice } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { verifyPassword, signDeviceAccessToken, signDeviceRefreshToken, verifyDeviceRefreshToken } = require('../services/authService');
const { checkOrgAccess } = require('../services/orgAccess');
const secretBox = require('../services/secretBox');
const brand = require('../services/brandAssets');
const { audit } = require('../services/audit');

const employee = express.Router();
const mobile = express.Router();
const LINK_MS = 2 * 60 * 1000;
const INACTIVE_MS = 30 * 24 * 60 * 60 * 1000;
const error = (res, status, code, message) => res.status(status).json({ status: 'error', code, message });
const fail = (res, err) => res.status(500).json({ status: 'error', message: err.message });
const random = () => crypto.randomBytes(32).toString('base64url');
const validSecret = value => typeof value === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value);
const idOf = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

async function eligibleUser(id) {
  const user = await User.findByPk(id, { include: [{ model: Organization }] });
  if (!user || user.role !== 'EMPLOYEE' || user.status !== 'ACTIVE' || user.mustChangePassword || !user.employeeId || !user.Organization || !checkOrgAccess(user.Organization).ok) return null;
  if (await User.count({ where: { employeeId: user.employeeId, organizationId: user.organizationId, status: 'ACTIVE' } }) !== 1) return null;
  const employeeRow = await Employee.findOne({ where: { id: user.employeeId, organizationId: user.organizationId, status: 'ACTIVE' } });
  return employeeRow ? user : null;
}

async function mobileUser(user) {
  const logo = await brand.info(user.organizationId, 'LOGO');
  return { id: user.id, name: user.name, email: user.email, role: user.role, employeeId: user.employeeId, organizationName: user.Organization.name, mustChangePassword: false,
    organization: { code: user.Organization.code, name: user.Organization.name, logoUrl: logo ? `/assets/org/${encodeURIComponent(user.Organization.code)}/logo?v=${logo.version}` : null } };
}

employee.use(authenticate, requireRole('EMPLOYEE'));
employee.use(async (req, res, next) => {
  try {
    if (req.user.deviceId) return error(res, 403, 'PORTAL_REQUIRED', 'Manage linked devices from your web portal.');
    req.deviceUser = await eligibleUser(req.user.id);
    if (!req.deviceUser) return error(res, 409, 'EMPLOYEE_NOT_LINKED', 'An active, unique employee account is required.');
    next();
  } catch (err) { fail(res, err); }
});

employee.get('/', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const rows = await EmployeeMobileDevice.findAll({ where: { userId: req.user.id, organizationId: req.user.organizationId, revokedAt: null }, attributes: ['id', 'name', 'platform', 'lastUsedAt', 'createdAt'], order: [['createdAt', 'DESC']] });
    res.json({ data: { rows } });
  } catch (err) { fail(res, err); }
});

employee.post('/link', async (req, res) => {
  try {
    const user = req.deviceUser;
    if (!req.body?.currentPassword || !(await verifyPassword(req.body.currentPassword, user.passwordHash))) return error(res, 401, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect.');
    const challenge = random();
    const link = await sequelize.transaction(async transaction => {
      await User.findByPk(user.id, { transaction, lock: transaction.LOCK.UPDATE });
      await EmployeeDeviceLink.update({ status: 'CANCELLED' }, { where: { userId: user.id, status: ['PENDING', 'CLAIMED', 'APPROVED'] }, transaction });
      return EmployeeDeviceLink.create({ userId: user.id, organizationId: user.organizationId, challengeHash: secretBox.sha256(challenge), expiresAt: new Date(Date.now() + LINK_MS) }, { transaction });
    });
    const qrData = `ucbhrms-link://${challenge}`;
    await audit(req, 'employee_device.link.create', { targetType: 'employee_device_link', targetId: link.id });
    res.set('Cache-Control', 'no-store');
    res.status(201).json({ data: { id: link.id, qrData, qrCodeDataUrl: await QRCode.toDataURL(qrData, { width: 240, margin: 1 }), expiresAt: link.expiresAt } });
  } catch (err) { fail(res, err); }
});

employee.get('/link/:id', async (req, res) => {
  try {
    const link = await EmployeeDeviceLink.findOne({ where: { id: idOf(req.params.id), userId: req.user.id, organizationId: req.user.organizationId } });
    if (!link) return error(res, 404, 'LINK_NOT_FOUND', 'Link not found.');
    res.set('Cache-Control', 'no-store');
    res.json({ data: { id: link.id, status: link.status !== 'ISSUED' && link.expiresAt <= new Date() ? 'EXPIRED' : link.status, deviceName: link.deviceName, platform: link.platform, expiresAt: link.expiresAt } });
  } catch (err) { fail(res, err); }
});

for (const decision of ['approve', 'deny', 'cancel']) {
  employee.post(`/link/:id/${decision}`, async (req, res) => {
    try {
      let completionExpiry;
      if (decision === 'approve') {
        const link = await EmployeeDeviceLink.findOne({ where: { id: idOf(req.params.id), userId: req.user.id, organizationId: req.user.organizationId, status: 'CLAIMED', expiresAt: { [Op.gt]: new Date() } } });
        if (link) {
          const supplied = req.body?.verificationCode;
          if (typeof supplied !== 'string' || !/^\d{6}$/.test(supplied) || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(link.verificationCode))) return error(res, 400, 'CODE_INVALID', 'Enter the six-digit code shown on your phone.');
          completionExpiry = new Date(link.expiresAt.getTime() + 60 * 1000);
        }
      }
      const nextStatus = { approve: 'APPROVED', deny: 'DENIED', cancel: 'CANCELLED' }[decision];
      const allowed = decision === 'cancel' ? ['PENDING', 'CLAIMED'] : ['CLAIMED'];
      const [changed] = await EmployeeDeviceLink.update({ status: nextStatus, ...(completionExpiry ? { expiresAt: completionExpiry } : {}) }, { where: { id: idOf(req.params.id), userId: req.user.id, organizationId: req.user.organizationId, status: allowed, expiresAt: { [Op.gt]: new Date() } } });
      if (!changed) {
        const owned = await EmployeeDeviceLink.findOne({ where: { id: idOf(req.params.id), userId: req.user.id } });
        return error(res, owned ? 409 : 404, owned ? 'LINK_UNAVAILABLE' : 'LINK_NOT_FOUND', owned ? 'This link is no longer available.' : 'Link not found.');
      }
      await audit(req, `employee_device.link.${decision}`, { targetType: 'employee_device_link', targetId: idOf(req.params.id) });
      res.set('Cache-Control', 'no-store');
      res.json({ data: { status: nextStatus } });
    } catch (err) { fail(res, err); }
  });
}

employee.post('/:id/revoke', async (req, res) => {
  try {
    const [changed] = await EmployeeMobileDevice.update({ revokedAt: new Date() }, { where: { id: idOf(req.params.id), userId: req.user.id, organizationId: req.user.organizationId, revokedAt: null } });
    if (!changed) return error(res, 404, 'DEVICE_NOT_FOUND', 'Active device not found.');
    await audit(req, 'employee_device.revoke', { targetType: 'employee_mobile_device', targetId: idOf(req.params.id) });
    res.json({ data: { revoked: true } });
  } catch (err) { fail(res, err); }
});

mobile.post('/link/claim', async (req, res) => {
  try {
    const { challenge, claimSecret, platform, deviceName } = req.body || {};
    if (!validSecret(challenge) || !validSecret(claimSecret) || !['android', 'ios'].includes(platform) || typeof deviceName !== 'string' || !deviceName.trim() || deviceName.length > 80) return error(res, 400, 'LINK_INVALID', 'Invalid link request.');
    const link = await EmployeeDeviceLink.findOne({ where: { challengeHash: secretBox.sha256(challenge), expiresAt: { [Op.gt]: new Date() } } });
    if (!link) return error(res, 400, 'LINK_INVALID', 'This QR code has expired or is invalid.');
    if (link.status !== 'PENDING') return error(res, 409, 'LINK_UNAVAILABLE', 'This QR code has already been scanned. Start again.');
    const user = await eligibleUser(link.userId);
    if (!user || user.organizationId !== link.organizationId) return error(res, 400, 'LINK_INVALID', 'This QR code has expired or is invalid.');
    const verificationCode = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const [changed] = await EmployeeDeviceLink.update({ status: 'CLAIMED', claimHash: secretBox.sha256(claimSecret), platform, deviceName: deviceName.trim(), verificationCode }, { where: { id: link.id, status: 'PENDING', expiresAt: { [Op.gt]: new Date() } } });
    if (!changed) return error(res, 409, 'LINK_UNAVAILABLE', 'This QR code has already been scanned. Start again.');
    await audit(req, 'employee_device.link.claim', { actor: { id: user.id }, organizationId: user.organizationId, targetType: 'employee_device_link', targetId: link.id });
    res.set('Cache-Control', 'no-store');
    res.json({ data: { linkId: link.id, verificationCode, organizationName: user.Organization.name, expiresAt: link.expiresAt } });
  } catch (err) { fail(res, err); }
});

mobile.post('/link/status', async (req, res) => {
  try {
    const id = idOf(req.body?.linkId), claimSecret = req.body?.claimSecret;
    if (!id || !validSecret(claimSecret)) return error(res, 400, 'LINK_INVALID', 'Invalid link request.');
    const link = await EmployeeDeviceLink.findOne({ where: { id, claimHash: secretBox.sha256(claimSecret) } });
    if (!link) return error(res, 404, 'LINK_NOT_FOUND', 'Link not found.');
    if (link.expiresAt <= new Date() || ['DENIED', 'CANCELLED', 'ISSUED'].includes(link.status)) return error(res, 409, 'LINK_UNAVAILABLE', 'This link is no longer available.');
    if (link.status !== 'APPROVED') return res.json({ data: { status: link.status } });
    const user = await eligibleUser(link.userId);
    if (!user || user.organizationId !== link.organizationId) return error(res, 409, 'LINK_UNAVAILABLE', 'This account is no longer available.');
    let tokens;
    await sequelize.transaction(async transaction => {
      const [changed] = await EmployeeDeviceLink.update({ status: 'ISSUED' }, { where: { id: link.id, status: 'APPROVED', expiresAt: { [Op.gt]: new Date() } }, transaction });
      if (!changed) return;
      const device = await EmployeeMobileDevice.create({ userId: user.id, organizationId: user.organizationId, name: link.deviceName, platform: link.platform, refreshHash: '0'.repeat(64), rotation: 0, lastUsedAt: new Date() }, { transaction });
      const refreshToken = signDeviceRefreshToken(user, device.id, 0);
      await device.update({ refreshHash: secretBox.sha256(refreshToken) }, { transaction });
      await link.update({ deviceId: device.id }, { transaction });
      tokens = { accessToken: signDeviceAccessToken(user, device.id), refreshToken, user: await mobileUser(user) };
    });
    if (!tokens) return error(res, 409, 'LINK_UNAVAILABLE', 'This link is no longer available.');
    await audit(req, 'employee_device.link.issued', { actor: { id: user.id }, organizationId: user.organizationId, targetType: 'employee_mobile_device', targetId: link.deviceId });
    res.set('Cache-Control', 'no-store');
    res.json({ data: tokens });
  } catch (err) { fail(res, err); }
});

mobile.post('/session/refresh', async (req, res) => {
  try {
    let payload;
    try { payload = verifyDeviceRefreshToken(req.body?.refreshToken); } catch { return error(res, 401, 'DEVICE_SESSION_INVALID', 'Link this device again from your portal.'); }
    const device = await EmployeeMobileDevice.findOne({ where: { id: payload.deviceId, userId: payload.sub, revokedAt: null } });
    if (!device) return error(res, 401, 'DEVICE_REVOKED', 'This device is no longer linked.');
    const user = await eligibleUser(device.userId);
    if (!user || user.organizationId !== device.organizationId || Date.now() - new Date(device.lastUsedAt).getTime() > INACTIVE_MS) {
      await device.update({ revokedAt: new Date() });
      return error(res, 401, 'DEVICE_REVOKED', 'This device is no longer linked.');
    }
    if (payload.rotation !== device.rotation || secretBox.sha256(req.body.refreshToken) !== device.refreshHash) {
      await device.update({ revokedAt: new Date() });
      await audit(req, 'employee_device.refresh.reuse', { actor: { id: user.id }, organizationId: user.organizationId, targetType: 'employee_mobile_device', targetId: device.id });
      return error(res, 401, 'DEVICE_REVOKED', 'This device is no longer linked.');
    }
    const refreshToken = signDeviceRefreshToken(user, device.id, device.rotation + 1);
    const [changed] = await EmployeeMobileDevice.update({ refreshHash: secretBox.sha256(refreshToken), rotation: device.rotation + 1, lastUsedAt: new Date() }, { where: { id: device.id, refreshHash: device.refreshHash, rotation: device.rotation, revokedAt: null } });
    if (!changed) {
      await EmployeeMobileDevice.update({ revokedAt: new Date() }, { where: { id: device.id } });
      return error(res, 401, 'DEVICE_REVOKED', 'This device is no longer linked.');
    }
    res.set('Cache-Control', 'no-store');
    res.json({ data: { accessToken: signDeviceAccessToken(user, device.id), refreshToken, user: await mobileUser(user) } });
  } catch (err) { fail(res, err); }
});

mobile.post('/session/revoke', async (req, res) => {
  try {
    let payload;
    try { payload = verifyDeviceRefreshToken(req.body?.refreshToken); } catch { return error(res, 401, 'DEVICE_SESSION_INVALID', 'Invalid device session.'); }
    await EmployeeMobileDevice.update({ revokedAt: new Date() }, { where: { id: payload.deviceId, userId: payload.sub, revokedAt: null } });
    res.json({ data: { revoked: true } });
  } catch (err) { fail(res, err); }
});

module.exports = { employee, mobile };
