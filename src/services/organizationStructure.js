'use strict';
const { Op } = require('sequelize');
const {
  sequelize, Organization, OrganizationBranch: Branch, OrganizationDepartment: Department,
  OrganizationPosition: Position, Employee, EmployeeOrganizationAssignment: Assignment,
  OrganizationResponsibilityAssignment: Responsibility, User, PostCadre, AuditLog,
} = require('../models');
const { branchFields, OrgFieldError } = require('./orgFields');
const { todayIST } = require('./orgAccess');
const { sameId } = require('./organizationAccessPolicy');
const { effectiveAccess, can } = require('./accessControl');
const { invalidateUserAccess } = require('./userAdmin');

const current = at => ({ status: 'ACTIVE', effectiveFrom: { [Op.lte]: at }, [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: at } }] });
const live = at => ({ status: 'ACTIVE', [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: at } }] });
const fail = message => { throw new OrgFieldError(message); };
const equal = (a, b) => a == null && b == null || sameId(a, b);
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('Invalid effective date (YYYY-MM-DD required)');
  return value;
}
function dates(data) {
  const effectiveFrom = date(data.effectiveFrom), effectiveTo = data.effectiveTo == null ? null : date(data.effectiveTo);
  if (effectiveTo && effectiveTo < effectiveFrom) fail('Effective date range is reversed');
  return { effectiveFrom, effectiveTo };
}
function text(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`${label} must contain 1–${max} characters`);
  return value.trim();
}
function id(value, label) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail(`${label} must be a valid identifier`);
  return Number(value);
}
async function row(Model, value, organizationId, transaction, active = false) {
  const result = await Model.findOne({ where: { id: id(value, Model.name), organizationId }, transaction, lock: transaction.LOCK.UPDATE });
  if (!result) fail(`${Model.name} not found`);
  if (active && result.status !== 'ACTIVE') fail(`${Model.name} must be active`);
  return result;
}
async function locked(options, work) {
  if (!options.transaction) return sequelize.transaction(transaction => locked({ ...options, transaction }, work));
  const { transaction } = options;
  const organizationId = id(options.organizationId, 'Organisation');
  // Every structure writer takes this lock first, including rows not created yet.
  const organization = await Organization.findByPk(organizationId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!organization) fail('Organisation not found');
  return work({ ...options, organizationId, organization });
}
async function authorize(options, permission) {
  const actor = options.actor && await row(User, options.actor.id, options.organizationId, options.transaction, true);
  if (!actor || !can(await effectiveAccess(actor.id, todayIST(), options.transaction), permission)) {
    const error = new OrgFieldError('Not authorized: organisation structure permission required'); error.status = 403; throw error;
  }
}
async function audit(options, action, target, details = null) {
  await AuditLog.create({ organizationId: options.organizationId, actorUserId: options.actor?.id || null, action, targetType: target.constructor.name, targetId: String(target.id), details }, { transaction: options.transaction });
}
async function mutate(options, permission, work) {
  return locked(options, async o => {
    await authorize(o, permission);
    const before = await accessStates(o, todayIST());
    const result = await work(o);
    await reconcileLocked(o, todayIST(), before);
    return result;
  });
}
function standardFields(data, existing, ownership = ['branchId']) {
  const out = {};
  for (const key of ['code', 'name']) if (data[key] !== undefined || !existing) out[key] = text(data[key], key, key === 'code' ? 32 : 255);
  if (out.code) out.code = out.code.toUpperCase();
  for (const key of ownership) if (data[key] !== undefined || !existing) out[key] = id(data[key], key);
  if (data.status !== undefined) {
    if (!['ACTIVE', 'INACTIVE'].includes(data.status)) fail('Invalid status');
    out.status = data.status;
  }
  if (data.displayOrder !== undefined) {
    if (!Number.isInteger(data.displayOrder) || data.displayOrder < 0) fail('displayOrder must be a nonnegative integer');
    out.displayOrder = data.displayOrder;
  }
  return out;
}
async function unique(Model, values, keys, o, exceptId) {
  for (const key of keys) {
    if (values[key] == null) continue;
    const where = { organizationId: o.organizationId, [key]: values[key] };
    if (Model !== Branch) where.branchId = values.branchId;
    if (exceptId) where.id = { [Op.ne]: exceptId };
    if (await Model.findOne({ where, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE })) fail(`${key} already exists in this unit`);
  }
}
async function hasDependents(Model, where, o, label, dated = false) {
  if (await Model.findOne({ where: { organizationId: o.organizationId, ...where, ...(dated ? live(todayIST()) : { status: 'ACTIVE' }) }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE })) fail(`Active dependent ${label} must be reassigned or deactivated first`);
}
async function branchValues(data, existing, o, headOffice) {
  if (data.unitType !== undefined && data.unitType !== (headOffice ? 'HEAD_OFFICE' : 'BRANCH') || data.isHeadOffice !== undefined && data.isHeadOffice !== headOffice) fail('Head Office requires the explicit initial configuration workflow; unit conversion is not allowed');
  const values = { ...(existing?.toJSON() || {}), ...branchFields(data), ...standardFields({ ...data, code: data.code ?? data.branchCode }, existing, []) };
  values.unitType = headOffice ? 'HEAD_OFFICE' : 'BRANCH'; values.isHeadOffice = headOffice;
  if (!values.number) fail('Branch number is required');
  if (headOffice && values.status === 'INACTIVE') fail('Head Office cannot be deactivated');
  await unique(Branch, values, ['code', 'number'], o, existing?.id);
  return values;
}
async function configureHeadOffice(options) {
  return mutate(options, 'branches.manage', async o => {
    if (await Branch.findOne({ where: { organizationId: o.organizationId, status: 'ACTIVE', [Op.or]: [{ unitType: 'HEAD_OFFICE' }, { isHeadOffice: true }] }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE })) fail('An active Head Office is already configured');
    const values = await branchValues(o.data || {}, null, o, true);
    const result = await Branch.create({ ...values, organizationId: o.organizationId }, { transaction: o.transaction });
    await audit(o, 'org.headOffice.configure', result); return result;
  });
}
async function createBranch(options) {
  return mutate(options, 'branches.manage', async o => {
    const values = await branchValues(o.data || {}, null, o, false);
    if ((await Branch.findAll({ where: { organizationId: o.organizationId, unitType: 'HEAD_OFFICE', status: 'ACTIVE' }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE })).length !== 1) fail('Configure exactly one active Head Office first');
    const result = await Branch.create({ ...values, organizationId: o.organizationId }, { transaction: o.transaction });
    await audit(o, 'org.branch.create', result); return result;
  });
}
async function updateBranch(options) {
  return mutate(options, 'branches.manage', async o => {
    const result = await row(Branch, o.id, o.organizationId, o.transaction);
    const values = await branchValues(o.data || {}, result, o, result.unitType === 'HEAD_OFFICE' || result.isHeadOffice);
    if (values.status === 'INACTIVE') {
      await hasDependents(Department, { branchId: result.id }, o, 'departments');
      await hasDependents(Position, { branchId: result.id }, o, 'positions');
      await hasDependents(Assignment, { branchId: result.id }, o, 'assignments', true);
      await hasDependents(Responsibility, { branchId: result.id }, o, 'responsibilities', true);
    }
    await result.update(values, { transaction: o.transaction }); await audit(o, 'org.branch.update', result); return result;
  });
}
const deactivateBranch = options => updateBranch({ ...options, data: { status: 'INACTIVE' } });
async function departmentWrite(options, creating) {
  return mutate(options, 'departments.manage', async o => {
    const existing = creating ? null : await row(Department, o.id, o.organizationId, o.transaction);
    const fields = standardFields(o.data || {}, existing), values = { ...existing?.toJSON(), ...fields };
    await row(Branch, values.branchId, o.organizationId, o.transaction, true);
    if (existing && (!sameId(existing.branchId, values.branchId) || values.status === 'INACTIVE')) {
      await hasDependents(Position, { departmentId: existing.id }, o, 'positions');
      await hasDependents(Assignment, { departmentId: existing.id }, o, 'assignments', true);
    }
    await unique(Department, values, ['code', 'name'], o, existing?.id);
    const result = existing ? await existing.update(fields, { transaction: o.transaction }) : await Department.create({ ...fields, organizationId: o.organizationId }, { transaction: o.transaction });
    await audit(o, `org.department.${creating ? 'create' : 'update'}`, result); return result;
  });
}
const createDepartment = o => departmentWrite(o, true);
const updateDepartment = o => departmentWrite(o, false);
const deactivateDepartment = o => updateDepartment({ ...o, data: { status: 'INACTIVE' } });
async function validateOwnership(values, o) {
  const branch = await row(Branch, values.branchId, o.organizationId, o.transaction, true);
  const department = values.departmentId == null ? null : await row(Department, values.departmentId, o.organizationId, o.transaction, true);
  if (department && !sameId(department.branchId, branch.id)) fail('Department must belong to the selected branch');
  const position = values.positionId == null ? null : await row(Position, values.positionId, o.organizationId, o.transaction, true);
  if (position && (!sameId(position.branchId, branch.id) || !sameId(position.departmentId, department?.id))) fail('Position must belong to the selected department and branch');
  return { branch, department, position };
}
async function validateParent(values, o, existing) {
  if (values.reportsToPositionId == null) return;
  let parent = await row(Position, values.reportsToPositionId, o.organizationId, o.transaction, true);
  if (!sameId(parent.branchId, values.branchId)) {
    const branch = await row(Branch, parent.branchId, o.organizationId, o.transaction, true);
    if (branch.unitType !== 'HEAD_OFFICE' || !parent.leadershipVisible) fail('Cross-unit reporting requires active Head Office leadership');
  }
  const seen = new Set(existing ? [String(existing.id)] : []);
  while (parent) {
    if (seen.has(String(parent.id))) fail('Position reporting cycle is not allowed');
    seen.add(String(parent.id));
    parent = parent.reportsToPositionId == null ? null : await row(Position, parent.reportsToPositionId, o.organizationId, o.transaction, true);
  }
}
function checkCapacity(assignments, capacity) {
  const events = [];
  for (const a of assignments) {
    events.push([a.effectiveFrom, 1]);
    if (a.effectiveTo) events.push([a.effectiveTo, -1]);
  }
  // Starts precede ends on the same inclusive date.
  events.sort((a, b) => a[0].localeCompare(b[0]) || b[1] - a[1]);
  let occupied = 0;
  for (const [, delta] of events) if ((occupied += delta) > capacity) fail('Position capacity exceeded for overlapping effective assignments');
}
async function positionWrite(options, creating) {
  return mutate(options, 'positions.manage', async o => {
    const existing = creating ? null : await row(Position, o.id, o.organizationId, o.transaction);
    const data = o.data || {}, fields = standardFields(data, existing, ['branchId', 'departmentId']);
    for (const key of ['postCadreId', 'reportsToPositionId']) if (data[key] !== undefined) fields[key] = data[key] == null ? null : id(data[key], key);
    if (data.capacity !== undefined) {
      if (!Number.isInteger(data.capacity) || data.capacity < 1) fail('Position capacity must be a positive integer');
      fields.capacity = data.capacity;
    }
    if (data.leadershipVisible !== undefined) {
      if (typeof data.leadershipVisible !== 'boolean') fail('leadershipVisible must be boolean');
      fields.leadershipVisible = data.leadershipVisible;
    }
    const values = { capacity: 1, leadershipVisible: false, ...existing?.toJSON(), ...fields };
    const { branch } = await validateOwnership(values, o);
    if (values.leadershipVisible && branch.unitType !== 'HEAD_OFFICE') fail('Leadership visibility is valid only for Head Office positions');
    if (values.postCadreId != null) await row(PostCadre, values.postCadreId, o.organizationId, o.transaction);
    await validateParent(values, o, existing);
    if (existing) {
      const assignments = await Assignment.findAll({ where: { organizationId: o.organizationId, positionId: existing.id, ...live(todayIST()) }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
      checkCapacity(assignments, values.capacity);
      if (!sameId(existing.branchId, values.branchId) || !sameId(existing.departmentId, values.departmentId) || values.status === 'INACTIVE') {
        if (assignments.length) fail('Active dependent assignments must be reassigned first');
      }
      const children = await Position.findAll({ where: { organizationId: o.organizationId, reportsToPositionId: existing.id, status: 'ACTIVE' }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
      if (children.length && values.status === 'INACTIVE') fail('Active dependent reporting positions must be reassigned first');
      for (const child of children) if (!sameId(child.branchId, values.branchId) && (branch.unitType !== 'HEAD_OFFICE' || !values.leadershipVisible)) fail('Reporting positions require Head Office leadership');
    }
    await unique(Position, values, ['code'], o, existing?.id);
    const result = existing ? await existing.update(fields, { transaction: o.transaction }) : await Position.create({ ...fields, organizationId: o.organizationId }, { transaction: o.transaction });
    await audit(o, `org.position.${creating ? 'create' : 'update'}`, result); return result;
  });
}
const createPosition = o => positionWrite(o, true);
const updatePosition = o => positionWrite(o, false);
const deactivatePosition = o => updatePosition({ ...o, data: { status: 'INACTIVE' } });
const overlaps = (a, b) => (!a.effectiveTo || a.effectiveTo >= b.effectiveFrom) && (!b.effectiveTo || b.effectiveTo >= a.effectiveFrom);
async function assignEmployeeOrganization(options) {
  return mutate(options, 'assignments.manage', async o => {
    const data = o.data || {}, range = dates(data);
    await row(Employee, data.employeeId, o.organizationId, o.transaction, true);
    const { branch, department, position } = await validateOwnership(data, o);
    const previous = await Assignment.findAll({ where: { organizationId: o.organizationId, employeeId: data.employeeId, status: 'ACTIVE' }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
    if (previous.some(a => overlaps(a, range))) fail('Employee primary assignment dates must not overlap');
    if (position) {
      const occupants = await Assignment.findAll({ where: { organizationId: o.organizationId, positionId: position.id, status: 'ACTIVE' }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
      checkCapacity([...occupants, range], position.capacity);
    }
    const result = await Assignment.create({ organizationId: o.organizationId, employeeId: data.employeeId, branchId: branch.id, departmentId: department?.id || null, positionId: position?.id || null, ...range, assignedBy: o.actor.id }, { transaction: o.transaction });
    await audit(o, 'org.assignment.create', result); return result;
  });
}
async function assignResponsibility(options) {
  return mutate(options, 'assignments.manage', async o => {
    const data = o.data || {}, range = dates(data);
    if (!['BRANCH_MANAGER', 'SENIOR_MANAGER', 'GENERAL_MANAGER'].includes(data.responsibility)) fail('Unknown controlled responsibility');
    if (!['BRANCH', 'ORGANISATION'].includes(data.scopeType) || data.responsibility === 'BRANCH_MANAGER' && data.scopeType !== 'BRANCH' || data.responsibility === 'GENERAL_MANAGER' && data.scopeType !== 'ORGANISATION') fail('Invalid responsibility scope');
    const employee = await row(Employee, data.employeeId, o.organizationId, o.transaction, true);
    if (data.userId != null) {
      const user = await row(User, data.userId, o.organizationId, o.transaction, true);
      if (!sameId(user.employeeId, employee.id)) fail('Responsibility user must link to the selected employee');
    }
    const branchId = data.scopeType === 'BRANCH' ? (await row(Branch, data.branchId, o.organizationId, o.transaction, true)).id : null;
    if (data.scopeType === 'ORGANISATION' && data.branchId != null) fail('Organisation responsibility scope cannot carry a branch');
    const existing = await Responsibility.findAll({ where: { organizationId: o.organizationId, responsibility: data.responsibility, status: 'ACTIVE', [Op.or]: [{ scopeType: data.scopeType, branchId }, { employeeId: employee.id }] }, transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
    if (existing.some(a => overlaps(a, range))) fail('Responsibility effective dates overlap an existing assignment');
    const result = await Responsibility.create({ organizationId: o.organizationId, employeeId: employee.id, userId: data.userId || null, responsibility: data.responsibility, scopeType: data.scopeType, branchId, ...range, assignedBy: o.actor.id }, { transaction: o.transaction });
    await audit(o, 'org.responsibility.assign', result); return result;
  });
}
async function currentResponsibility({ organizationId, employeeId, userId, responsibility, branchId, at = todayIST(), transaction }) {
  const where = { organizationId: id(organizationId, 'Organisation'), ...current(date(at)) };
  if (employeeId != null) where.employeeId = id(employeeId, 'Employee');
  if (userId != null) where.userId = id(userId, 'User');
  if (responsibility != null) where.responsibility = responsibility;
  if (branchId != null) where[Op.and] = [{ [Op.or]: [{ scopeType: 'ORGANISATION' }, { scopeType: 'BRANCH', branchId: id(branchId, 'Branch') }] }];
  const results = await Responsibility.findAll({ where, transaction });
  const valid = [];
  for (const result of results) {
    if (!await Employee.count({ where: { id: result.employeeId, organizationId, status: 'ACTIVE' }, transaction })) continue;
    if (result.userId && !await User.count({ where: { id: result.userId, employeeId: result.employeeId, organizationId, status: 'ACTIVE' }, transaction })) continue;
    if (result.scopeType === 'BRANCH' && !await Branch.count({ where: { id: result.branchId, organizationId, status: 'ACTIVE' }, transaction })) continue;
    valid.push(result);
  }
  if (valid.length > 1) fail('Ambiguous current responsibility; specify employee and responsibility scope');
  return valid[0] || null;
}
async function accessStates(o, at) {
  const users = await User.findAll({ where: { organizationId: o.organizationId }, order: [['id', 'ASC']], transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
  const states = new Map();
  for (const user of users) {
    const access = await effectiveAccess(user.id, at, o.transaction);
    const grants = [...new Set(access.grants.map(g => JSON.stringify({ action: g.action, scope: g.scope, branchIds: [...g.branchIds].sort((a, b) => a - b), departmentIds: [...g.departmentIds].sort((a, b) => a - b) })))].sort();
    const signature = JSON.stringify(grants);
    states.set(user.id, { user, signature });
  }
  return states;
}
async function reconcileLocked(o, at, before) {
  // Role dates are evaluated live; role-assignment writes own their invalidation.
  const assignments = await Assignment.findAll({ where: { organizationId: o.organizationId, status: 'ACTIVE' }, order: [['id', 'ASC']], transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
  const employees = await Employee.findAll({ where: { organizationId: o.organizationId, [Op.or]: [{ id: { [Op.in]: assignments.map(a => a.employeeId) } }, { branchId: { [Op.ne]: null } }, { departmentId: { [Op.ne]: null } }, { positionId: { [Op.ne]: null } }] }, order: [['id', 'ASC']], transaction: o.transaction, lock: o.transaction.LOCK.UPDATE });
  const changedEmployees = new Set();
  const positions = new Map();
  for (const employee of employees) {
    const ledger = assignments.filter(a => sameId(a.employeeId, employee.id));
    ledger.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    for (let i = 1; i < ledger.length; i++) if (overlaps(ledger[i - 1], ledger[i])) fail('Employee primary assignment dates overlap');
    const currentAssignments = ledger.filter(a => a.effectiveFrom <= at && (!a.effectiveTo || a.effectiveTo >= at));
    const assignment = employee.status === 'ACTIVE' ? currentAssignments[0] : null;
    const owned = assignment ? await validateOwnership(assignment, o) : {};
    if (owned.position) {
      const occupants = positions.get(owned.position.id) || [];
      occupants.push(assignment); positions.set(owned.position.id, occupants);
      if (occupants.length > owned.position.capacity) fail('Position capacity exceeded by current assignments');
    }
    const pointers = { branchId: owned.branch?.id || null, departmentId: owned.department?.id || null, positionId: owned.position?.id || null };
    if (Object.entries(pointers).some(([key, value]) => !equal(employee[key], value))) changedEmployees.add(String(employee.id));
    // Preserve unresolved legacy labels until an identifier has actually been mapped.
    const fields = {
      ...pointers,
      branchName: owned.branch ? owned.branch.name : employee.branchId == null ? employee.branchName : null,
      branchCode: owned.branch ? owned.branch.code : employee.branchId == null ? employee.branchCode : null,
      department: owned.department ? owned.department.name : employee.departmentId == null ? employee.department : null,
      designation: owned.position ? owned.position.name : employee.positionId == null ? employee.designation : null,
    };
    if (Object.entries(fields).some(([key, value]) => !equal(employee[key], value))) await employee.update(fields, { transaction: o.transaction });
  }
  const states = await accessStates(o, at), affected = [];
  for (const [userId, state] of states) {
    const accessChanged = before?.has(userId) && before.get(userId).signature !== state.signature;
    if (accessChanged || changedEmployees.has(String(state.user.employeeId))) affected.push(userId);
  }
  await invalidateUserAccess(affected, { transaction: o.transaction, reason: 'organisation.assignments.changed', actor: o.actor });
  return { employeeIds: [...changedEmployees].map(Number), userIds: affected };
}
async function reconcileEffectiveAssignments(options) {
  return locked(options, o => reconcileLocked(o, date(o.at || todayIST())));
}
module.exports = {
  configureHeadOffice, createBranch, updateBranch, deactivateBranch,
  createDepartment, updateDepartment, deactivateDepartment, createPosition, updatePosition, deactivatePosition,
  assignEmployeeOrganization, assignResponsibility, currentResponsibility, reconcileEffectiveAssignments,
};
