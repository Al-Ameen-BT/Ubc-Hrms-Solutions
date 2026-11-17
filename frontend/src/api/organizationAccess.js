import { api } from './client.js';

export const organizationAccessApi = {
  catalogue: () => api.get('/org/roles/catalogue'),
  readiness: () => api.get('/org/roles/readiness'),
  activate: () => api.post('/org/roles/activate', { accessControlMode: 'PERMISSIONS' }),
  roles: () => api.get('/org/roles'),
  role: id => api.get(`/org/roles/${id}`),
  impact: id => api.get(`/org/roles/${id}/impact`),
  createRole: body => api.post('/org/roles', body),
  updateRole: (id, body) => api.put(`/org/roles/${id}`, body),
  deactivateRole: id => api.delete(`/org/roles/${id}`),
  assignments: userId => api.get(`/org/role-assignments${userId ? `?${new URLSearchParams({ userId })}` : ''}`),
  createAssignment: body => api.post('/org/role-assignments', body),
  updateAssignment: (id, body) => api.put(`/org/role-assignments/${id}`, body),
  endAssignment: id => api.delete(`/org/role-assignments/${id}`),
  preview: userId => api.get(`/org/access-preview/${userId}`),
  branches: () => api.get('/org/structure/branches'),
  departments: () => api.get('/org/structure/departments'),
};

export const canManageCustomRoles = readiness => readiness?.ready === true && readiness.accessControlMode === 'PERMISSIONS';

export function scopeLabel(assignment, branches = [], departments = []) {
  const names = (ids, rows) => (ids || []).map(id => rows.find(row => String(row.id) === String(id))?.name || `#${id}`).join(', ');
  if (assignment.scopeType === 'SELECTED_BRANCHES') return names(assignment.branchIds, branches);
  if (assignment.scopeType === 'DEPARTMENT') return names(assignment.departmentIds, departments);
  return assignment.scopeType === 'OWN' ? 'Own record' : 'Entire organisation';
}

// Missing actor history cannot prove that a decision is independent.
export const canDecide = (user, row, fields) => !!user?.id && fields.every(field => row?.[field] != null && String(row[field]) !== String(user.id));

// These LEGACY allowlists mirror backend compatibility routes, never custom-role grants.
const STAFF = ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'DEPARTMENT_HEAD'];
const FINANCIAL_READERS = ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'];
const PAYROLL_READERS = STAFF.filter(role => role !== 'DEPARTMENT_HEAD');
const PROCESSORS = ['ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER'];
const ROUTES = {
  people: [['people.view', 'users.manage'], STAFF], employees: [['people.view'], STAFF],
  payroll: [['payroll.view', 'payments.view'], PAYROLL_READERS], posts: [['compensation.view'], STAFF],
  'pay-scales': [['compensation.view'], STAFF], 'pay-revisions': [['compensation.view'], STAFF],
  leave: [['leave.view'], PAYROLL_READERS], allowances: [['compensation.view'], PAYROLL_READERS],
  arrears: [['arrears.view'], PAYROLL_READERS], 'arrears-cases': [['arrears.view'], PAYROLL_READERS], 'da-revisions': [['arrears.view'], PAYROLL_READERS],
  'year-end': [['payroll.view'], PAYROLL_READERS],
  'government-orders': [['compensation.view'], STAFF], 'ksr-rules': [['compensation.view'], STAFF],
  'org-profile': [['settings.view'], ['ORG_ADMIN']], settings: [['settings.view'], ['ORG_ADMIN']],
  'payroll-settings': [['compensation.view'], ['ORG_ADMIN']], 'catalogue-adoption': [['compensation.view'], FINANCIAL_READERS],
  'financial-changes': [['financialChanges.view'], FINANCIAL_READERS], 'mandatory-fields': [['settings.view'], ['ORG_ADMIN']],
  audit: [['audit.view'], ['ORG_ADMIN']], 'roles-permissions': [['roles.manage'], []], users: [['users.manage'], ['ORG_ADMIN']],
};
const SELF = { payslips: 'self.payslips', leave: 'self.leave', calendar: 'self.leave', policies: 'self.policies', expenses: 'self.claims', workplace: 'self.profile', time: 'self.attendance' };
export const SERVICE_PERMISSIONS = {
  policy: [['hr.view'], ['ORG_ADMIN']], holidays: [['hr.view'], ['ORG_ADMIN', 'HR_ADMIN']],
  time: [['attendance.view'], ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER']],
  expenses: [['expenses.view', 'payments.view'], ['ORG_ADMIN', 'HR_ADMIN', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY']],
};
export const hasServiceAccess = (section, canPermission) => {
  const [codes, legacyRoles] = SERVICE_PERMISSIONS[section] || [[], []];
  return codes.some(code => canPermission(code, legacyRoles));
};
const PLATFORM = ['organisations', 'platform-users', 'platform-settings', 'bank-rules', 'audit'];

export function canVisitRoute(path, canPermission, isSuperAdmin = false) {
  const [root, section, extra] = path.split('/').filter(Boolean);
  if (!root || root === 'account') return true;
  if (isSuperAdmin) return PLATFORM.includes(root);
  if (root === 'my') return !!SELF[section] && canPermission(SELF[section]);
  if (root === 'employee-services') return section ? hasServiceAccess(section, canPermission) : Object.keys(SERVICE_PERMISSIONS).some(key => hasServiceAccess(key, canPermission));
  if (root === 'employees' && (section === 'new' || section === 'import')) return canPermission('people.create', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER']);
  if (root === 'employees' && extra === 'compensation') return canPermission('compensation.view', FINANCIAL_READERS);
  if (root === 'payroll' && section === 'new') return canPermission('payroll.prepare', PROCESSORS);
  const [codes, legacyRoles] = ROUTES[root] || [[], []];
  return codes.some(code => canPermission(code, legacyRoles));
}
