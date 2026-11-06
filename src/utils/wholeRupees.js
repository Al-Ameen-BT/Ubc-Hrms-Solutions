'use strict';

const { roundRupees } = require('./money');

function isWholeNumberField(key, attribute) {
  // Leave balances use scale 1; half-day attendance and percentages retain precision.
  return attribute.type.key === 'DECIMAL' && attribute.type.options.scale === 2 && !/Percent$|Days$/.test(key) && key !== 'odMultiplier';
}
function normalizeValues(values, attributes, changed = () => true) {
  for (const [key, attribute] of Object.entries(attributes)) {
    const value = values[key];
    if (!changed(key) || !isWholeNumberField(key, attribute) || value == null || value === '') continue;
    const number = Number(value);
    if (!['string', 'number'].includes(typeof value) || !Number.isFinite(number)) {
      const error = new Error(`${key} must be a valid whole-rupee amount.`);
      error.status = 400;
      throw error;
    }
    values[key] = roundRupees(number);
  }
}
function normalizeInstance(instance) {
  normalizeValues(instance.dataValues, instance.constructor.rawAttributes, key => instance.isNewRecord || instance.changed(key));
}
module.exports = { isWholeNumberField, normalizeValues, normalizeInstance };
