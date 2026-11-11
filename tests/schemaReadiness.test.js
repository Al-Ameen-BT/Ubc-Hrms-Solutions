'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const schemaReadiness = require('../src/services/schemaReadiness');

test('schema readiness rejects a model column missing from the database', async () => {
  assert.equal(typeof schemaReadiness.assertSchemaCurrent, 'function');
  const fakeSequelize = {
    models: {
      Organization: {
        getTableName: () => 'organization',
        rawAttributes: {
          id: { field: 'id' },
          requiresCatalogueAdoption: { field: 'requires_catalogue_adoption' },
        },
      },
    },
    getQueryInterface: () => ({
      describeTable: async () => ({ id: { type: 'INTEGER' } }),
    }),
  };

  await assert.rejects(
    schemaReadiness.assertSchemaCurrent(fakeSequelize),
    /organization\.requires_catalogue_adoption/,
  );
});

test('schema readiness accepts model columns present in the database', async () => {
  assert.equal(typeof schemaReadiness.assertSchemaCurrent, 'function');
  const fakeSequelize = {
    models: {
      Organization: {
        getTableName: () => 'organization',
        rawAttributes: {
          id: { field: 'id' },
          requiresCatalogueAdoption: { field: 'requires_catalogue_adoption' },
        },
      },
    },
    getQueryInterface: () => ({
      describeTable: async () => ({
        id: { type: 'INTEGER' },
        requires_catalogue_adoption: { type: 'TINYINT' },
      }),
    }),
  };

  await schemaReadiness.assertSchemaCurrent(fakeSequelize);
});
