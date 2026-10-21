'use strict';

/**
 * Integer-based monetary utilities (paise / cents).
 * All amounts are stored and computed as integers (smallest currency unit).
 * Avoids floating-point precision issues entirely.
 */

const SCALE = 100;

/** Convert rupees (number or string) to paise (integer). */
function toPaise(n) {
  if (n === null || n === undefined || n === '') return 0;
  const num = Number(n);
  if (Number.isNaN(num)) return 0;
  return Math.round(num * SCALE);
}

/** Convert paise (integer) to rupees (integer, rounded to nearest whole rupee). */
function toRupees(paise) {
  if (paise === null || paise === undefined) return 0;
  return Math.round(paise / SCALE);
}

/** Add paise values (inputs must already be paise). */
function add(...values) {
  return values.reduce((sum, v) => sum + (Number(v) || 0), 0);
}

/** Subtract paise values (a - b). Inputs must be paise. */
function subtract(a, b) {
  return (Number(a) || 0) - (Number(b) || 0);
}

/** Multiply paise by a factor (number), return integer paise. */
function multiply(paise, factor) {
  return Math.round((Number(paise) || 0) * Number(factor));
}

/** Divide paise by a divisor, return integer paise (rounded). */
function divide(paise, divisor) {
  return Math.round((Number(paise) || 0) / Number(divisor));
}

/** Percentage of paise: paise * percent / 100. Input paise must be paise. */
function percentOf(paise, percent) {
  return Math.round((Number(paise) || 0) * Number(percent) / 100);
}

/** Minimum of paise values. */
function min(...values) {
  return Math.min(...values.map(v => Number(v) || 0));
}

/** Maximum of paise values. */
function max(...values) {
  return Math.max(...values.map(v => Number(v) || 0));
}

/** Round paise to nearest integer (no-op, for clarity). */
function round(paise) {
  return Math.round(Number(paise) || 0);
}

/** Clamp paise between min and max. */
function clamp(paise, minVal, maxVal) {
  const v = Number(paise) || 0;
  const mn = Number(minVal) || 0;
  const mx = Number(maxVal) || 0;
  return v < mn ? mn : v > mx ? mx : v;
}

/** Sum an array of paise values. */
function sum(arr) {
  return arr.reduce((s, v) => s + (Number(v) || 0), 0);
}

/** Format paise as rupee string with no decimals. */
function format(paise) {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(Number(paise) || 0);
  const rupees = Math.round(abs / SCALE);
  return `${sign}${rupees}`;
}

/** Safe getter: returns paise from either rupee or paise input (detects by magnitude). */
function toPaiseSafe(n) {
  if (n === null || n === undefined || n === '') return 0;
  const num = Number(n);
  if (Number.isNaN(num)) return 0;
  // Heuristic: if value has fractional part, assume rupees; if integer and large, assume paise
  if (num % 1 !== 0) return Math.round(num * SCALE);
  if (num > 1000000) return num; // likely already paise (10000+ rupees)
  return Math.round(num * SCALE); // small integer likely rupees
}

module.exports = {
  SCALE,
  toPaise,
  toRupees,
  toPaiseSafe,
  add,
  subtract,
  multiply,
  divide,
  percentOf,
  min,
  max,
  round,
  clamp,
  sum,
  format,
};