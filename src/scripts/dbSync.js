'use strict';

/**
 * DESTRUCTIVE — drops and recreates every table. Used by `npm run demo` and
 * local development only. Never run this against the Hostinger test DB or
 * any environment holding real/sample data you want to keep — use
 * `npm run db:init` (non-destructive) instead.
 *
 * Requires CONFIRM_DROP=yes to actually run, as a guard against running it
 * by muscle memory in the wrong environment.
 */

const { sequelize } = require('../models');

(async () => {
  if (process.env.NODE_ENV === 'production' && process.env.CONFIRM_DROP !== 'yes') {
    console.error(
      'Refusing to run db:reset with NODE_ENV=production. If you really mean to drop and ' +
        'recreate every table, re-run with CONFIRM_DROP=yes.'
    );
    process.exit(1);
  }
  await sequelize.sync({ force: true });
  console.log('Database synced (all tables dropped and recreated).');
  await sequelize.close();
})();
