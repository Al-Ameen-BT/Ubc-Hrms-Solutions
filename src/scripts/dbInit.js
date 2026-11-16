'use strict';

/**
 * Non-destructive DB setup — safe to run against a real MySQL database.
 * Creates missing tables, adds migration columns, and prepares access records;
 * never drops tables or rewrites approved business history
 * (unlike db:reset / dbSync.js, which is for local demo use only and drops
 * everything first).
 *
 * Run once after the app is deployed and DB_* env vars point at the real
 * database: `npm run db:init`.
 */

const { sequelize, Organization } = require('../models');
const { migrate } = require('./migrate');

(async () => {
  try {
    await sequelize.authenticate();
    console.log(`Connected (${sequelize.getDialect()}). Creating any missing tables...`);
    await sequelize.sync(); // no force, no alter — additive only
    const added = await migrate(); // adds columns a later slice introduced to an already-existing table
    console.log(added.length ? `Added columns: ${added.join(', ')}` : 'No new columns to add.');
    const { bootstrapOrganizationAccess } = require('../services/accessBootstrap');
    const organizations = await Organization.findAll({ where: { accessControlMode: 'LEGACY' }, attributes: ['id'] });
    const counts = { organizations: organizations.length, rolesCreated: 0, permissionsCreated: 0, assignmentsCreated: 0, mappedEmployees: 0, unresolvedEmployees: 0, unresolvedUsers: 0 };
    for (const organization of organizations) {
      const result = await bootstrapOrganizationAccess({ organizationId: organization.id });
      for (const key of Object.keys(counts).filter(key => key !== 'organizations')) counts[key] += Array.isArray(result[key]) ? result[key].length : result[key];
    }
    console.log('Organisation access bootstrap:', JSON.stringify(counts));
    console.log('Done. Existing records preserved; organisation access remains in its current mode.');
    await sequelize.close();
  } catch (err) {
    console.error('db:init failed:', err.message);
    process.exit(1);
  }
})();
