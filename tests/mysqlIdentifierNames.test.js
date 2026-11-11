'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { nameIndex } = require('sequelize/lib/utils');
const { sequelize } = require('../src/models');

after(async () => { await sequelize.close(); });

test('model index names fit the MySQL identifier limit', () => {
  const tooLong = [];
  for (const model of Object.values(sequelize.models)) {
    for (const configured of model.options.indexes || []) {
      const index = nameIndex({ ...configured, fields: [...configured.fields] }, model.getTableName());
      if (index.name.length > 64) tooLong.push(`${index.name} (${index.name.length})`);
    }
  }
  assert.deepEqual(tooLong, []);
});
