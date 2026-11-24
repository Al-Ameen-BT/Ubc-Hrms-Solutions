'use strict';
const { Op } = require('sequelize');
const { Employee, OrganizationBranch, OrganizationDepartment, OrganizationPosition, EmployeeOrganizationAssignment, OrganizationBoardMember, EmployeeDocument } = require('../models');
const { effectiveAccess, can, scopedWhere } = require('./accessControl');
const { todayIST } = require('./orgAccess');
const { isDateOnly } = require('./dateUtils');
const { UserAdminError } = require('./userAdmin');
const brand = require('./brandAssets');
const documents = require('./documents');

const branchFields = ['id', 'code', 'name', 'unitType'];
const departmentFields = ['id', 'code', 'name'];
const positionFields = ['id', 'code', 'name', 'reportsToPositionId'];
const pick = (row, fields) => row ? Object.fromEntries(fields.map(field => [field, row[field]])) : null;
const current = at => ({ status: 'ACTIVE', effectiveFrom: { [Op.lte]: at }, [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: at } }] });
const context = row => ({ assigned: !!row, branch: pick(row?.OrganizationBranch, branchFields), department: pick(row?.OrganizationDepartment, departmentFields), position: pick(row?.OrganizationPosition, positionFields) });
function includes(organizationId) {
  return [
    { model: OrganizationBranch, required: true, where: { organizationId, status: 'ACTIVE' }, attributes: branchFields },
    { model: OrganizationDepartment, required: false, where: { organizationId, status: 'ACTIVE' }, attributes: departmentFields },
    { model: OrganizationPosition, required: false, where: { organizationId, status: 'ACTIVE' }, attributes: positionFields },
  ];
}

async function organizationChart({ actor, at = todayIST(), view = 'organization', branchId = null, departmentId = null, level = null }) {
  const normalizedId = (value, label) => {
    if (value == null || value === '') return null;
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new UserAdminError(400, `Use a valid ${label}`);
    return id;
  };
  const selectedBranchId = normalizedId(branchId, 'branch filter');
  const selectedDepartmentId = normalizedId(departmentId, 'department filter');
  const levels = ['organization', 'branch', 'department', 'position', 'employee'];
  if (typeof at !== 'string' || !isDateOnly(at) || !['organization', 'employee'].includes(view) || level != null && !levels.includes(level)) throw new UserAdminError(400, 'Use a valid chart date, view and level');
  // Visibility uses present access, never historical roles supplied through a chart date.
  const access = await effectiveAccess(actor?.id);
  if (String(access.organizationId) !== String(actor?.organizationId) || !can(access, 'chart.view')) throw new UserAdminError(403, 'Permission denied');
  if (view === 'employee' && !access.employeeId) throw new UserAdminError(403, 'Employee link required');
  const organizationId = access.organizationId;
  const activeStructure = [
    { [Op.or]: [{ departmentId: null }, { '$OrganizationDepartment.id$': { [Op.ne]: null } }] },
    { [Op.or]: [{ positionId: null }, { '$OrganizationPosition.id$': { [Op.ne]: null } }] },
  ];
  const own = access.employeeId && await EmployeeOrganizationAssignment.findOne({
    where: { organizationId, employeeId: access.employeeId, ...current(at), [Op.and]: activeStructure },
    attributes: ['employeeId', 'branchId', 'departmentId', 'positionId'], include: includes(organizationId),
  });
  const ownBranch = view === 'employee' || access.grants.filter(g => g.action === 'chart.view').every(g => g.scope === 'OWN');
  const permitted = ownBranch ? { branchId: { [Op.in]: own ? [own.branchId] : [] } } : scopedWhere(access, 'chart.view', 'EmployeeOrganizationAssignment');
  const explicitScope = selectedBranchId != null || selectedDepartmentId != null;
  const visibility = explicitScope ? permitted : { [Op.or]: [permitted, { '$OrganizationBranch.unit_type$': 'HEAD_OFFICE', '$OrganizationPosition.leadership_visible$': true }] };
  const rows = await EmployeeOrganizationAssignment.findAll({
    where: {
      organizationId,
      ...current(at),
      ...(selectedBranchId ? { branchId: selectedBranchId } : {}),
      ...(selectedDepartmentId ? { departmentId: selectedDepartmentId } : {}),
      [Op.and]: [...activeStructure, visibility],
    },
    attributes: ['employeeId', 'branchId', 'departmentId', 'positionId'],
    include: [...includes(organizationId), { model: Employee, required: true, where: { organizationId, status: 'ACTIVE' }, attributes: ['id', 'empCode', 'name', 'photoAssetId'] }],
    order: [[OrganizationBranch, 'displayOrder', 'ASC'], [OrganizationDepartment, 'displayOrder', 'ASC'], [OrganizationPosition, 'displayOrder', 'ASC'], [Employee, 'name', 'ASC'], ['employeeId', 'ASC']],
  });
  // Manual profiles have no lifecycle dates/status; existing rows are active until removed.
  const board = await OrganizationBoardMember.findAll({ where: { organizationId }, attributes: ['id', 'name', 'role', 'roleOther', 'displayOrder', 'photoMimeType'], order: [['displayOrder', 'ASC'], ['id', 'ASC']] });
  const unique = (values) => [...new Map(values.filter(Boolean).map((row) => [row.id, row])).values()];
  const branches = unique(rows.map((row) => pick(row.OrganizationBranch, branchFields)));
  const departments = unique(rows.map((row) => pick(row.OrganizationDepartment, departmentFields)));
  const positions = unique(rows.map((row) => pick(row.OrganizationPosition, positionFields)));
  const revealEmployees = level == null || level === 'employee';
  return {
    at, view, scope: { branchId: selectedBranchId, departmentId: selectedDepartmentId, level }, context: context(own),
    branches,
    departments,
    positions,
    employees: revealEmployees ? rows.map(row => ({
      id: row.Employee.id, empCode: row.Employee.empCode, name: row.Employee.name,
      photoRef: row.Employee.photoAssetId ? `/api/v1/employees/${row.Employee.id}/photo?at=${at}&view=${view}` : null,
      branch: pick(row.OrganizationBranch, branchFields), department: pick(row.OrganizationDepartment, departmentFields), position: pick(row.OrganizationPosition, positionFields),
    })) : [],
    leadership: board.map(row => ({ id: row.id, name: row.name, role: row.role, roleOther: row.roleOther, displayOrder: row.displayOrder, photoRef: row.photoMimeType ? `/api/v1/org/structure/board/${row.id}/photo` : null })),
  };
}

function sendPhoto(res, data, limit) {
  const bytes = data && Buffer.from(data);
  const mimeType = bytes && brand.sniff(bytes);
  if (!bytes?.length || bytes.length > limit || !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) return res.status(404).end();
  try { if (mimeType === 'image/png') brand.assertPngIntegrity(bytes); } catch { return res.status(404).end(); }
  res.set({ 'Content-Type': mimeType, 'Content-Length': String(bytes.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" });
  return res.end(bytes);
}

function photoHandler(kind) {
  return async (req, res) => {
    try {
      if (!/^[1-9]\d*$/.test(req.params.id)) return res.status(404).end();
      const chart = await organizationChart({ actor: req.user, at: req.query.at, view: req.query.view });
      if (kind === 'employee') {
        if (!chart.employees.some(row => String(row.id) === req.params.id)) return res.status(404).end();
        const employee = await Employee.findOne({ where: { id: req.params.id, organizationId: req.user.organizationId, status: 'ACTIVE' }, attributes: ['id', 'photoAssetId'] });
        const photo = employee?.photoAssetId && await EmployeeDocument.findOne({ where: { id: employee.photoAssetId, employeeId: employee.id, docType: 'PHOTO' }, attributes: ['data'] });
        return sendPhoto(res, photo?.data, documents.MAX_BYTES);
      }
      if (!chart.leadership.some(row => String(row.id) === req.params.id)) return res.status(404).end();
      const row = await OrganizationBoardMember.findOne({ where: { id: req.params.id, organizationId: req.user.organizationId }, attributes: ['photoData'] });
      return sendPhoto(res, row?.photoData, brand.LIMITS.BOARD_PHOTO);
    } catch (error) { return res.status(error.status || 500).json({ status: 'error', message: error.status ? error.message : 'Unable to load photo' }); }
  };
}
module.exports = { organizationChart, photoHandler };
