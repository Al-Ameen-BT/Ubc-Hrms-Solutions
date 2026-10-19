'use strict';

/**
 * Unauthenticated endpoints the sign-in pages need — branding only. Nothing
 * here reveals users, licence dates, or anything a bank would consider
 * private: an organisation's public card is its name and logo, which are on
 * its own login page anyway.
 */

const express = require('express');
const { fn, col, where: sqlWhere } = require('sequelize');
const { Organization } = require('../models');
const brand = require('../services/brandAssets');
const { getPlatformSettings } = require('../services/settings');

const router = express.Router();

async function platformBranding() {
  const s = await getPlatformSettings();
  const [logo, favicon] = await Promise.all([brand.info(null, 'LOGO'), brand.info(null, 'FAVICON')]);
  return {
    platformName: s.platformName,
    companyName: s.companyName,
    supportEmail: s.supportEmail,
    supportPhone: s.supportPhone,
    loginMessage: s.loginMessage,
    logoUrl: logo ? `/assets/platform/logo?v=${logo.version}` : null,
    faviconUrl: favicon ? `/assets/platform/favicon?v=${favicon.version}` : '/favicon.svg',
  };
}

async function findOrgByCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(c)) return null;
  return Organization.findOne({ where: sqlWhere(fn('upper', col('code')), c) });
}

router.get('/branding', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-cache');
    res.json({ data: await platformBranding() });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.get('/org/:code', async (req, res) => {
  try {
    const org = await findOrgByCode(req.params.code);
    if (!org) return res.status(404).json({ status: 'error', message: 'No organisation with that code.' });
    const logo = await brand.info(org.id, 'LOGO');
    res.set('Cache-Control', 'no-cache');
    res.json({
      data: {
        code: org.code,
        name: org.name,
        shortName: org.shortName,
        logoUrl: logo ? `/assets/org/${encodeURIComponent(org.code)}/logo?v=${logo.version}` : null,
        platform: await platformBranding(),
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
module.exports.findOrgByCode = findOrgByCode;
