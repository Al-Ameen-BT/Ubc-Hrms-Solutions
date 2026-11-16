'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'branch-workbook-test-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const s = require('../src/services/branchWorkbook');
const structure = require('../src/services/organizationStructure');
const { sequelize, Organization, OrganizationBranch: Branch, User, AuditLog } = require('../src/models');
const headers = ['branch number', 'branch code', 'branch name', 'address', 'phone'];
let serial = 0;
before(() => sequelize.sync());
after(() => sequelize.close());
async function fixture() {
  const n = ++serial;
  const org = await Organization.create({ code: `WB${n}`, name: 'Bank' });
  const actor = await User.create({ organizationId: org.id, email: `admin${n}@workbook.invalid`, name: 'Admin', role: 'ORG_ADMIN', passwordHash: 'unused' });
  await structure.configureHeadOffice({ organizationId: org.id, actor, data: { code: 'HO', number: '000', name: 'Head Office' } });
  return { org, actor };
}
async function workbook(rows = [[' 001 ', ' br1 ', ' Main ', ' Address ', ' +9100123 ']], edit) {
  const Excel = require('exceljs');
  const book = new Excel.Workbook();
  const sheet = book.addWorksheet('Branches');
  sheet.addRow(headers); rows.forEach(r => sheet.addRow(r));
  if (edit) edit(book, sheet);
  return Buffer.from(await book.xlsx.writeBuffer());
}
async function zipEdit(buffer, edit) {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buffer); await edit(zip);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
test('template has documented headers, one sheet and text-formatted identifier columns', async () => {
  const Excel = require('exceljs'), book = new Excel.Workbook();
  await book.xlsx.load(await s.writeBranchTemplate());
  assert.equal(book.worksheets.length, 1);
  assert.deepEqual(book.worksheets[0].getRow(1).values.slice(1), headers);
  assert.equal(book.worksheets[0].getColumn(1).numFmt, '@');
  assert.equal(book.worksheets[0].getColumn(5).numFmt, '@');
});
test('clean preview trims strings, normalizes codes, preserves zeroes and writes nothing', async () => {
  const { org } = await fixture(), before = await AuditLog.count();
  const preview = await s.previewBranchWorkbook(await workbook(), org.id);
  assert.deepEqual(preview.rows, [{ number: '001', code: 'BR1', name: 'Main', address: 'Address', phone: '+9100123' }]);
  assert.deepEqual(preview.errors, []); assert.equal(typeof preview.previewSignature, 'string');
  assert.equal(await Branch.count({ where: { organizationId: org.id } }), 1);
  assert.equal(await AuditLog.count(), before);
});
test('rejects oversized, non-xlsx, malformed ZIP/XML, extra worksheets and over 1000 rows', async () => {
  const { org } = await fixture();
  for (const buffer of [Buffer.alloc(2 * 1024 * 1024 + 1), Buffer.from('number,code,name'), Buffer.from('PK\x03\x04broken')]) {
    await assert.rejects(s.previewBranchWorkbook(buffer, org.id));
  }
  await assert.rejects(s.previewBranchWorkbook(await workbook([], b => b.addWorksheet('Other')), org.id), /worksheet|sheet/i);
  await assert.rejects(s.previewBranchWorkbook(await workbook(Array.from({ length: 1001 }, (_, i) => [String(i), `B${i}`, `Branch ${i}`])), org.id), /1000|1,000|rows/i);
  const broken = await zipEdit(await workbook(), async z => z.file('xl/worksheets/sheet1.xml', '<worksheet>'));
  await assert.rejects(s.previewBranchWorkbook(broken, org.id), /XML|workbook/i);
});
test('rejects formulas, links, macros, relationships and unsupported package content before parsing', async () => {
  const { org } = await fixture();
  for (const value of [{ formula: '1+1', result: '001' }, { text: '001', hyperlink: 'https://example.invalid' }, { richText: [{ text: '001' }] }, new Date(), true, 1]) {
    const result = await s.previewBranchWorkbook(await workbook([[value, 'BR1', 'Main']]), org.id).catch(e => ({ errors: [{ message: e.message }] }));
    assert.ok(result.errors.length, `accepted unsupported value ${String(value)}`);
    assert.ok(!result.previewSignature);
  }
  for (const [path, content] of [
    ['xl/vbaProject.bin', 'macro'], ['xl/embeddings/oleObject1.bin', 'object'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="https://example.invalid" TargetMode="External"/></Relationships>'],
    ['[Content_Types].xml', '<!DOCTYPE x [<!ENTITY x "bad">]><Types/>'],
  ]) {
    await assert.rejects(s.previewBranchWorkbook(await zipEdit(await workbook(), async z => z.file(path, content)), org.id));
  }
});
test('preview returns row errors for missing identifiers, long cells and workbook/database duplicates', async () => {
  const { org } = await fixture();
  const rows = [['001', 'BR1', 'Main'], ['002', 'br1', 'Other'], ['001', 'BR3', 'Third'], ['004', 'BR4', 'main'], ['', 'BR5', 'Missing'], ['006', 'BR6', 'x'.repeat(256)], ['000', 'HO', 'Head Office']];
  const result = await s.previewBranchWorkbook(await workbook(rows), org.id);
  for (const row of [3, 4, 5, 6, 7, 8]) assert.ok(result.errors.some(e => e.row === row), `missing errors for ${row}`);
  assert.equal(result.previewSignature, null);
  const numeric = await s.previewBranchWorkbook(await workbook([[123, 'BR1', 'Main', '', 123]], (_, sheet) => { sheet.getCell('A2').numFmt = '00000'; }), org.id);
  assert.ok(numeric.errors.some(e => e.field === 'number'));
});
test('apply rejects tampering, foreign tenants, expired previews and injected Head Office fields', async () => {
  const { org, actor } = await fixture(), other = await fixture();
  const preview = await s.previewBranchWorkbook(await workbook(), org.id);
  for (const changed of [ { ...preview, rows: [{ ...preview.rows[0], code: 'EDIT' }] }, { ...preview, rows: [{ ...preview.rows[0], unitType: 'HEAD_OFFICE' }] }, { ...preview, previewSignature: 'invalid' } ]) {
    await assert.rejects(s.applyBranchWorkbook(changed, actor));
  }
  await assert.rejects(s.applyBranchWorkbook(preview, other.actor), /preview|tenant|organisation/i);
  const now = Date.now; Date.now = () => now() + 11 * 60 * 1000;
  try { await assert.rejects(s.applyBranchWorkbook(preview, actor), /expired/i); } finally { Date.now = now; }
  assert.equal(await Branch.count({ where: { organizationId: org.id } }), 1);
});
test('apply revalidates current conflicts before any writes and rolls back failed authoritative creates', async () => {
  const { org, actor } = await fixture();
  const preview = await s.previewBranchWorkbook(await workbook([['001', 'BR1', 'Main'], ['002', 'BR2', 'Other']]), org.id);
  const conflict = await structure.createBranch({ organizationId: org.id, actor, data: { number: '009', code: 'BR2', name: 'Conflict' } });
  await assert.rejects(s.applyBranchWorkbook(preview, actor), /already|duplicate|conflict/i);
  assert.equal(await Branch.count({ where: { organizationId: org.id, code: 'BR1' } }), 0);
  await conflict.destroy();
  const before = await AuditLog.count();
  Branch.addHook('beforeCreate', 'rejectSecondWorkbookRow', branch => { if (branch.code === 'BR2') throw new Error('Simulated storage failure'); });
  try { await assert.rejects(s.applyBranchWorkbook(preview, actor), /storage failure/); } finally { Branch.removeHook('beforeCreate', 'rejectSecondWorkbookRow'); }
  assert.equal(await Branch.count({ where: { organizationId: org.id } }), 1);
  assert.equal(await AuditLog.count(), before);
});
test('apply uses branch authorization, creates only branches and audits atomically', async () => {
  const { org, actor } = await fixture();
  const preview = await s.previewBranchWorkbook(await workbook([['001', 'BR1', 'Main'], ['002', 'BR2', 'Other']]), org.id);
  const employee = await User.create({ organizationId: org.id, email: `no${++serial}@workbook.invalid`, name: 'User', role: 'EMPLOYEE', passwordHash: 'unused' });
  await assert.rejects(s.applyBranchWorkbook(preview, employee), /permission|authoriz/i);
  const created = await s.applyBranchWorkbook(preview, actor);
  assert.equal(created.length, 2);
  assert.ok(created.every(b => b.unitType === 'BRANCH' && b.isHeadOffice === false));
  assert.equal(await AuditLog.count({ where: { organizationId: org.id, action: 'org.branch.create' } }), 2);
  await assert.rejects(s.applyBranchWorkbook(preview, actor), /already|duplicate|conflict/i);
});

test('rejects corrupted ZIP metadata, inflated-size lies, hidden bytes and oversized expanded XML', async () => {
  const { org } = await fixture(), good = await workbook();
  const corruptions = [
    b => { b.writeUInt32LE(1, b.indexOf(Buffer.from('504b0102', 'hex')) + 24); return b; },
    b => { b.writeUInt32LE(1, 14); return b; },
    b => Buffer.concat([b, Buffer.from('hidden')]),
    b => Buffer.concat([Buffer.from('hidden'), b]),
    b => b.subarray(0, b.length - 1),
  ];
  for (const corrupt of corruptions) await assert.rejects(s.previewBranchWorkbook(corrupt(Buffer.from(good)), org.id));
  const bomb = await zipEdit(good, async z => z.file('xl/sharedStrings.xml', 'x'.repeat(4 * 1024 * 1024 + 1)));
  assert.ok(bomb.length < 2 * 1024 * 1024);
  await assert.rejects(s.previewBranchWorkbook(bomb, org.id), /oversized|ZIP/i);
});
test('rejects ambiguous cell addresses, hidden formulas and unknown XML extensions', async () => {
  const { org } = await fixture(), good = await workbook();
  for (const change of [
    x => x.replace('</row>', '<c r="A1" t="str"><v>different</v></c></row>'),
    x => x.replace('r="A2"', 'r="A3"'),
    x => x.replace('</sheetData>', '<row r="2"><c r="A2" t="str"><v>other</v></c></row></sheetData>'),
    x => x.replace('</worksheet>', '<extLst><ext uri="unknown"><evil xmlns="https://example.invalid"/></ext></extLst></worksheet>'),
    x => x.replace('</worksheet>', '<definedNames><definedName name="danger">cmd</definedName></definedNames></worksheet>'),
  ]) {
    const bad = await zipEdit(good, async z => z.file('xl/worksheets/sheet1.xml', change(await z.file('xl/worksheets/sheet1.xml').async('string'))));
    await assert.rejects(s.previewBranchWorkbook(bad, org.id));
  }
});
test('enforces string bounds after normalization and permits the maximum workbook size in rows', async () => {
  const { org } = await fixture();
  const bad = await s.previewBranchWorkbook(await workbook([['001', 'ß'.repeat(17), 'Main']]), org.id);
  assert.ok(bad.errors.some(e => e.field === 'code'));
  const clean = await s.previewBranchWorkbook(await workbook(Array.from({ length: 1000 }, (_, i) => [String(i + 1).padStart(4, '0'), `BR${i}`, `Branch ${i}`])), org.id);
  assert.equal(clean.rows.length, 1000); assert.deepEqual(clean.errors, []);
});

test('apply snapshots verified rows before asynchronous transaction work', async () => {
  const { org, actor } = await fixture();
  const preview = await s.previewBranchWorkbook(await workbook(), org.id);
  const applying = s.applyBranchWorkbook(preview, actor);
  preview.rows[0].code = 'FORGED';
  const created = await applying;
  assert.equal(created[0].code, 'BR1');
  assert.equal(await Branch.count({ where: { organizationId: org.id, code: 'FORGED' } }), 0);
});

test('rejects oversized sheet identifiers before the parser can create sparse worksheet arrays', async () => {
  const { org } = await fixture();
  const bad = await zipEdit(await workbook(), async z => z.file('xl/workbook.xml', (await z.file('xl/workbook.xml').async('string')).replace('sheetId="1"', 'sheetId="1000000"')));
  await assert.rejects(s.previewBranchWorkbook(bad, org.id), /sheet|workbook/i);
});

test('database duplicate checks cover each identity independently and remain tenant-local', async () => {
  const { org } = await fixture(), other = await fixture();
  await structure.createBranch({ organizationId: other.org.id, actor: other.actor, data: { number: '001', code: 'BR1', name: 'Main' } });
  const clean = await s.previewBranchWorkbook(await workbook(), org.id);
  assert.deepEqual(clean.errors, []);
  const result = await s.previewBranchWorkbook(await workbook([['001', 'BR1', 'head office'], ['000', 'BR2', 'New'], ['003', 'ho', 'Another']]), org.id);
  for (const [row, field] of [[2, 'name'], [3, 'number'], [4, 'code']]) assert.ok(result.errors.some(e => e.row === row && e.field === field), `${field} database conflict missing`);
  assert.equal(result.previewSignature, null);
});

test('malformed nested sheetData cannot hide an invalid row behind a clean preview', async () => {
  const { org } = await fixture(), before = await AuditLog.count();
  const hidden = `<pageMargins><sheetData><row r="3"><c r="A3" t="str"><v>002</v></c><c r="B3" t="str"><v>BR2</v></c><c r="C3" t="str"><v>${'x'.repeat(300)}</v></c></row></sheetData></pageMargins>`;
  const bad = await zipEdit(await workbook(), async z => z.file('xl/worksheets/sheet1.xml', (await z.file('xl/worksheets/sheet1.xml').async('string')).replace(/<pageMargins[^>]*\/>/, hidden)));
  await assert.rejects(s.previewBranchWorkbook(bad, org.id), e => e.status === 400);
  assert.equal(await Branch.count({ where: { organizationId: org.id } }), 1);
  assert.equal(await AuditLog.count(), before);
});

test('rejects wrong roots, duplicate singleton containers and misnested or unordered XML in every supported part', async () => {
  const { org } = await fixture(), good = await workbook(), before = await AuditLog.count();
  const cases = [
    ['xl/worksheets/sheet1.xml', x => x.replace('</worksheet>', '<sheetData/></worksheet>')],
    ['xl/worksheets/sheet1.xml', x => x.replace('<worksheet ', '<worksheet xmlns:m="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ').replace('</sheetData>', `<m:row r="3"><m:c r="A3" t="str"><m:v>002</m:v></m:c><m:c r="B3" t="str"><m:v>BR2</m:v></m:c><m:c r="C3" t="str"><m:v>${'x'.repeat(300)}</m:v></m:c></m:row></sheetData>`)],
    ['xl/worksheets/sheet1.xml', x => x.replace(/<dimension[^>]*\/>/, '').replace('</worksheet>', '<dimension ref="A1:E2"/></worksheet>')],
    ['xl/worksheets/sheet1.xml', x => x.replace('<worksheet ', '<sheetData ').replace('</worksheet>', '</sheetData>')],
    ['xl/workbook.xml', x => x.replace('</workbook>', '<sheets/></workbook>')],
    ['xl/workbook.xml', x => x.replace('</sheets>', '<workbookPr/></sheets>')],
    ['xl/sharedStrings.xml', x => x.replace('</sst>', '<sst/></sst>')],
    ['xl/sharedStrings.xml', x => x.replace('</si>', '<t>hidden</t></si>')],
    ['xl/styles.xml', x => x.replace('</styleSheet>', '<fonts count="0"/></styleSheet>')],
    ['xl/styles.xml', x => x.replace('</fonts>', '<xf/></fonts>')],
    ['xl/theme/theme1.xml', x => x.replace('</a:theme>', '<a:themeElements/></a:theme>')],
    ['_rels/.rels', x => x.replace('</Relationships>', '<Relationships/></Relationships>')],
    ['xl/_rels/workbook.xml.rels', x => x.replace('<Relationships ', '<Relationship ').replace('</Relationships>', '</Relationship>')],
    ['[Content_Types].xml', x => x.replace('</Types>', '<Types/></Types>')],
    ['docProps/core.xml', x => x.replace('</cp:coreProperties>', '<dc:title>duplicate</dc:title></cp:coreProperties>')],
    ['docProps/core.xml', x => x.replaceAll('cp:coreProperties', 'dc:coreProperties')],
    ['docProps/app.xml', x => x.replace('</Properties>', '<HeadingPairs/></Properties>')],
  ];
  for (const [part, change] of cases) {
    const bad = await zipEdit(good, async z => {
      const xml = await z.file(part).async('string'), altered = change(xml);
      assert.notEqual(altered, xml, `fixture did not change ${part}`);
      z.file(part, altered);
    });
    await assert.rejects(s.previewBranchWorkbook(bad, org.id), e => e.status === 400, part);
  }
  assert.equal(await Branch.count({ where: { organizationId: org.id } }), 1);
  assert.equal(await AuditLog.count(), before);
});
