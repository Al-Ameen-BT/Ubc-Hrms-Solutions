'use strict';

const crypto = require('node:crypto');
const Excel = require('exceljs');
const { Op } = require('sequelize');
const {
  sequelize, Organization, OrganizationBranch: Branch, OrganizationDepartment: Department,
  OrganizationPosition: Position, Employee, EmployeeOrganizationAssignment: Assignment,
  OrganizationResponsibilityAssignment: Responsibility, PostCadre, AuditLog,
} = require('../models');
const { OrgFieldError } = require('./orgFields');
const { signPreview, verifyPreview } = require('./importPreview');

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RESPONSIBILITIES = ['BRANCH_MANAGER', 'SENIOR_MANAGER', 'GENERAL_MANAGER', 'DATA_PROTECTION_OFFICER'];
const SCOPE_TYPES = ['BRANCH', 'ORGANISATION'];

const ENTITY_CONFIG = {
  departments: {
    sheetName: 'Departments',
    filename: 'departments.xlsx',
    permission: 'departments.manage',
    headers: ['branch code', 'department code', 'department name', 'display order'],
    fields: ['branchCode', 'code', 'name', 'displayOrder'],
  },
  positions: {
    sheetName: 'Positions',
    filename: 'positions.xlsx',
    permission: 'positions.manage',
    headers: ['branch code', 'department code', 'position code', 'position name', 'post cadre code', 'capacity', 'reports to position code', 'leadership visible'],
    fields: ['branchCode', 'departmentCode', 'code', 'name', 'postCadreCode', 'capacity', 'reportsToCode', 'leadershipVisible'],
  },
  staffing: {
    sheetName: 'Staffing',
    filename: 'staffing.xlsx',
    permission: 'assignments.manage',
    headers: ['employee code', 'branch code', 'department code', 'position code', 'effective from', 'effective to'],
    fields: ['empCode', 'branchCode', 'departmentCode', 'positionCode', 'effectiveFrom', 'effectiveTo'],
  },
  responsibilities: {
    sheetName: 'Responsibilities',
    filename: 'responsibilities.xlsx',
    permission: 'assignments.manage',
    headers: ['employee code', 'responsibility', 'scope type', 'branch code', 'effective from', 'effective to'],
    fields: ['empCode', 'responsibility', 'scopeType', 'branchCode', 'effectiveFrom', 'effectiveTo'],
  },
};

function fail(message, status = 400) {
  const err = new OrgFieldError(message);
  err.status = status;
  throw err;
}

function cellText(cell) {
  const value = cell?.value;
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (value.text != null) return String(value.text).trim();
    if (value.richText) return value.richText.map(p => p.text || '').join('').trim();
    if (value.result != null) return String(value.result).trim();
  }
  return String(value).trim();
}

function isValidDate(val) {
  if (!DATE_RE.test(val)) return false;
  const d = new Date(`${val}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === val;
}

function assertConfig(entity) {
  const cfg = ENTITY_CONFIG[entity];
  if (!cfg) fail(`Unsupported structure import entity: ${entity}`);
  return cfg;
}

async function writeStructureTemplate(entity) {
  const cfg = assertConfig(entity);
  const book = new Excel.Workbook();
  const sheet = book.addWorksheet(cfg.sheetName);
  sheet.columns = cfg.headers.map(header => ({
    header,
    width: header.includes('name') || header.includes('responsibility') ? 28 : 22,
    style: { numFmt: '@' },
  }));
  sheet.getRow(1).font = { bold: true };
  return Buffer.from(await book.xlsx.writeBuffer());
}

async function parseSheetRows(buffer, cfg) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_BYTES) fail('Workbook must be an .xlsx buffer of at most 2 MiB');
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) fail('Only .xlsx ZIP workbooks are accepted');

  const book = new Excel.Workbook();
  try { await book.xlsx.load(buffer); } catch { fail('Malformed .xlsx workbook'); }
  if (!book.worksheets.length) fail('Workbook contains no worksheets');
  const sheet = book.worksheets[0];
  if (sheet.rowCount > MAX_ROWS + 1) fail(`Workbook exceeds ${MAX_ROWS} data rows`);
  const headerRow = sheet.getRow(1);
  const actualHeaders = cfg.headers.map((_, i) => cellText(headerRow.getCell(i + 1)).toLowerCase());
  if (cfg.headers.some((h, i) => actualHeaders[i] !== h)) {
    fail(`Use the template headers: ${cfg.headers.join(', ')}`);
  }

  const rows = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const values = cfg.fields.map((_, c) => cellText(row.getCell(c + 1)));
    if (values.every(v => !v)) continue;
    const obj = { rowNumber: r };
    cfg.fields.forEach((field, c) => { obj[field] = values[c]; });
    rows.push(obj);
  }
  if (!rows.length) fail('Workbook contains no data rows');
  return rows;
}

async function previewStructureWorkbook(entity, buffer, actor) {
  const cfg = assertConfig(entity);
  const organizationId = actor?.organizationId;
  if (!organizationId) fail('Invalid organisation');

  const parsed = await parseSheetRows(buffer, cfg);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const [branches, departments, positions, cadres, employees, assignments, responsibilities] = await Promise.all([
    Branch.findAll({ where: { organizationId, status: 'ACTIVE' } }),
    Department.findAll({ where: { organizationId, status: 'ACTIVE' } }),
    Position.findAll({ where: { organizationId, status: 'ACTIVE' } }),
    PostCadre.findAll({ where: { organizationId, status: 'ACTIVE' } }),
    Employee.findAll({ where: { organizationId, status: 'ACTIVE' }, attributes: ['id', 'empCode', 'name'] }),
    entity === 'staffing' ? Assignment.findAll({ where: { organizationId, status: 'ACTIVE' } }) : Promise.resolve([]),
    entity === 'responsibilities' ? Responsibility.findAll({ where: { organizationId, status: 'ACTIVE' } }) : Promise.resolve([]),
  ]);

  const branchByCode = new Map(branches.map(b => [b.code.toUpperCase(), b]));
  const cadreByCode = new Map(cadres.map(c => [c.code.toUpperCase(), c]));
  const empByCode = new Map(employees.map(e => [e.empCode.toUpperCase(), e]));

  const errors = [];
  const normalizedRows = [];
  const seenKeys = new Set();
  const seenNames = new Set();
  const overlaps = (a, b) => (!a.effectiveTo || a.effectiveTo >= b.effectiveFrom) && (!b.effectiveTo || b.effectiveTo >= a.effectiveFrom);
  const batchStaffing = [];
  const batchResponsibilities = [];

  for (const item of parsed) {
    const rowErr = (field, message) => errors.push({ row: item.rowNumber, field, message });

    if (entity === 'departments') {
      const branchCode = item.branchCode.toUpperCase();
      const code = item.code.toUpperCase();
      const name = item.name.trim();
      const displayOrder = item.displayOrder ? Number(item.displayOrder) : 0;

      const branch = branchByCode.get(branchCode);
      if (!branchCode || !branch) rowErr('branchCode', 'Active branch code not found');
      if (!code || code.length > 32) rowErr('code', 'Department code is required (max 32 chars)');
      if (!name || name.length > 255) rowErr('name', 'Department name is required (max 255 chars)');
      if (!Number.isInteger(displayOrder) || displayOrder < 0) rowErr('displayOrder', 'Display order must be a non-negative integer');

      if (branch && code) {
        const key = `${branch.id}:${code}`;
        if (seenKeys.has(key)) rowErr('code', 'Duplicate department code in workbook for this branch');
        seenKeys.add(key);
        const nameKey = `${branch.id}:${name.toLowerCase()}`;
        if (name && seenNames.has(nameKey)) rowErr('name', 'Duplicate department name in workbook for this branch');
        if (name) seenNames.add(nameKey);
        if (departments.some(d => d.branchId === branch.id && d.code.toUpperCase() === code)) {
          rowErr('code', 'Department code already exists in this branch');
        }
        if (departments.some(d => d.branchId === branch.id && d.name.trim().toLowerCase() === name.toLowerCase())) {
          rowErr('name', 'Department name already exists in this branch');
        }
      }
      normalizedRows.push({ branchCode, branchId: branch?.id || null, code, name, displayOrder });
    } else if (entity === 'positions') {
      const branchCode = item.branchCode.toUpperCase();
      const departmentCode = item.departmentCode.toUpperCase();
      const code = item.code.toUpperCase();
      const name = item.name.trim();
      const postCadreCode = item.postCadreCode.toUpperCase();
      const capacity = item.capacity ? Number(item.capacity) : 1;
      const reportsToCode = item.reportsToCode.toUpperCase();
      const leadershipVisible = ['YES', 'Y', 'TRUE', '1'].includes(item.leadershipVisible.toUpperCase());

      const branch = branchByCode.get(branchCode);
      if (!branchCode || !branch) rowErr('branchCode', 'Active branch code not found');
      const dept = branch && departments.find(d => d.branchId === branch.id && d.code.toUpperCase() === departmentCode);
      if (!departmentCode || !dept) rowErr('departmentCode', 'Active department code not found in branch');
      if (!code || code.length > 32) rowErr('code', 'Position code is required (max 32 chars)');
      if (!name || name.length > 255) rowErr('name', 'Position name is required (max 255 chars)');
      const cadre = postCadreCode ? cadreByCode.get(postCadreCode) : null;
      if (postCadreCode && !cadre) rowErr('postCadreCode', 'Active post cadre code not found');
      if (!Number.isInteger(capacity) || capacity < 1) rowErr('capacity', 'Capacity must be a positive integer');
      if (leadershipVisible && branch && branch.unitType !== 'HEAD_OFFICE') rowErr('leadershipVisible', 'Leadership visibility is valid only for Head Office');

      const parentPos = reportsToCode ? positions.find(p => p.code.toUpperCase() === reportsToCode) : null;
      if (reportsToCode && !parentPos) rowErr('reportsToCode', 'Parent position code not found');

      if (branch && dept && code) {
        const key = `${branch.id}:${dept.id}:${code}`;
        if (seenKeys.has(key)) rowErr('code', 'Duplicate position code in workbook');
        seenKeys.add(key);
        if (positions.some(p => p.branchId === branch.id && p.departmentId === dept.id && p.code.toUpperCase() === code)) {
          rowErr('code', 'Position code already exists in this department');
        }
      }
      normalizedRows.push({
        branchCode, branchId: branch?.id || null,
        departmentCode, departmentId: dept?.id || null,
        code, name, postCadreCode, postCadreId: cadre?.id || null,
        capacity, reportsToCode, reportsToPositionId: parentPos?.id || null, leadershipVisible,
      });
    } else if (entity === 'staffing') {
      const empCode = item.empCode.toUpperCase();
      const branchCode = item.branchCode.toUpperCase();
      const departmentCode = item.departmentCode.toUpperCase();
      const positionCode = item.positionCode.toUpperCase();
      const effectiveFrom = item.effectiveFrom;
      const effectiveTo = item.effectiveTo || null;

      const emp = empByCode.get(empCode);
      if (!empCode || !emp) rowErr('empCode', 'Active employee code not found');
      const branch = branchByCode.get(branchCode);
      if (!branchCode || !branch) rowErr('branchCode', 'Active branch code not found');
      const dept = branch && departmentCode ? departments.find(d => d.branchId === branch.id && d.code.toUpperCase() === departmentCode) : null;
      if (departmentCode && !dept) rowErr('departmentCode', 'Department code not found in branch');
      const pos = branch && positionCode ? positions.find(p => p.branchId === branch.id && (!dept || p.departmentId === dept.id) && p.code.toUpperCase() === positionCode) : null;
      if (positionCode && !pos) rowErr('positionCode', 'Position code not found in branch/department');
      if (!isValidDate(effectiveFrom)) rowErr('effectiveFrom', 'Effective from must be YYYY-MM-DD');
      if (effectiveTo && !isValidDate(effectiveTo)) rowErr('effectiveTo', 'Effective to must be YYYY-MM-DD');
      if (isValidDate(effectiveFrom) && effectiveTo && isValidDate(effectiveTo) && effectiveTo < effectiveFrom) {
        rowErr('effectiveTo', 'Effective to must not precede effective from');
      }
      if (emp && isValidDate(effectiveFrom)) {
        const range = { effectiveFrom, effectiveTo };
        if (batchStaffing.some(b => b.employeeId === emp.id && overlaps(b, range))) {
          rowErr('empCode', 'Overlapping staffing assignment for employee in workbook');
        }
        if (assignments.some(a => a.employeeId === emp.id && overlaps(a, range))) {
          rowErr('empCode', 'Employee already has an overlapping active assignment in database');
        }
        batchStaffing.push({ employeeId: emp.id, ...range });
      }
      normalizedRows.push({
        empCode, employeeId: emp?.id || null,
        branchCode, branchId: branch?.id || null,
        departmentCode, departmentId: dept?.id || null,
        positionCode, positionId: pos?.id || null,
        effectiveFrom, effectiveTo,
      });
    } else if (entity === 'responsibilities') {
      const empCode = item.empCode.toUpperCase();
      const responsibility = item.responsibility.toUpperCase().replace(/\s+/g, '_');
      const scopeType = (item.scopeType || 'BRANCH').toUpperCase();
      const branchCode = item.branchCode.toUpperCase();
      const effectiveFrom = item.effectiveFrom;
      const effectiveTo = item.effectiveTo || null;

      const emp = empByCode.get(empCode);
      if (!empCode || !emp) rowErr('empCode', 'Active employee code not found');
      if (!RESPONSIBILITIES.includes(responsibility)) rowErr('responsibility', `Must be one of: ${RESPONSIBILITIES.join(', ')}`);
      if (!SCOPE_TYPES.includes(scopeType)) rowErr('scopeType', 'Scope type must be BRANCH or ORGANISATION');
      const branch = branchCode ? branchByCode.get(branchCode) : null;
      if (scopeType === 'BRANCH' && (!branchCode || !branch)) rowErr('branchCode', 'Active branch code is required for BRANCH scope');
      if (scopeType === 'ORGANISATION' && branchCode) rowErr('branchCode', 'Leave branch code blank for ORGANISATION scope');
      if (!isValidDate(effectiveFrom)) rowErr('effectiveFrom', 'Effective from must be YYYY-MM-DD');
      if (effectiveTo && !isValidDate(effectiveTo)) rowErr('effectiveTo', 'Effective to must be YYYY-MM-DD');
      if (isValidDate(effectiveFrom) && effectiveTo && isValidDate(effectiveTo) && effectiveTo < effectiveFrom) {
        rowErr('effectiveTo', 'Effective to must not precede effective from');
      }
      const resolvedBranchId = scopeType === 'BRANCH' ? (branch?.id || null) : null;
      if (emp && RESPONSIBILITIES.includes(responsibility) && isValidDate(effectiveFrom)) {
        const range = { effectiveFrom, effectiveTo };
        if (batchResponsibilities.some(b => b.employeeId === emp.id && b.responsibility === responsibility && b.scopeType === scopeType && b.branchId === resolvedBranchId && overlaps(b, range))) {
          rowErr('responsibility', 'Duplicate or overlapping responsibility for employee in workbook');
        }
        if (responsibilities.some(r => r.employeeId === emp.id && r.responsibility === responsibility && r.scopeType === scopeType && r.branchId === resolvedBranchId && overlaps(r, range))) {
          rowErr('responsibility', 'Employee already holds an overlapping responsibility in database');
        }
        batchResponsibilities.push({ employeeId: emp.id, responsibility, scopeType, branchId: resolvedBranchId, ...range });
      }
      normalizedRows.push({
        empCode, employeeId: emp?.id || null,
        responsibility, scopeType,
        branchCode, branchId: resolvedBranchId,
        effectiveFrom, effectiveTo,
      });
    }
  }

  const payload = {
    entity,
    organizationId,
    source: { filename: cfg.filename, sha256, byteLength: buffer.length },
    rows: normalizedRows,
    errors,
  };
  return errors.length ? payload : signPreview(`org-structure-${entity}`, actor, payload);
}

async function applyStructureWorkbook(entity, body, actor) {
  const cfg = assertConfig(entity);
  const preview = verifyPreview(`org-structure-${entity}`, actor, body);
  if (preview.entity !== entity) fail('Preview entity mismatch');
  if (String(preview.organizationId) !== String(actor.organizationId)) fail('Preview belongs to another organisation', 403);
  if (preview.errors?.length) fail('Resolve workbook errors before applying');

  const organizationId = actor.organizationId;
  return sequelize.transaction(async transaction => {
    const org = await Organization.findByPk(organizationId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!org) fail('Organisation not found', 404);

    const created = [];
    for (const row of preview.rows) {
      if (entity === 'departments') {
        const dup = await Department.findOne({ where: { organizationId, branchId: row.branchId, [Op.or]: [{ code: row.code }, { name: row.name }], status: 'ACTIVE' }, transaction, lock: transaction.LOCK.UPDATE });
        if (dup) fail(`Department ${row.code} / ${row.name} already exists in this branch`);
        const record = await Department.create({
          organizationId, branchId: row.branchId, code: row.code, name: row.name, displayOrder: row.displayOrder, status: 'ACTIVE',
        }, { transaction });
        created.push(record);
      } else if (entity === 'positions') {
        const dup = await Position.findOne({ where: { organizationId, branchId: row.branchId, departmentId: row.departmentId, code: row.code, status: 'ACTIVE' }, transaction, lock: transaction.LOCK.UPDATE });
        if (dup) fail(`Position ${row.code} already exists in this department`);
        const record = await Position.create({
          organizationId, branchId: row.branchId, departmentId: row.departmentId,
          code: row.code, name: row.name, postCadreId: row.postCadreId,
          capacity: row.capacity, reportsToPositionId: row.reportsToPositionId,
          leadershipVisible: row.leadershipVisible, status: 'ACTIVE',
        }, { transaction });
        created.push(record);
      } else if (entity === 'staffing') {
        const overlap = await Assignment.findOne({
          where: {
            organizationId, employeeId: row.employeeId, status: 'ACTIVE',
            effectiveFrom: { [Op.lte]: row.effectiveTo || '9999-12-31' },
            [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: row.effectiveFrom } }],
          },
          transaction, lock: transaction.LOCK.UPDATE,
        });
        if (overlap) fail(`Employee ${row.empCode} already has an overlapping assignment`);
        const record = await Assignment.create({
          organizationId, employeeId: row.employeeId, branchId: row.branchId,
          departmentId: row.departmentId, positionId: row.positionId,
          effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo,
          assignedBy: actor.id, status: 'ACTIVE',
        }, { transaction });
        // Sync current Employee pointers if assignment is currently effective
        const emp = await Employee.findByPk(row.employeeId, { transaction, lock: transaction.LOCK.UPDATE });
        const branch = await Branch.findByPk(row.branchId, { transaction });
        const dept = row.departmentId ? await Department.findByPk(row.departmentId, { transaction }) : null;
        const pos = row.positionId ? await Position.findByPk(row.positionId, { transaction }) : null;
        await emp.update({
          branchId: branch.id, branchCode: branch.code, branchName: branch.name,
          departmentId: dept?.id || null, department: dept?.name || null,
          positionId: pos?.id || null, designation: pos?.name || emp.designation,
        }, { transaction });
        created.push(record);
      } else if (entity === 'responsibilities') {
        const overlap = await Responsibility.findOne({
          where: {
            organizationId, employeeId: row.employeeId, responsibility: row.responsibility,
            scopeType: row.scopeType, branchId: row.branchId, status: 'ACTIVE',
            effectiveFrom: { [Op.lte]: row.effectiveTo || '9999-12-31' },
            [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: row.effectiveFrom } }],
          },
          transaction, lock: transaction.LOCK.UPDATE,
        });
        if (overlap) fail(`Employee ${row.empCode} already holds an overlapping ${row.responsibility} responsibility`);
        const record = await Responsibility.create({
          organizationId, employeeId: row.employeeId, responsibility: row.responsibility,
          scopeType: row.scopeType, branchId: row.branchId,
          effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo,
          assignedBy: actor.id, status: 'ACTIVE',
        }, { transaction });
        created.push(record);
      }
    }

    await AuditLog.create({
      organizationId, actorUserId: actor.id, actorEmail: actor.email,
      action: `org.${entity}.import.apply`, targetType: 'organization', targetId: String(organizationId),
      details: { rowCount: created.length, sourceSha256: preview.source?.sha256 },
    }, { transaction });

    return created;
  });
}

async function exportStructureWorkbook(entity, organizationId) {
  const EXPORT_HEADERS = {
    branches: ['branch number', 'branch code', 'branch name', 'address', 'phone'],
    ...Object.fromEntries(Object.entries(ENTITY_CONFIG).map(([k, v]) => [k, v.headers])),
  };
  const headers = EXPORT_HEADERS[entity];
  if (!headers) fail(`Unsupported export entity: ${entity}`);

  const book = new Excel.Workbook();
  const sheet = book.addWorksheet(entity === 'branches' ? 'Branches' : ENTITY_CONFIG[entity].sheetName);
  sheet.columns = headers.map(header => ({ header, width: header.includes('address') ? 50 : 24, style: { numFmt: '@' } }));
  sheet.getRow(1).font = { bold: true };

  const [branches, departments, positions, cadres, employees] = await Promise.all([
    Branch.findAll({ where: { organizationId, status: 'ACTIVE' }, order: [['displayOrder', 'ASC'], ['id', 'ASC']] }),
    Department.findAll({ where: { organizationId, status: 'ACTIVE' }, order: [['id', 'ASC']] }),
    Position.findAll({ where: { organizationId, status: 'ACTIVE' }, order: [['id', 'ASC']] }),
    PostCadre.findAll({ where: { organizationId, status: 'ACTIVE' } }),
    Employee.findAll({ where: { organizationId, status: 'ACTIVE' }, attributes: ['id', 'empCode'] }),
  ]);

  const branchCode = id => branches.find(b => b.id === id)?.code || '';
  const deptCode = id => departments.find(d => d.id === id)?.code || '';
  const posCode = id => positions.find(p => p.id === id)?.code || '';
  const cadreCode = id => cadres.find(c => c.id === id)?.code || '';
  const empCode = id => employees.find(e => e.id === id)?.empCode || '';

  if (entity === 'branches') {
    for (const b of branches) sheet.addRow([String(b.number || ''), String(b.code || ''), String(b.name || ''), String(b.address || ''), String(b.phone || '')]);
  } else if (entity === 'departments') {
    for (const d of departments) sheet.addRow([branchCode(d.branchId), d.code, d.name, String(d.displayOrder ?? 0)]);
  } else if (entity === 'positions') {
    for (const p of positions) sheet.addRow([branchCode(p.branchId), deptCode(p.departmentId), p.code, p.name, cadreCode(p.postCadreId), String(p.capacity ?? 1), posCode(p.reportsToPositionId), p.leadershipVisible ? 'YES' : 'NO']);
  } else if (entity === 'staffing') {
    const rows = await Assignment.findAll({ where: { organizationId, status: 'ACTIVE' }, order: [['id', 'ASC']] });
    for (const a of rows) sheet.addRow([empCode(a.employeeId), branchCode(a.branchId), deptCode(a.departmentId), posCode(a.positionId), a.effectiveFrom || '', a.effectiveTo || '']);
  } else if (entity === 'responsibilities') {
    const rows = await Responsibility.findAll({ where: { organizationId, status: 'ACTIVE' }, order: [['id', 'ASC']] });
    for (const r of rows) sheet.addRow([empCode(r.employeeId), r.responsibility, r.scopeType, branchCode(r.branchId), r.effectiveFrom || '', r.effectiveTo || '']);
  }

  return Buffer.from(await book.xlsx.writeBuffer());
}

module.exports = { ENTITY_CONFIG, writeStructureTemplate, previewStructureWorkbook, applyStructureWorkbook, exportStructureWorkbook };
