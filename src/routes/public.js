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
const orgDomains = require('../services/orgDomains');

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
    logoUrl: logo ? `/assets/platform/logo?v=${logo.version}` : '/alert.png',
    faviconUrl: favicon ? `/assets/platform/favicon?v=${favicon.version}` : '/favicon.png',
  };
}

async function findOrgByCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(c)) return null;
  return Organization.findOne({ where: sqlWhere(fn('upper', col('code')), c) });
}

/** The public "card" for one organisation — name + logo + favicon, plus platform branding. */
async function orgBranding(org) {
  const [logo, favicon] = await Promise.all([
    brand.info(org.id, 'LOGO'),
    brand.info(org.id, 'FAVICON'),
  ]);
  const logoUrl = logo ? `/assets/org/${encodeURIComponent(org.code)}/logo?v=${logo.version}` : null;
  const faviconUrl = favicon
    ? `/assets/org/${encodeURIComponent(org.code)}/favicon?v=${favicon.version}`
    : (logoUrl || '/favicon.png');

  return {
    code: org.code,
    name: org.name,
    shortName: org.shortName,
    logoUrl,
    faviconUrl,
    platform: await platformBranding(),
  };
}

// Branding for the surface the current request is on: if the Host header (or
// an `?org=` hint, for a dev proxy that forwards everything to one host) maps
// to a tenant's custom domain, that bank's card is returned; otherwise the
// platform's own. This is what lets https://hrms.theirbank.in/ render the
// bank's login without the /o/<CODE> path.
router.get('/branding', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-cache');
    const hint = req.query && req.query.org;
    const org = (await orgDomains.findOrgByDomain(req.get('host')))
      || (hint ? await findOrgByCode(hint) : null);
    res.json({ data: org ? await orgBranding(org) : await platformBranding() });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.get('/org/:code', async (req, res) => {
  try {
    const org = await findOrgByCode(req.params.code);
    if (!org) return res.status(404).json({ status: 'error', message: 'No organisation with that code.' });
    res.set('Cache-Control', 'no-cache');
    res.json({ data: await orgBranding(org) });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
module.exports.findOrgByCode = findOrgByCode;
