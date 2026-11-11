'use strict';

function tableLabel(table) {
  if (typeof table === 'string') return table;
  return table.schema ? `${table.schema}.${table.tableName}` : table.tableName;
}

async function assertSchemaCurrent(sequelize) {
  const queryInterface = sequelize.getQueryInterface();
  for (const model of Object.values(sequelize.models)) {
    const table = model.getTableName();
    // eslint-disable-next-line no-await-in-loop
    const columns = await queryInterface.describeTable(table);
    for (const [attributeName, attribute] of Object.entries(model.rawAttributes)) {
      if (attribute.type?.key === 'VIRTUAL') continue;
      const column = attribute.field || attributeName;
      if (!columns[column]) {
        throw new Error(`Database schema is missing required column ${tableLabel(table)}.${column}. Run the additive schema migration before serving traffic.`);
      }
    }
  }
}

module.exports = { assertSchemaCurrent };
