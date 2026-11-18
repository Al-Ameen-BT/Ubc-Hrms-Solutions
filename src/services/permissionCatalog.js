'use strict';

// Server-owned ceilings: tenant role copies select a subset, never invent powers.
const ALL_SCOPES = ['OWN', 'DEPARTMENT', 'SELECTED_BRANCHES', 'ORGANISATION'];
const MANAGEMENT_SCOPES = ALL_SCOPES.slice(1);
const definitions = [
  ['structure', ['view', 'manage'], ['ORGANISATION']],
  ['branches', ['view', 'manage'], ['ORGANISATION']],
  ['departments', ['view', 'manage'], MANAGEMENT_SCOPES],
  ['positions', ['view', 'manage'], ['ORGANISATION']],
  ['assignments', ['view', 'manage'], ['ORGANISATION']],
  ['transfers', ['view', 'manage'], ['ORGANISATION']],
  ['people', ['view', 'create', 'edit', 'export'], MANAGEMENT_SCOPES],
  ['hr', ['view', 'manage'], MANAGEMENT_SCOPES],
  ['leave', ['view', 'manage', 'approve'], ALL_SCOPES],
  ['attendance', ['view', 'manage'], ALL_SCOPES],
  ['documents', ['view', 'manage'], ALL_SCOPES],
  ['payroll', ['view', 'prepare', 'approve', 'export'], ['ORGANISATION']],
  ['arrears', ['view', 'prepare', 'approve'], ['ORGANISATION']],
  ['compensation', ['view', 'prepare', 'approve'], ['ORGANISATION']],
  ['financialChanges', ['view', 'prepare', 'approve'], ['ORGANISATION']],
  ['expenses', ['view', 'approve'], ['ORGANISATION']],
  ['payments', ['view', 'pay', 'export'], ['ORGANISATION']],
  ['settings', ['view', 'configure'], ['ORGANISATION']],
  ['roles', ['manage'], ['ORGANISATION']],
  ['users', ['manage'], ['ORGANISATION']],
  ['audit', ['view'], ['ORGANISATION']],
  ['chart', ['view'], ALL_SCOPES],
  ['geofence', ['view', 'manage'], ['SELECTED_BRANCHES', 'ORGANISATION']],
  ['dpdp', ['view', 'manage'], ['ORGANISATION']],
  ['self', ['profile', 'payslips', 'leave', 'attendance', 'policies', 'claims', 'documents', 'devices'], ['OWN']],
];

const PERMISSIONS = Object.freeze(definitions.flatMap(([module, actions, scopes]) => actions.map(action => Object.freeze({
  code: `${module}.${action}`,
  module,
  action,
  allowedScopes: Object.freeze([...scopes]),
  risk: ['prepare', 'approve', 'pay'].includes(action) ? 'FINANCIAL' : ['view', 'profile', 'payslips', 'policies'].includes(action) ? 'READ' : 'WRITE',
  guardrails: Object.freeze([
    'TENANT_ISOLATION',
    ...(['payroll', 'arrears', 'compensation', 'financialChanges', 'expenses'].includes(module) && action === 'approve' ? ['PREPARER_CANNOT_APPROVE'] : []),
    ...(module === 'payments' && action === 'pay' ? ['PREPARER_CANNOT_PAY', 'APPROVER_CANNOT_PAY', 'APPROVED_PAYMENT_ONLY', 'MASKED_PAYMENT_DATA'] : []),
    ...(['roles', 'users'].includes(module) ? ['ORG_ADMIN_ONLY', 'NO_SELF_ESCALATION', 'LAST_ORG_ADMIN'] : []),
  ]),
  ...(module === 'geofence' ? { requiresFeature: 'geofence' } : {}),
}))));

const codes = (...modules) => PERMISSIONS.filter(p => modules.includes(p.module)).map(p => p.code);
const descriptions = {
  ORGANISATION_ADMIN: 'Manage organisation structure, users, roles, settings and audit. Financial preparation, approval and payment remain separate responsibilities.',
  HR_ADMIN: 'Manage organisation-wide people, HR policy, leave and attendance without financial powers.',
  HR_OFFICER: 'Manage non-financial employee records, leave and attendance within selected branches.',
  ACCOUNTS_OFFICER: 'Process approved payments and permitted masked payment data. Cannot prepare or approve the same transaction.',
  PAYROLL_OFFICER: 'Prepare payroll, arrears and financial proposals. Cannot approve or pay the same transaction.',
  APPROVING_AUTHORITY: 'Approve or reject financial proposals prepared by another user. Cannot record their payment.',
  DEPARTMENT_HEAD: 'View assigned department members, leave and attendance. No default final approval authority.',
  BRANCH_MANAGER: 'View branch operations and approve branch leave. Geofence controls require the separate feature to be available.',
  DATA_PROTECTION_OFFICER: 'Manage organisation DPDP compliance readiness, employee data requests, incident records, and privacy documentation.',
  EMPLOYEE: 'Own-record self-service, linked mobile devices and the permitted organisation chart.',
};
const role = (code, name, allowedScopes, permissionCodes) => Object.freeze({
  code, name, description: descriptions[code], allowedScopes: Object.freeze(allowedScopes), permissionCodes: Object.freeze([...new Set(permissionCodes)]), isProtected: true,
});
const HR = ['people.view', 'people.create', 'people.edit', 'people.export', 'hr.view', 'hr.manage', 'leave.view', 'leave.manage', 'leave.approve', 'attendance.view', 'attendance.manage', 'documents.view', 'documents.manage', 'chart.view'];
const ROLE_TEMPLATES = Object.freeze([
  role('ORGANISATION_ADMIN', 'Organisation Admin', ['ORGANISATION'], codes('structure', 'branches', 'departments', 'positions', 'assignments', 'transfers', 'people', 'hr', 'leave', 'attendance', 'documents', 'settings', 'roles', 'users', 'audit', 'chart', 'geofence').concat(['payroll.view', 'arrears.view', 'compensation.view', 'financialChanges.view', 'expenses.view', 'payments.view'])),
  role('HR_ADMIN', 'HR Admin', ['ORGANISATION'], [...HR, 'departments.view', 'departments.manage', 'structure.view']),
  role('HR_OFFICER', 'HR Officer', ['SELECTED_BRANCHES'], HR),
  role('ACCOUNTS_OFFICER', 'Accounts Officer', ['ORGANISATION'], codes('payments').concat(['chart.view'])),
  role('PAYROLL_OFFICER', 'Payroll Officer', ['ORGANISATION'], ['payroll.view', 'payroll.prepare', 'payroll.export', 'arrears.view', 'arrears.prepare', 'compensation.view', 'compensation.prepare', 'financialChanges.view', 'financialChanges.prepare', 'chart.view']),
  role('APPROVING_AUTHORITY', 'Approving Authority', ['ORGANISATION'], ['payroll.view', 'payroll.approve', 'arrears.view', 'arrears.approve', 'compensation.view', 'compensation.approve', 'financialChanges.view', 'financialChanges.approve', 'expenses.view', 'expenses.approve', 'chart.view']),
  role('DEPARTMENT_HEAD', 'Department Head', ['DEPARTMENT'], ['people.view', 'attendance.view', 'leave.view', 'chart.view']),
  role('BRANCH_MANAGER', 'Branch Manager', ['SELECTED_BRANCHES'], ['people.view', 'attendance.view', 'leave.view', 'leave.approve', 'geofence.view', 'geofence.manage', 'chart.view']),
  role('DATA_PROTECTION_OFFICER', 'Data Protection Officer', ['ORGANISATION'], ['dpdp.view', 'dpdp.manage', 'chart.view']),
  role('EMPLOYEE', 'Employee', ['OWN'], codes('self').concat(['chart.view'])),
]);

function permission(code) { return PERMISSIONS.find(p => p.code === code) || null; }
function template(code) { return ROLE_TEMPLATES.find(t => t.code === code) || null; }
module.exports = { PERMISSIONS, ROLE_TEMPLATES, permission, template };
