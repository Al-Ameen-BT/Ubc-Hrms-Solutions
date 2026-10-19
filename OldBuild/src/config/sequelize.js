'use strict';

const { Sequelize } = require('sequelize');
const cfg = require('./db');

const sequelize =
  cfg.dialect === 'sqlite'
    ? new Sequelize(cfg.options)
    : new Sequelize(cfg.database, cfg.username, cfg.password, cfg.options);

module.exports = sequelize;
