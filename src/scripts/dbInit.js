'use strict';

/**
 * Non-destructive DB setup — safe to run against a real MySQL database.
 * Creates any tables that don't exist yet; never drops or alters existing ones
 * (unlike db:reset / dbSync.js, which is for local demo use only and drops
 * everything first).
 *
 * Run once after the app is deployed and DB_* env vars point at the real
 * database: `npm run db:init`.
 */

const { sequelize } = require('../models');
const { migrate } = require('./migrate');

(async () => {
  try {
    await sequelize.authenticate();
    console.log(`Connected (${sequelize.getDialect()}). Creating any missing tables...`);
    await sequelize.sync(); // no force, no alter — additive only
    const added = await migrate(); // adds columns a later slice introduced to an already-existing table
    console.log(added.length ? `Added columns: ${added.join(', ')}` : 'No new columns to add.');
    console.log('Done. Existing tables and data, if any, were left untouched.');
    await sequelize.close();
  } catch (err) {
    console.error('db:init failed:', err.message);
    process.exit(1);
  }
})();
