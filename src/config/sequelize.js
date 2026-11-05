'use strict';

const { Sequelize } = require('sequelize');
const cfg = require('./db');
const { normalizeValues, normalizeInstance } = require('../utils/wholeRupees');

const sequelize =
  cfg.dialect === 'sqlite'
    ? new Sequelize(cfg.options)
    : new Sequelize(cfg.database, cfg.username, cfg.password, cfg.options);

// Cover model, bulk and validation-disabled writes without rewriting old rows.
sequelize.addHook('beforeValidate', normalizeInstance);
sequelize.addHook('beforeSave', normalizeInstance);
sequelize.addHook('beforeBulkCreate', instances => instances.forEach(normalizeInstance));
sequelize.addHook('beforeBulkUpdate', options => normalizeValues(options.attributes, options.model.rawAttributes));

module.exports = sequelize;
