import { api, ApiError, downloadFile, isSessionEndingError } from './client.js';

const structurePath = '/org/structure';
const workbookType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function structureBinary(path, options = {}) {
  const token = sessionStorage.getItem('token');
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  if (!response.ok) {
    let body = null;
    try { body = await response.json(); } catch { /* The response may not contain JSON. */ }
    const error = new ApiError(body?.message || `Request failed (${response.status})`, response.status, body);
    if (isSessionEndingError(error)) {
      const message = body?.code === 'ACCESS_CHANGED'
        ? 'Your access has changed. Please sign in again. Relink your phone from My Account → Linked devices if you use the QR-only mobile app.'
        : 'Your session has ended. Please sign in again.';
      sessionStorage.removeItem('token');
      window.dispatchEvent(new CustomEvent('ucb:logout', { detail: { message, kind: 'warn' } }));
    }
    throw error;
  }
  return response;
}

async function previewBranchImport(file) {
  if (!file || !/\.xlsx$/i.test(file.name || '') || file.size > 2 * 1024 * 1024) throw new ApiError('Choose an .xlsx workbook of at most 2 MiB.', 400, null);
  const response = await structureBinary(`${structurePath}/branches/import/preview`, {
    method: 'POST', headers: { 'Content-Type': workbookType }, body: file,
  });
  const payload = await response.json();
  return payload?.data ?? payload;
}

async function loadStructurePhoto(path) {
  const response = await structureBinary(path.replace(/^\/api\/v1/, ''), { method: 'GET' });
  return URL.createObjectURL(await response.blob());
}

export const organizationAccessApi = {
  catalogue: () => api.get('/org/roles/catalogue'),
  readiness: () => api.get('/org/roles/readiness'),
  bootstrap: () => api.post('/org/roles/bootstrap', {}),
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
  dpdpReadiness: () => api.get('/org/dpdp/readiness'),
  dpdpProfile: () => api.get('/org/dpdp/profile'),
  updateDpdpProfile: body => api.put('/org/dpdp/profile', body),
  assignDpo: body => api.post('/org/dpdp/dpo', body),
  branches: () => api.get(`${structurePath}/branches`),
  onboardingBranches: () => api.get(`${structurePath}/branch-options`),
  onboardingPositions: (branchId, departmentId) => {
    const query = new URLSearchParams();
    if (branchId) query.set('branchId', branchId);
    if (departmentId) query.set('departmentId', departmentId);
    const search = query.toString();
    return api.get(`${structurePath}/position-options${search ? `?${search}` : ''}`);
  },
  configureHeadOffice: body => api.post(`${structurePath}/head-office`, body),
  createBranch: body => api.post(`${structurePath}/branches`, body),
  updateBranch: (id, body) => api.put(`${structurePath}/branches/${id}`, body),
  deactivateBranch: id => api.delete(`${structurePath}/branches/${id}`),
  departments: () => api.get(`${structurePath}/departments`),
  createDepartment: body => api.post(`${structurePath}/departments`, body),
  updateDepartment: (id, body) => api.put(`${structurePath}/departments/${id}`, body),
  deactivateDepartment: id => api.delete(`${structurePath}/departments/${id}`),
  positions: () => api.get(`${structurePath}/positions`),
  createPosition: body => api.post(`${structurePath}/positions`, body),
  updatePosition: (id, body) => api.put(`${structurePath}/positions/${id}`, body),
  deactivatePosition: id => api.delete(`${structurePath}/positions/${id}`),
  organizationAssignments: () => api.get(`${structurePath}/assignments`),
  assignEmployee: body => api.post(`${structurePath}/assignments`, body),
  responsibilities: () => api.get(`${structurePath}/responsibilities`),
  assignResponsibility: body => api.post(`${structurePath}/responsibilities`, body),
  chart: (at, filters = {}) => {
    const query = new URLSearchParams(Object.entries({ ...(at ? { at } : {}), ...filters }).filter(([, value]) => value !== '' && value != null));
    return api.get(`${structurePath}/chart${query.size ? `?${query}` : ''}`);
  },
  downloadBranchTemplate: () => downloadFile(`${structurePath}/branches/import/template`, 'branches.xlsx'),
  previewBranchImport,
  applyBranchImport: body => api.post(`${structurePath}/branches/import/apply`, body),
  loadPhoto: loadStructurePhoto,
  transfers: () => api.get('/org/transfers'),
  createTransfer: body => api.post('/org/transfers', body),
  approveTransfer: (id, reason) => api.post(`/org/transfers/${id}/approve`, { reason }),
  rejectTransfer: (id, reason) => api.post(`/org/transfers/${id}/reject`, { reason }),
};

export const canManageCustomRoles = () => true;

export function scopeLabel(assignment, branches = [], departments = []) {
  const names = (ids, rows) => (ids || []).map(id => rows.find(row => String(row.id) === String(id))?.name || `#${id}`).join(', ');
  if (assignment.scopeType === 'SELECTED_BRANCHES') return names(assignment.branchIds, branches);
  if (assignment.scopeType === 'DEPARTMENT') return names(assignment.departmentIds, departments);
  return assignment.scopeType === 'OWN' ? 'Own record' : 'Entire organisation';
}

export function orgProfileLinkAccess(canPermission) {
  const canView = !!canPermission('settings.view', ['ORG_ADMIN']);
  return { canView, canManage: canView && !!canPermission('settings.configure', ['ORG_ADMIN']) };
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
  'organisation-structure': [['structure.view', 'structure.manage', 'branches.view', 'branches.manage', 'departments.view', 'departments.manage', 'positions.view', 'positions.manage', 'assignments.view', 'assignments.manage', 'transfers.view', 'transfers.manage', 'chart.view'], []],
  payroll: [['payroll.view', 'payments.view'], PAYROLL_READERS], posts: [['compensation.view'], STAFF],
  'pay-scales': [['compensation.view'], STAFF], 'pay-revisions': [['compensation.view'], STAFF],
  leave: [['leave.view'], PAYROLL_READERS], allowances: [['compensation.view'], PAYROLL_READERS],
  deductions: [['compensation.view', 'payroll.view'], PAYROLL_READERS],
  arrears: [['arrears.view'], PAYROLL_READERS], 'arrears-cases': [['arrears.view'], PAYROLL_READERS], 'da-revisions': [['arrears.view'], PAYROLL_READERS],
  'year-end': [['payroll.view'], PAYROLL_READERS],
  reports: [['payroll.view', 'compensation.view', 'audit.view'], STAFF],
  'government-orders': [['compensation.view'], STAFF], 'ksr-rules': [['compensation.view'], STAFF],
  'org-profile': [['settings.view'], ['ORG_ADMIN']], settings: [['settings.view'], ['ORG_ADMIN']],
  'payroll-settings': [['compensation.view', 'settings.view'], ['ORG_ADMIN']], 'catalogue-adoption': [['compensation.view', 'settings.view'], FINANCIAL_READERS],
  'financial-changes': [['financialChanges.view'], FINANCIAL_READERS], 'mandatory-fields': [['settings.view'], ['ORG_ADMIN']],
  'dpdp-compliance': [['dpdp.view', 'dpdp.manage', 'settings.configure'], ['ORG_ADMIN', 'DATA_PROTECTION_OFFICER']],
  audit: [['audit.view'], ['ORG_ADMIN']], 'roles-permissions': [['roles.manage'], []], users: [['users.manage'], ['ORG_ADMIN']],
};
const SELF = { payslips: 'self.payslips', leave: 'self.leave', calendar: 'self.leave', policies: 'self.policies', expenses: 'self.claims', workplace: 'chart.view', time: 'self.attendance', privacy: 'self.profile' };
export const SERVICE_PERMISSIONS = {
  policy: [['hr.view'], ['ORG_ADMIN']], holidays: [['hr.view'], ['ORG_ADMIN', 'HR_ADMIN']],
  time: [['attendance.view'], ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER']],
  expenses: [['expenses.view', 'payments.view'], ['ORG_ADMIN', 'HR_ADMIN', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY']],
};
export const hasServiceAccess = (section, canPermission) => {
  const [codes, legacyRoles] = SERVICE_PERMISSIONS[section] || [[], []];
  return codes.some(code => canPermission(code, legacyRoles));
};
const ROUTE_FEATURES = {
  payroll: 'payroll',
  'year-end': 'payroll',
  reports: 'payroll',
  'payroll-settings': 'payroll',
  deductions: 'payroll',
  leave: 'leave',
  expenses: 'expenses',
  arrears: 'arrears',
  'arrears-cases': 'arrears',
  'da-revisions': 'arrears',
  allowances: 'compensation',
  'pay-scales': 'compensation',
  'pay-revisions': 'pay_revisions',
  'government-orders': 'government_orders',
  'ksr-rules': 'government_orders',
  'dpdp-compliance': 'dpdp_compliance',
  'financial-changes': 'financial_approvals',
  audit: 'audit',
};

const SELF_FEATURES = {
  payslips: 'payroll',
  leave: 'leave',
  calendar: 'leave',
  expenses: 'expenses',
  time: 'attendance',
  privacy: 'dpdp_compliance',
};

const PLATFORM = ['organisations', 'platform-users', 'platform-settings', 'bank-rules', 'dpdp-documents', 'audit'];

export function canVisitRoute(path, canPermission, isSuperAdmin = false, isFeatureEnabled = () => true) {
  const [root, section, extra] = path.split('/').filter(Boolean);
  if (!root || root === 'account') return true;
  if (isSuperAdmin) return PLATFORM.includes(root);

  // Check feature enablement
  const requiredFeature = ROUTE_FEATURES[root];
  if (requiredFeature && !isFeatureEnabled(requiredFeature)) return false;

  if (root === 'my') {
    const selfFeature = SELF_FEATURES[section];
    if (selfFeature && !isFeatureEnabled(selfFeature)) return false;
    return !!SELF[section] && canPermission(SELF[section]);
  }
  if (root === 'employee-services') {
    if (section === 'time' && !isFeatureEnabled('attendance')) return false;
    if (section === 'expenses' && !isFeatureEnabled('expenses')) return false;
    return section ? hasServiceAccess(section, canPermission) : Object.keys(SERVICE_PERMISSIONS).some(key => hasServiceAccess(key, canPermission));
  }
  if (root === 'employees' && (section === 'new' || section === 'import')) {
    if (section === 'import' && !isFeatureEnabled('bulk_import')) return false;
    return canPermission('people.create', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER']);
  }
  if (root === 'employees' && extra === 'compensation') return canPermission('compensation.view', FINANCIAL_READERS);
  if (root === 'payroll' && section === 'new') return canPermission('payroll.prepare', PROCESSORS);
  const [codes, legacyRoles] = ROUTES[root] || [[], []];
  return codes.some(code => canPermission(code, legacyRoles));
}
