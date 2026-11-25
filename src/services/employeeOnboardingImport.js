'use strict';

const { Op } = require('sequelize');
const {
  sequelize, Organization, Employee, User, PostCadre, OrganizationBranch,
  OrganizationDepartment, OrganizationPosition, EmployeeOrganizationAssignment,
  OrganizationRole, OrganizationRolePermission, UserRoleAssignment, AuditLog,
  EmployeeOfficeInformation, EmployeeServiceInformation, EmployeeContactAddress,
  EmployeeBankAccount,
} = require('../models');
const { hashPassword, generateTempPassword } = require('./authService');
const { template } = require('./permissionCatalog');
const { can } = require('./accessControl');
const { normalizeEmployeeMasterData, hasValues } = require('./employeeMasterData');

class EmployeeOnboardingImportError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const yes = value => ['YES', 'Y', 'TRUE', '1'].includes(String(value || '').trim().toUpperCase());
const no = value => ['', 'NO', 'N', 'FALSE', '0'].includes(String(value || '').trim().toUpperCase());
const clean = value => String(value || '').trim();
const upper = value => clean(value).toUpperCase();
const validDate = value => {
  const text = clean(value);
  if (!datePattern.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
};

function summarize(rows) { return { total: rows.length, valid: rows.filter(row => !row.errors.length).length, invalid: rows.filter(row => row.errors.length).length }; }

async function validatePreview(inputRows, { organizationId, source, access }) {
  if (!Array.isArray(inputRows) || !inputRows.length) throw new EmployeeOnboardingImportError('Workbook contains no employee rows.');
  if (inputRows.length > 1000) throw new EmployeeOnboardingImportError('At most 1000 employee rows may be imported at once.');
  const organization = await Organization.findByPk(organizationId);
  if (!organization) throw new EmployeeOnboardingImportError('Organisation not found.', 404);
  const [posts, branches, departments, positions, employees, users] = await Promise.all([
    PostCadre.findAll({ where: { organizationId, status: 'ACTIVE' } }),
    OrganizationBranch.findAll({ where: { organizationId, status: 'ACTIVE' } }),
    OrganizationDepartment.findAll({ where: { organizationId, status: 'ACTIVE' } }),
    OrganizationPosition.findAll({ where: { organizationId, status: 'ACTIVE' } }),
    Employee.findAll({ where: { organizationId }, attributes: ['empCode'] }),
    User.findAll({ where: { organizationId }, attributes: ['email'] }),
  ]);
  const postByCode = new Map(posts.map(row => [upper(row.code), row]));
  const branchByCode = new Map(branches.map(row => [upper(row.code), row]));
  const existingCodes = new Set(employees.map(row => upper(row.empCode)));
  const existingEmails = new Set(users.map(row => clean(row.email).toLowerCase()));
  const batchCodes = new Set(), batchEmails = new Set();
  const rows = inputRows.map((raw, index) => {
    const errors = [], values = { ...raw };
    values.empCode = upper(raw.empCode); values.name = clean(raw.name); values.postCode = upper(raw.postCode);
    values.branchCode = upper(raw.branchCode); values.departmentCode = upper(raw.departmentCode); values.positionCode = upper(raw.positionCode);
    values.loginEmail = clean(raw.loginEmail).toLowerCase(); values.createLogin = yes(raw.createLogin);
    values.panNumber = upper(raw.panNumber);
    values.aadhaarNumber = clean(raw.aadhaarNumber).replace(/\s+/g, '');
    values.uanNumber = clean(raw.uanNumber).replace(/\s+/g, '');
    values.pfNumber = clean(raw.pfNumber);
    if (!values.empCode) errors.push('Employee Code is required.');
    else if (existingCodes.has(values.empCode) || batchCodes.has(values.empCode)) errors.push('Employee Code already exists or is duplicated in this workbook.');
    batchCodes.add(values.empCode);
    if (!values.name) errors.push('Full Name is required.');
    if (!validDate(raw.doj)) errors.push('Date of Joining must be a valid date in YYYY-MM-DD format.');
    if (raw.dob && !validDate(raw.dob)) errors.push('Date of Birth must be a valid date in YYYY-MM-DD format.');
    if (raw.doa && !validDate(raw.doa)) errors.push('Date of Appointment must be a valid date in YYYY-MM-DD format.');
    if (validDate(raw.dob) && validDate(raw.doj) && clean(raw.dob) >= clean(raw.doj)) errors.push('Date of Birth must be before Date of Joining.');
    if (validDate(raw.doa) && validDate(raw.doj) && clean(raw.doa) < clean(raw.doj)) errors.push('Date of Appointment must not be before Date of Joining.');
    if (values.panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(values.panNumber)) errors.push('PAN Number must use the format AAAAA0000A.');
    if (values.aadhaarNumber && !/^\d{12}$/.test(values.aadhaarNumber)) errors.push('Aadhaar Number must contain exactly 12 digits.');
    if (values.uanNumber && !/^\d{12}$/.test(values.uanNumber)) errors.push('UAN Number must contain exactly 12 digits.');
    if (!clean(raw.educationalQualification)) errors.push('Educational Qualification is required.');
    if (!yes(raw.educationVerified)) errors.push('Education Verified must be YES.');
    const post = postByCode.get(values.postCode);
    if (!post) errors.push('Post Code was not found in this organisation.');
    const branch = values.branchCode ? branchByCode.get(values.branchCode) : null;
    if (values.branchCode && !branch) errors.push('Branch Code was not found in this organisation.');
    const department = branch && departments.find(row => row.branchId === branch.id && upper(row.code) === values.departmentCode);
    if (values.departmentCode && !department) errors.push('Department Code does not belong to the selected branch.');
    const position = branch && department && positions.find(row => row.branchId === branch.id && row.departmentId === department.id && upper(row.code) === values.positionCode);
    if (values.positionCode && !position) errors.push('Position Code does not belong to the selected branch and department.');
    if (position && access && !can(access, 'people.create', position)) errors.push('Position is outside your permitted organisation scope.');
    if (position?.postCadreId && post && position.postCadreId !== post.id) errors.push('Position and Post Code refer to different cadres.');
    if (organization.accessControlMode === 'PERMISSIONS' && (!branch || !department || !position)) errors.push('Branch, Department and Position are required in permission mode.');
    if (!no(raw.createLogin) && !values.createLogin) errors.push('Create Login must be YES or NO.');
    if (values.createLogin) {
      if (!emailPattern.test(values.loginEmail)) errors.push('A valid Login Email is required when Create Login is YES.');
      else if (existingEmails.has(values.loginEmail) || batchEmails.has(values.loginEmail)) errors.push('Login Email already exists or is duplicated in this workbook.');
      batchEmails.add(values.loginEmail);
    }
    const masterData = normalizeEmployeeMasterData(raw, { dob: raw.dob, doj: raw.doj });
    errors.push(...masterData.errors);
    values.masterData = { office: masterData.office, service: masterData.service, contacts: masterData.contacts };
    Object.assign(values, { postCadreId: post?.id || null, branchId: branch?.id || null, departmentId: department?.id || null, positionId: position?.id || null, educationVerified: true });
    return { sourceRow: index + 3, naturalKey: `EMPLOYEE:${values.empCode}`, values, errors, warnings: [] };
  });
  return { schemaVersion: 'employee-onboarding-v1', source, organizationId, rows, summary: summarize(rows) };
}

async function protectedEmployeeRole(organizationId, transaction) {
  const definition = template('EMPLOYEE');
  const [role] = await OrganizationRole.findOrCreate({
    where: { organizationId, code: 'EMPLOYEE' },
    defaults: { name: definition.name, templateCode: 'EMPLOYEE', isProtected: true },
    transaction,
  });
  if (!role.isProtected || role.templateCode !== 'EMPLOYEE' || role.status !== 'ACTIVE') throw new EmployeeOnboardingImportError('Protected EMPLOYEE role is not available.', 409);
  for (const permissionCode of definition.permissionCodes) await OrganizationRolePermission.findOrCreate({ where: { organizationId, roleId: role.id, permissionCode }, transaction });
  return role;
}

async function applyPreview(preview, actor, access) {
  if (String(preview.organizationId) !== String(actor.organizationId)) throw new EmployeeOnboardingImportError('Import preview belongs to another organisation.', 403);
  const results = [], credentials = [];
  for (const item of preview.rows) {
    if (item.errors.length) { results.push({ naturalKey: item.naturalKey, status: 'INVALID', errors: item.errors }); continue; }
    const tempPassword = item.values.createLogin ? generateTempPassword() : null;
    try {
      const created = await sequelize.transaction(async transaction => {
        const organization = await Organization.findByPk(actor.organizationId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!organization) throw new EmployeeOnboardingImportError('Organisation not found.', 404);
        if (organization.maxEmployees != null && await Employee.count({ where: { organizationId: organization.id, status: 'ACTIVE' }, transaction }) >= organization.maxEmployees) throw new EmployeeOnboardingImportError('Employee limit reached.', 403);
        if (item.values.createLogin && organization.maxUsers != null && await User.count({ where: { organizationId: organization.id, status: 'ACTIVE' }, transaction }) >= organization.maxUsers) throw new EmployeeOnboardingImportError('User limit reached.', 403);
        const existingEmployee = await Employee.findOne({ where: { organizationId: organization.id, empCode: item.values.empCode }, transaction, lock: transaction.LOCK.UPDATE });
        if (existingEmployee) {
          const priorImport = await AuditLog.findOne({ where: { organizationId: organization.id, action: 'employee-onboarding-import.apply', targetType: 'employee', targetId: String(existingEmployee.id) }, transaction, order: [['id', 'DESC']] });
          if (priorImport?.details?.sourceSha256 === preview.source.sha256) return { status: 'UNCHANGED' };
          throw new EmployeeOnboardingImportError('Employee Code was created after this preview; preview the workbook again.', 409);
        }
        const position = item.values.positionId && await OrganizationPosition.findOne({ where: { id: item.values.positionId, organizationId: organization.id, branchId: item.values.branchId, departmentId: item.values.departmentId, status: 'ACTIVE' }, transaction, lock: transaction.LOCK.UPDATE });
        if (organization.accessControlMode === 'PERMISSIONS' && !position) throw new EmployeeOnboardingImportError('Organisation assignment changed; preview the workbook again.', 409);
        if (position && access && !can(access, 'people.create', position)) throw new EmployeeOnboardingImportError('Position is outside your permitted organisation scope.', 403);
        if (position) {
          const occupied = await EmployeeOrganizationAssignment.count({ where: { organizationId: organization.id, positionId: position.id, status: 'ACTIVE', effectiveTo: null }, transaction });
          if (occupied >= position.capacity) throw new EmployeeOnboardingImportError('Selected position has reached its occupant capacity.', 409);
        }
        const v = item.values;
        const employee = await Employee.create({
          organizationId: organization.id, empCode: v.empCode, name: v.name, dob: v.dob || null, doj: v.doj, doa: v.doa || null,
          postCadreId: v.postCadreId, branchId: v.branchId, departmentId: v.departmentId, positionId: v.positionId,
          branchCode: v.branchCode || null, designation: v.designation || null,
          employmentType: v.employmentType === 'PART_TIME_CONTINGENT' ? 'PART_TIME_CONTINGENT' : 'REGULAR',
          gender: ['MALE', 'FEMALE', 'OTHER'].includes(upper(v.gender)) ? upper(v.gender) : null,
          educationalQualification: clean(v.educationalQualification), educationVerified: true,
          officeEmail: clean(v.officeEmail) || null, personalEmail: clean(v.personalEmail) || null,
          panNumber: clean(v.panNumber) || null, aadhaarNumber: clean(v.aadhaarNumber) || null, uanNumber: clean(v.uanNumber) || null, pfNumber: clean(v.pfNumber) || null,
          bankName: clean(v.bankName) || null, bankAccountNumber: clean(v.bankAccountNumber) || null, bankIfsc: upper(v.bankIfsc) || null,
          dateOfConfirmation: v.masterData.service.confirmationDate,
          lastPromotionDate: v.masterData.service.lastPromotionDate,
          dateOfRetirement: v.masterData.service.retirementDate,
          physicallyHandicapped: v.masterData.office.selfHandicap,
        }, { transaction });
        if (hasValues(v.masterData.office)) await EmployeeOfficeInformation.create({ employeeId: employee.id, ...v.masterData.office }, { transaction });
        if (hasValues(v.masterData.service)) await EmployeeServiceInformation.create({ employeeId: employee.id, ...v.masterData.service }, { transaction });
        for (const contact of v.masterData.contacts) await EmployeeContactAddress.create({ employeeId: employee.id, ...contact }, { transaction });
        const accountNumber = v.masterData.office.salaryAccountNumber || clean(v.bankAccountNumber) || null;
        if (accountNumber) {
          const cbsType = upper(v.masterData.office.cbsAccountType);
          const accountType = ['OD', 'OVERDRAFT'].includes(cbsType) ? 'OD' : ['RD', 'RECURRING DEPOSIT'].includes(cbsType) ? 'RD' : ['SB', 'SAVINGS', 'SAVINGS BANK'].includes(cbsType) ? 'SB' : 'OTHER';
          const account = await EmployeeBankAccount.create({
            employeeId: employee.id, accountType,
            bankName: v.masterData.office.salaryBankName || clean(v.bankName) || null,
            accountNumber, ifsc: upper(v.bankIfsc) || null,
            cbsBranchCode: v.masterData.office.cbsBranchCode,
            cbsAccountType: v.masterData.office.cbsAccountType,
            payMode: v.masterData.office.payMode,
          }, { transaction });
          await employee.update({ salaryCreditAccountId: account.id }, { transaction });
        }
        if (v.branchId) await EmployeeOrganizationAssignment.create({ organizationId: organization.id, employeeId: employee.id, branchId: v.branchId, departmentId: v.departmentId, positionId: v.positionId, effectiveFrom: v.doj, assignedBy: actor.id }, { transaction });
        let user = null;
        if (v.createLogin) {
          if (await User.count({ where: { email: v.loginEmail }, transaction })) throw new EmployeeOnboardingImportError('Login Email already exists.', 409);
          user = await User.create({ organizationId: organization.id, employeeId: employee.id, email: v.loginEmail, name: employee.name, role: 'EMPLOYEE', passwordHash: await hashPassword(tempPassword), mustChangePassword: true, status: 'ACTIVE' }, { transaction });
          const role = await protectedEmployeeRole(organization.id, transaction);
          await UserRoleAssignment.create({ organizationId: organization.id, userId: user.id, roleId: role.id, scopeType: 'OWN', effectiveFrom: v.doj, assignedBy: actor.id }, { transaction });
        }
        await AuditLog.create({ organizationId: organization.id, actorUserId: actor.id, actorEmail: actor.email, action: 'employee-onboarding-import.apply', targetType: 'employee', targetId: String(employee.id), details: { empCode: employee.empCode, userId: user?.id || null, role: user ? 'EMPLOYEE' : null, sourceSha256: preview.source.sha256 } }, { transaction });
        return { status: 'CREATED', employeeId: employee.id, userId: user?.id || null };
      });
      results.push({ naturalKey: item.naturalKey, ...created });
      if (created.userId) credentials.push({ employeeCode: item.values.empCode, email: item.values.loginEmail, temporaryPassword: tempPassword });
    } catch (error) { results.push({ naturalKey: item.naturalKey, status: 'FAILED', errors: [error.message] }); }
  }
  return { results, credentials, summary: { total: results.length, created: results.filter(row => row.status === 'CREATED').length, unchanged: results.filter(row => row.status === 'UNCHANGED').length, invalid: results.filter(row => row.status === 'INVALID').length, failed: results.filter(row => row.status === 'FAILED').length } };
}

module.exports = { EmployeeOnboardingImportError, validatePreview, applyPreview };
