'use strict';
const crypto = require('node:crypto');
const { inflateRawSync } = require('node:zlib');
const path = require('node:path').posix;
const Excel = require('exceljs');
// Reuse the pinned ExcelJS dependency tree for XML parsing and ZIP checksums.
const { SaxesParser } = require('saxes');
const { unsigned: crc32 } = require('buffer-crc32');
const { sequelize, Organization, OrganizationBranch: Branch } = require('../models');
const { createBranch } = require('./organizationStructure');
const { OrgFieldError } = require('./orgFields');

const MAX_BYTES = 2 * 1024 * 1024, MAX_ROWS = 1000, PREVIEW_MS = 10 * 60 * 1000;
// Stable lowercase template labels; identifiers and phone numbers must be entered as text.
const FIELDS = ['number', 'code', 'name', 'address', 'phone'];
const HEADERS = ['branch number', 'branch code', 'branch name', 'address', 'phone'];
const LIMITS = [32, 32, 255, 2000, 64];
const fail = message => { throw new OrgFieldError(message); };
const SPREADSHEET = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types';
const DRAWING = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PARTS = {
  'xl/workbook.xml': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
  'xl/worksheets/sheet1.xml': 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml',
  'xl/styles.xml': 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml',
  'xl/sharedStrings.xml': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml',
  'xl/theme/theme1.xml': 'application/vnd.openxmlformats-officedocument.theme+xml',
  'docProps/core.xml': 'application/vnd.openxmlformats-package.core-properties+xml',
  'docProps/app.xml': 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
};
const ALLOWED = new Set([...Object.keys(PARTS), '[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels']);
const words = value => new Set(value.split(' '));
const ELEMENTS = {
  'xl/workbook.xml': words('workbook fileVersion workbookPr bookViews workbookView sheets sheet calcPr'),
  'xl/worksheets/sheet1.xml': words('worksheet dimension sheetViews sheetView selection pane sheetFormatPr cols col sheetData row c v is t pageMargins pageSetup printOptions'),
  'xl/sharedStrings.xml': words('sst si t'),
  'xl/styles.xml': words('styleSheet numFmts numFmt fonts font color family scheme sz name b i u strike vertAlign charset outline shadow condense extend fills fill patternFill fgColor bgColor borders border left right top bottom diagonal vertical horizontal start end cellStyleXfs xf alignment protection cellXfs cellStyles cellStyle dxfs tableStyles colors indexedColors rgbColor mruColors extLst ext slicerStyles timelineStyles'),
  'xl/theme/theme1.xml': words('theme themeElements clrScheme dk1 sysClr lt1 dk2 srgbClr lt2 accent1 accent2 accent3 accent4 accent5 accent6 hlink folHlink fontScheme majorFont latin ea cs font minorFont fmtScheme fillStyleLst solidFill schemeClr gradFill gsLst gs tint satMod lin shade lnStyleLst ln prstDash effectStyleLst effectStyle effectLst outerShdw alpha scene3d camera rot lightRig sp3d bevelT bgFillStyleLst path fillToRect objectDefaults spDef spPr bodyPr lstStyle style lnRef fillRef effectRef fontRef lnDef extraClrSchemeLst'),
  'docProps/core.xml': words('coreProperties creator title subject description keywords category lastModifiedBy created modified revision lastPrinted contentStatus identifier language version'),
  'docProps/app.xml': words('Properties Application DocSecurity ScaleCrop HeadingPairs vector variant lpstr i4 TitlesOfParts Company Manager LinksUpToDate SharedDoc HyperlinksChanged AppVersion TotalTime Pages Words Characters CharactersWithSpaces Lines Paragraphs'),
  '[Content_Types].xml': words('Types Default Override'),
  '_rels/.rels': words('Relationships Relationship'),
  'xl/_rels/workbook.xml.rels': words('Relationships Relationship'),
};
const NAMESPACES = {
  'docProps/core.xml': words('http://schemas.openxmlformats.org/package/2006/metadata/core-properties http://purl.org/dc/elements/1.1/ http://purl.org/dc/terms/'),
  'docProps/app.xml': words('http://schemas.openxmlformats.org/officeDocument/2006/extended-properties http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes'),
  'xl/styles.xml': new Set([SPREADSHEET, 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/main', 'http://schemas.microsoft.com/office/spreadsheetml/2010/11/main']),
};

// Read the ZIP directory first and bound inflation before handing bytes to ExcelJS.
function zipParts(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_BYTES) fail('Workbook must be an .xlsx buffer of at most 2 MiB');
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) fail('Only .xlsx ZIP workbooks are accepted');
  let end = buffer.length - 22;
  while (end >= Math.max(0, buffer.length - 65557) && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || buffer.readUInt32LE(end) !== 0x06054b50 || end + 22 + buffer.readUInt16LE(end + 20) !== buffer.length) fail('Malformed ZIP workbook');
  const count = buffer.readUInt16LE(end + 10), offset = buffer.readUInt32LE(end + 16);
  if (buffer.readUInt32LE(end + 4) !== 0 || buffer.readUInt16LE(end + 8) !== count || !count || count > 32 || offset + buffer.readUInt32LE(end + 12) !== end) fail('Unsupported ZIP workbook directory');
  const parts = new Map(), names = new Set(), ranges = [];
  let cursor = offset, total = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) fail('Malformed ZIP directory');
    const flags = buffer.readUInt16LE(cursor + 8), method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16), compressed = buffer.readUInt32LE(cursor + 20), size = buffer.readUInt32LE(cursor + 24);
    const length = buffer.readUInt16LE(cursor + 28), extra = buffer.readUInt16LE(cursor + 30), comment = buffer.readUInt16LE(cursor + 32), local = buffer.readUInt32LE(cursor + 42);
    const next = cursor + 46 + length + extra + comment;
    if (next > end || extra !== 0 || flags & ~0x808 || ![0, 8].includes(method) || buffer.readUInt16LE(cursor + 34) !== 0 || size > 4 * 1024 * 1024 || (total += size) > 16 * 1024 * 1024) fail('Unsupported or oversized ZIP entry');
    const name = buffer.subarray(cursor + 46, cursor + 46 + length).toString('utf8');
    const directory = name.endsWith('/');
    if (names.has(name) || !(ALLOWED.has(name) || directory && ['_rels/', 'xl/', 'xl/_rels/', 'xl/worksheets/', 'xl/theme/', 'docProps/'].includes(name))) fail('Unsupported workbook content or worksheet');
    names.add(name);
    if (local + 30 > offset || buffer.readUInt32LE(local) !== 0x04034b50 || buffer.readUInt16LE(local + 6) !== flags || buffer.readUInt16LE(local + 8) !== method) fail('Malformed ZIP local entry');
    if (buffer.readUInt16LE(local + 28) !== 0) fail('Unsupported ZIP extra fields');
    const localLength = buffer.readUInt16LE(local + 26), start = local + 30 + localLength + buffer.readUInt16LE(local + 28), stop = start + compressed;
    if (buffer.subarray(local + 30, local + 30 + localLength).toString('utf8') !== name || stop > offset || start > stop) fail('Malformed ZIP local name or size');
    if (!(flags & 8) && (buffer.readUInt32LE(local + 14) !== crc || buffer.readUInt32LE(local + 18) !== compressed || buffer.readUInt32LE(local + 22) !== size)) fail('Inconsistent ZIP entry');
    let data;
    try { data = method === 0 ? buffer.subarray(start, stop) : inflateRawSync(buffer.subarray(start, stop), { maxOutputLength: Math.max(1, size), info: true }); } catch { fail('Invalid or oversized compressed workbook'); }
    if (method === 8) {
      if (data.engine.bytesWritten !== compressed) fail('Trailing compressed ZIP data');
      data = data.buffer;
    }
    if (data.length !== size || crc32(data) !== crc || directory && size !== 0) fail('Malformed ZIP size or checksum');
    let entryEnd = stop;
    if (flags & 8) {
      if (entryEnd + 4 <= offset && buffer.readUInt32LE(entryEnd) === 0x08074b50) entryEnd += 4;
      if (entryEnd + 12 > offset || buffer.readUInt32LE(entryEnd) !== crc || buffer.readUInt32LE(entryEnd + 4) !== compressed || buffer.readUInt32LE(entryEnd + 8) !== size) fail('Invalid ZIP descriptor');
      entryEnd += 12;
    }
    ranges.push([local, entryEnd]);
    if (!directory) parts.set(name, data);
    cursor = next;
  }
  ranges.sort((a, b) => a[0] - b[0]);
  if (cursor !== end || ranges[0][0] !== 0 || ranges.at(-1)[1] !== offset || ranges.some((r, i) => i && ranges[i - 1][1] !== r[0])) fail('Overlapping or hidden ZIP entries');
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml']) if (!parts.has(name)) fail('Incomplete .xlsx workbook');
  return parts;
}
function cellReference(value) {
  const match = /^([A-E])([1-9]\d{0,3})$/.exec(value || '');
  if (!match || Number(match[2]) > MAX_ROWS + 1) fail('Workbook exceeds five columns or 1000 data rows');
}
function inspectXml(parts) {
  const links = new Map(), contentTypes = new Map();
  let sheetCount = 0, sheetLink;
  for (const [name, bytes] of parts) {
    let xml;
    try { xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('Workbook XML must be UTF-8'); }
    const parser = new SaxesParser({ xmlns: true });
    const ns = NAMESPACES[name] || new Set([name.endsWith('.rels') ? REL : name === '[Content_Types].xml' ? TYPES : name.includes('/theme/') ? DRAWING : SPREADSHEET]);
    let depth = 0, elements = 0, rows = 0, cells = 0, lastRow = 0, lastColumn = 0;
    const relationIds = new Set(), defaults = new Set();
    parser.on('doctype', () => fail('Workbook XML DTDs are unsupported'));
    parser.on('processinginstruction', () => fail('Workbook XML processing instructions are unsupported'));
    parser.on('xmldecl', d => { if (d.encoding && d.encoding.toUpperCase() !== 'UTF-8') fail('Workbook XML must be UTF-8'); });
    parser.on('opentag', tag => {
      if (++depth > 64 || ++elements > 60000 || !ns.has(tag.uri) || !ELEMENTS[name].has(tag.local)) fail('Unsupported workbook XML content');
      for (const attr of Object.values(tag.attributes)) {
        if (attr.uri && !['http://www.w3.org/2000/xmlns/', 'http://www.w3.org/XML/1998/namespace', OFFICE_REL.slice(0, -1), 'http://www.w3.org/2001/XMLSchema-instance', 'http://schemas.openxmlformats.org/markup-compatibility/2006', 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac'].includes(attr.uri)) fail('Unsupported workbook XML attribute');
        if (attr.uri === 'http://www.w3.org/XML/1998/namespace' && !['space', 'lang'].includes(attr.local)) fail('Unsupported XML base or attribute');
        if (attr.uri === 'http://www.w3.org/2001/XMLSchema-instance' && attr.local !== 'type' || attr.local === 'schemaLocation') fail('Unsupported external XML schema');
      }
      const a = key => tag.attributes[key]?.value;
      if (tag.local === 'Relationship') {
        const type = a('Type'), target = a('Target'), id = a('Id');
        if (!id || relationIds.has(id) || a('TargetMode') && a('TargetMode') !== 'Internal' || !target || /[:\\%?#]/.test(target)) fail('External or malformed workbook relationship');
        relationIds.add(id);
        const resolved = target.startsWith('/') ? target.slice(1) : path.normalize(path.join(name === '_rels/.rels' ? '' : 'xl', target));
        const expected = name === '_rels/.rels' ? {
          [`${OFFICE_REL}officeDocument`]: 'xl/workbook.xml', [`${REL}/metadata/core-properties`]: 'docProps/core.xml', [`${OFFICE_REL}extended-properties`]: 'docProps/app.xml',
        } : { [`${OFFICE_REL}worksheet`]: 'xl/worksheets/sheet1.xml', [`${OFFICE_REL}styles`]: 'xl/styles.xml', [`${OFFICE_REL}sharedStrings`]: 'xl/sharedStrings.xml', [`${OFFICE_REL}theme`]: 'xl/theme/theme1.xml' };
        if (expected[type] !== resolved || !parts.has(resolved) || [...links.values()].some(v => v === resolved)) fail('Unsupported or duplicate workbook relationship');
        links.set(`${name}:${id}`, resolved);
      }
      if (tag.local === 'Default') {
        const ext = a('Extension'), type = a('ContentType');
        // ExcelJS declares unused VML by default; actual VML parts remain forbidden.
        const allowed = { rels: 'application/vnd.openxmlformats-package.relationships+xml', xml: 'application/xml', vml: 'application/vnd.openxmlformats-officedocument.vmlDrawing' };
        if (defaults.has(ext) || allowed[ext] !== type) fail('Unsupported workbook content type');
        defaults.add(ext);
      }
      if (tag.local === 'Override') {
        const part = a('PartName')?.slice(1);
        if (!a('PartName')?.startsWith('/') || !PARTS[part] || PARTS[part] !== a('ContentType') || contentTypes.has(part) || !parts.has(part)) fail('Unsupported workbook content type');
        contentTypes.set(part, a('ContentType'));
      }
      if (name === 'xl/workbook.xml' && tag.local === 'sheet') {
        if (!/^[1-9]\d{0,3}$/.test(a('sheetId') || '') || Number(a('sheetId')) > 1000) fail('Unsupported workbook sheet identifier');
        sheetCount++;
        sheetLink = Object.values(tag.attributes).find(a => a.uri === OFFICE_REL.slice(0, -1) && a.local === 'id')?.value;
      }
      if (name === 'xl/worksheets/sheet1.xml') {
        if (tag.local === 'row') {
          if (++rows > MAX_ROWS + 1 || !/^[1-9]\d*$/.test(a('r') || '') || Number(a('r')) > MAX_ROWS + 1) fail('Workbook exceeds 1000 data rows');
          if (Number(a('r')) <= lastRow) fail('Duplicate or unordered workbook rows');
          lastRow = Number(a('r')); lastColumn = 0;
        }
        if (tag.local === 'c') {
          if (++cells > (MAX_ROWS + 1) * 5) fail('Too many workbook cells');
          cellReference(a('r'));
          const column = a('r').charCodeAt(0);
          if (Number(a('r').slice(1)) !== lastRow || column <= lastColumn) fail('Duplicate or inconsistent workbook cell address');
          lastColumn = column;
          if (a('t') && !['s', 'inlineStr', 'str', 'n', 'b', 'e', 'd'].includes(a('t'))) fail('Unsupported workbook cell type');
        }
        if (tag.local === 'dimension') for (const ref of (a('ref') || '').split(':')) cellReference(ref);
        if (tag.local === 'col' && (!/^[1-5]$/.test(a('min') || '') || !/^[1-5]$/.test(a('max') || ''))) fail('Workbook exceeds five columns');
      }
    });
    parser.on('closetag', () => depth--);
    parser.on('error', () => fail('Malformed workbook XML'));
    try { parser.write(xml).close(); } catch (e) { if (e instanceof OrgFieldError) throw e; fail('Malformed workbook XML'); }
  }
  if (sheetCount !== 1 || links.get(`xl/_rels/workbook.xml.rels:${sheetLink}`) !== 'xl/worksheets/sheet1.xml') fail('Exactly one worksheet is required');
  for (const part of parts.keys()) if (PARTS[part] && (!contentTypes.has(part) || ![...links.values()].includes(part))) fail('Unreferenced or undeclared workbook content');
}

function organizationId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail('Invalid organisation');
  return Number(value);
}
function normalizedRows(input, errors) {
  if (!Array.isArray(input) || !input.length || input.length > MAX_ROWS) fail('Workbook must contain 1–1000 data rows');
  const seen = FIELDS.slice(0, 3).map(() => new Set());
  return input.map((values, index) => {
    const result = {};
    FIELDS.forEach((field, column) => {
      const value = values[column];
      let text = value == null ? '' : typeof value === 'string' ? value.trim() : '';
      if (value != null && typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) errors.push({ row: index + 2, field, message: 'Use plain text cells; enter identifiers and phone numbers as text' });
      if (field === 'code') text = text.toUpperCase();
      if (text.length > LIMITS[column]) { errors.push({ row: index + 2, field, message: `Maximum ${LIMITS[column]} characters` }); text = ''; }
      if (column < 3 && !text) errors.push({ row: index + 2, field, message: 'Required field' });
      if (column < 3 && text) {
        const key = text.toUpperCase();
        if (seen[column].has(key)) errors.push({ row: index + 2, field, message: 'Duplicate in workbook' });
        seen[column].add(key);
      }
      result[field] = text;
    });
    return result;
  });
}
async function databaseErrors(rows, orgId, transaction) {
  const existing = await Branch.findAll({ where: { organizationId: orgId }, attributes: ['number', 'code', 'name', 'status'], transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
  const keys = ['number', 'code', 'name'];
  const occupied = keys.map(key => new Set(existing.filter(b => key !== 'name' || b.status === 'ACTIVE').map(b => b[key]?.trim().toUpperCase()).filter(Boolean)));
  return rows.flatMap((row, index) => keys.filter((key, i) => occupied[i].has(row[key].toUpperCase())).map(field => ({ row: index + 2, field, message: 'Already exists in organisation' })));
}
function canonical(rows, orgId, expires) { return JSON.stringify(['branch-workbook-v1', orgId, expires, rows.map(row => FIELDS.map(field => row[field]))]); }
function mac(rows, orgId, expires) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set — cannot sign workbook previews');
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(canonical(rows, orgId, expires)).digest();
}
async function writeBranchTemplate() {
  const book = new Excel.Workbook(), sheet = book.addWorksheet('Branches');
  sheet.columns = HEADERS.map(header => ({ header, width: header === 'address' ? 50 : 25, style: { numFmt: '@' } }));
  return Buffer.from(await book.xlsx.writeBuffer());
}
async function previewBranchWorkbook(buffer, tenant) {
  const orgId = organizationId(tenant);
  inspectXml(zipParts(buffer));
  const book = new Excel.Workbook();
  try { await book.xlsx.load(buffer); } catch { fail('Malformed .xlsx workbook'); }
  if (book.worksheets.length !== 1) fail('Exactly one worksheet is required');
  const sheet = book.worksheets[0];
  if (sheet.rowCount > MAX_ROWS + 1 || sheet.columnCount > 5) fail('Workbook exceeds 1000 data rows or five columns');
  if (HEADERS.some((header, index) => sheet.getRow(1).getCell(index + 1).value !== header)) fail('Use the template headers: ' + HEADERS.join(', '));
  const errors = [];
  const input = Array.from({ length: Math.max(0, sheet.rowCount - 1) }, (_, index) => FIELDS.map((_, column) => sheet.getRow(index + 2).getCell(column + 1).value));
  const rows = normalizedRows(input, errors);
  if (!await Organization.findByPk(orgId)) fail('Organisation not found');
  errors.push(...await databaseErrors(rows, orgId));
  const expires = Date.now() + PREVIEW_MS;
  return { rows, errors, previewSignature: errors.length ? null : `${expires}.${mac(rows, orgId, expires).toString('hex')}` };
}
async function applyBranchWorkbook({ rows: supplied, previewSignature } = {}, actor) {
  const orgId = organizationId(actor?.organizationId);
  if (!Array.isArray(supplied) || !supplied.length || supplied.length > MAX_ROWS || supplied.some(row => !row || typeof row !== 'object' || Object.keys(row).length !== 5 || FIELDS.some(key => !Object.hasOwn(row, key) || typeof row[key] !== 'string'))) fail('Invalid preview rows');
  const submitted = supplied.map(row => ({ ...row }));
  const match = typeof previewSignature === 'string' && /^([1-9]\d{12})\.([a-f0-9]{64})$/.exec(previewSignature);
  if (!match) fail('Invalid preview signature');
  const expires = Number(match[1]);
  if (expires <= Date.now() || expires > Date.now() + PREVIEW_MS) fail('Workbook preview expired; preview again');
  if (!crypto.timingSafeEqual(mac(submitted, orgId, expires), Buffer.from(match[2], 'hex'))) fail('Invalid or changed workbook preview for this organisation');
  return sequelize.transaction(async transaction => {
    if (!await Organization.findByPk(orgId, { transaction, lock: transaction.LOCK.UPDATE })) fail('Organisation not found');
    if (expires <= Date.now()) fail('Workbook preview expired; preview again');
    const errors = [], rows = normalizedRows(submitted.map(row => FIELDS.map(key => row[key])), errors);
    if (errors.length || submitted.some((row, index) => FIELDS.some(key => row[key] !== rows[index][key]))) fail('Invalid or changed workbook preview');
    const conflicts = await databaseErrors(rows, orgId, transaction);
    if (conflicts.length) fail(`Workbook conflict at row ${conflicts[0].row}: ${conflicts[0].field} already exists`);
    const created = [];
    for (const data of rows) created.push(await createBranch({ organizationId: orgId, actor, data, transaction }));
    return created;
  });
}
module.exports = { writeBranchTemplate, previewBranchWorkbook, applyBranchWorkbook };
