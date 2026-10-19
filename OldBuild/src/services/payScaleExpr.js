'use strict';

/**
 * Parses a KSR-style pay scale expression such as
 *   "10200-250/1-10450-300/5-11950-350/5-13700-...-26850"
 * (START-INCREMENT/COUNT-...-MAX) into the full ladder of individual stage
 * amounts. Used to expand src/seed/payScalesUCB.js into PayStage rows.
 *
 * Throws if a checkpoint printed in the expression doesn't match what the
 * increment/count arithmetic produces — this is what caught several digit
 * transcription slips while building the seed data (see
 * src/seed/payScalesUCB.js's header note).
 */
function expandScaleExpression(expr) {
  const tokens = String(expr).split('-');
  let current = Number(tokens[0]);
  if (!Number.isFinite(current)) throw new Error(`Invalid scale expression (bad start): "${expr}"`);
  const amounts = [current];
  let i = 1;
  let totalIncrements = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.includes('/')) {
      const [incStr, countStr] = tok.split('/');
      const inc = Number(incStr);
      const count = Number(countStr);
      if (!Number.isFinite(inc) || !Number.isInteger(count) || count < 1) {
        throw new Error(`Invalid increment/count "${tok}" in "${expr}"`);
      }
      for (let k = 0; k < count; k++) {
        current += inc;
        amounts.push(current);
      }
      totalIncrements += count;
      i++;
      if (i < tokens.length) {
        const checkpoint = Number(tokens[i]);
        if (checkpoint !== current) {
          throw new Error(`Checkpoint mismatch in "${expr}": expected ${current}, found ${checkpoint}`);
        }
        i++;
      }
    } else {
      i++;
    }
  }
  return { amounts, totalIncrements, finalAmount: current };
}

module.exports = { expandScaleExpression };
