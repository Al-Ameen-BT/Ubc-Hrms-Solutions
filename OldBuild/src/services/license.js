'use strict';

/**
 * Licence seat limits (Organization.maxUsers / maxEmployees). NULL limit =
 * unlimited. Only ACTIVE rows count, so deactivating someone frees a seat.
 * Checked on create and on reactivation — the two ways a seat gets used.
 */

const { User, Employee, Organization } = require('../models');

class LicenseLimitError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.status = 403;
  }
}

async function usage(organizationId) {
  const [users, employees] = await Promise.all([
    User.count({ where: { organizationId, status: 'ACTIVE' } }),
    Employee.count({ where: { organizationId, status: 'ACTIVE' } }),
  ]);
  return { users, employees };
}

async function loadOrg(orgOrId) {
  return typeof orgOrId === 'object' && orgOrId ? orgOrId : Organization.findByPk(orgOrId);
}

async function assertCanAddUser(orgOrId) {
  const org = await loadOrg(orgOrId);
  if (!org || org.maxUsers == null) return;
  const active = await User.count({ where: { organizationId: org.id, status: 'ACTIVE' } });
  if (active >= org.maxUsers) {
    throw new LicenseLimitError(
      'LICENSE_USER_LIMIT',
      `User limit reached: this organisation's licence allows ${org.maxUsers} active user${org.maxUsers === 1 ? '' : 's'}. ` +
      'Deactivate an unused account or ask Banihal Technologies to raise the limit.'
    );
  }
}

async function assertCanAddEmployee(orgOrId) {
  const org = await loadOrg(orgOrId);
  if (!org || org.maxEmployees == null) return;
  const active = await Employee.count({ where: { organizationId: org.id, status: 'ACTIVE' } });
  if (active >= org.maxEmployees) {
    throw new LicenseLimitError(
      'LICENSE_EMPLOYEE_LIMIT',
      `Employee limit reached: this organisation's licence allows ${org.maxEmployees} active employee records. ` +
      'Ask Banihal Technologies to raise the limit.'
    );
  }
}

module.exports = { usage, assertCanAddUser, assertCanAddEmployee, LicenseLimitError };
