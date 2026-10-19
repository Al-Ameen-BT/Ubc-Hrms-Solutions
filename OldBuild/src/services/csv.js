'use strict';

/** Minimal CSV parse/write — no external dependency. Handles quoted fields
 * (with embedded commas/newlines/escaped quotes) and bare fields. */

function parseCsv(text) {
  const rows = [];
  let row = []; let field = ''; let inQuotes = false;
  const s = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = ''; rows.push(row); row = [];
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  // Drop a trailing wholly-empty row (common with a trailing newline).
  while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] === undefined ? '' : String(r[i]).trim(); });
    return obj;
  });
}

function csvField(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(rows, headers) {
  const lines = [headers.map(csvField).join(',')];
  for (const row of rows) lines.push(headers.map((h) => csvField(row[h])).join(','));
  return lines.join('\r\n') + '\r\n';
}

module.exports = { parseCsv, toCsv };
