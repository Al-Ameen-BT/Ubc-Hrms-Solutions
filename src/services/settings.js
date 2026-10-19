'use strict';

const { PlatformSetting } = require('../models');

/** Returns the single platform settings row, creating it with defaults on first use. */
async function getPlatformSettings() {
  const [row] = await PlatformSetting.findOrCreate({ where: { id: 1 }, defaults: { id: 1 } });
  return row;
}

/**
 * Base URL for links in emails. Order: platform setting, APP_BASE_URL env
 * var, then the scheme+host this request arrived on (trust proxy is set).
 */
async function appBaseUrl(req) {
  const s = await getPlatformSettings();
  const configured = (s.appBaseUrl || process.env.APP_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (req) return `${req.protocol}://${req.get('host')}`;
  return '';
}

module.exports = { getPlatformSettings, appBaseUrl };
