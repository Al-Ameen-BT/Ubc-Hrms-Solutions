'use strict';

/**
 * DB connection config.
 *
 * Production target: MySQL (own Linux MySQL server).
 * Local dev/demo: set DB_DIALECT=sqlite in .env for a zero-setup run (used by `npm run demo`
 * when no .env is present at all).
 */

require('dotenv').config();
const path = require('path');

const dialect = process.env.DB_DIALECT || 'sqlite';

const baseOptions = {
  dialect,
  logging: false,
  define: {
    underscored: true,
    timestamps: true,
  },
};

let sequelizeOptions;

if (dialect === 'sqlite') {
  sequelizeOptions = {
    ...baseOptions,
    storage: process.env.DB_STORAGE || path.join(__dirname, '..', '..', 'dev.sqlite'),
  };
} else {
  sequelizeOptions = {
    ...baseOptions,
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
  };
}

module.exports = {
  dialect,
  database: process.env.DB_NAME || 'ucb_hrms',
  username: process.env.DB_USER || 'ucb_hrms_user',
  password: process.env.DB_PASSWORD || '',
  options: sequelizeOptions,
};
