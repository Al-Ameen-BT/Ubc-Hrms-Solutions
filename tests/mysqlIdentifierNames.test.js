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

test('organisation access indexes have explicit short unique names', () => {
  const names = new Set();
  for (const modelName of [
    'OrganizationBranch', 'OrganizationDepartment', 'OrganizationPosition',
    'EmployeeOrganizationAssignment', 'OrganizationResponsibilityAssignment', 'OrganizationRole',
    'OrganizationRolePermission', 'UserRoleAssignment', 'UserRoleBranch', 'UserRoleDepartment',
  ]) {
    const model = sequelize.models[modelName];
    assert.ok(model, `${modelName} exists`);
    assert.ok(model.options.indexes.length, `${modelName} has indexes`);
    for (const index of model.options.indexes) {
      assert.ok(index.name, `${modelName} index has an explicit name`);
      assert.ok(index.name.length < 64, index.name);
      assert.ok(!names.has(index.name), `${index.name} is unique`);
      names.add(index.name);
    }
  }
});
