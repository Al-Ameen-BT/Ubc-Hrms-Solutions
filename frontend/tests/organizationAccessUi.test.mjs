import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canVisitRoute, canManageCustomRoles, scopeLabel, canDecide, organizationAccessApi } from '../src/api/organizationAccess.js';
import { api, downloadFile, openFile } from '../src/api/client.js';
const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('organisation entry points use server permissions and fail closed', () => {
  const has = (...codes) => code => codes.includes(code);
  assert.equal(canVisitRoute('/roles-permissions', has('roles.manage')), true);
  assert.equal(canVisitRoute('/roles-permissions', has('people.view')), false);
  assert.equal(canVisitRoute('/employees/new', has('people.view')), false);
  assert.equal(canVisitRoute('/payroll/new', has('payroll.prepare')), true);
  assert.equal(canVisitRoute('/my/payslips', has('self.payslips')), true);
  assert.equal(canVisitRoute('/my/payslips', has('payroll.view')), false);
  assert.equal(canVisitRoute('/employee-services/time', has('attendance.view')), true);
  assert.equal(canVisitRoute('/platform-users', has('roles.manage')), false);
  assert.equal(canVisitRoute('/platform-users', has(), true), true);
  assert.equal(canVisitRoute('/roles-permissions', has(), true), false);
});

test('custom changes wait for server readiness and permission mode', () => {
  assert.equal(canManageCustomRoles({ ready: true, accessControlMode: 'PERMISSIONS' }), true);
  assert.equal(canManageCustomRoles({ ready: false, accessControlMode: 'PERMISSIONS' }), false);
  assert.equal(canManageCustomRoles({ ready: true, accessControlMode: 'LEGACY' }), false);
  assert.equal(canManageCustomRoles(undefined), false);
});

test('multi-role assignments retain named selected-branch and department scopes', () => {
  assert.equal(scopeLabel({ scopeType: 'SELECTED_BRANCHES', branchIds: [1, 2] }, [{ id: 1, name: 'Head Office' }, { id: 2, name: 'East' }]), 'Head Office, East');
  assert.equal(scopeLabel({ scopeType: 'DEPARTMENT', departmentIds: [3] }, [], [{ id: 3, name: 'HR' }]), 'HR');
});

test('maker checker controls fail closed when actor history is absent', () => {
  assert.equal(canDecide({ id: 3 }, { preparedBy: 4 }, ['preparedBy']), true);
  assert.equal(canDecide({ id: 3 }, { preparedBy: 3 }, ['preparedBy']), false);
  assert.equal(canDecide({ id: 3 }, {}, ['preparedBy']), false);
});

test('API uses Task 8 paths and preserves request fields', async () => {
  const original = api.post;
  const calls = [];
  api.post = async (...args) => { calls.push(args); return {}; };
  try {
    await organizationAccessApi.activate();
    await organizationAccessApi.createAssignment({ userId: 1, roleId: 2, branchIds: [4, 5] });
    assert.deepEqual(calls, [['/org/roles/activate', { accessControlMode: 'PERMISSIONS' }], ['/org/role-assignments', { userId: 1, roleId: 2, branchIds: [4, 5] }]]);
  } finally { api.post = original; }
});

test('auth, navigation, protected cells and impact copy meet the UI contract', () => {
  assert.match(source('auth/AuthContext.jsx'), /canPermission/);
  assert.match(source('auth/AuthContext.jsx'), /authApi\.me\(\)/);
  assert.match(source('components/AppShell.jsx'), /canVisitRoute/);
  assert.doesNotMatch(source('components/AppShell.jsx'), /role\s*===\s*'EMPLOYEE'/);
  assert.match(source('components/Sidebar.jsx'), /canPermission/);
  assert.match(source('components/CommandPalette.jsx'), /canPermission/);
  const page = source('features/org/RolesPermissionsPage.jsx');
  assert.match(page, /disabled=\{[^}]*isProtected/);
  assert.match(page, /canManageCustomRoles\(readiness\)/);
  assert.match(page, /browser users must sign in again/i);
  assert.match(page, /QR-only mobile users must relink/i);
  assert.match(page, /branchIds/);
  assert.match(page, /assignments/);
  assert.match(source('features/auth/MyAccountPage.jsx'), /canPermission\('self.devices'\)/);
  for (const file of ['employees/CompensationPage', 'org/ArrearsPage', 'org/CatalogueAdoptionPage', 'org/EmployeeServicesAdminPage', 'org/FinancialApprovalsPage', 'payroll/PayrollRunPage']) {
    assert.doesNotMatch(source(`features/${file}.jsx`), /user\?\.role|can\('ORG_ADMIN'/, file);
    assert.match(source(`features/${file}.jsx`), /canPermission/, file);
  }
});

test('the single legacy compatibility bridge preserves allowlists without overriding permission mode or bootstrap restrictions', () => {
  const auth = source('auth/AuthContext.jsx');
  const match = auth.match(/const canPermission = useCallback\((\(code, legacyRoles = \[\]\) => \{[\s\S]*?\n  \}), \[user\]\);/);
  assert.ok(match, 'AuthContext exposes the centralized compatibility bridge');
  const check = user => new Function('user', `return ${match[1]}`)(user);
  const legacyHr = check({ accessControlMode: 'LEGACY', role: 'HR_OFFICER', permissionCodes: ['compensation.view'] });
  assert.equal(legacyHr('compensation.prepare', ['ORG_ADMIN', 'HR_OFFICER']), true);
  assert.equal(legacyHr('compensation.prepare', ['ORG_ADMIN']), false);
  assert.equal(check({ accessControlMode: 'PERMISSIONS', role: 'ORG_ADMIN', permissionCodes: [] })('compensation.prepare', ['ORG_ADMIN']), false);
  assert.equal(check({ accessControlMode: 'LEGACY', bootstrapRestricted: true, role: 'ORG_ADMIN', permissionCodes: ['roles.manage'] })('compensation.prepare', ['ORG_ADMIN']), false);
  assert.equal(check({ accessControlMode: 'LEGACY', bootstrapRestricted: true, role: 'ORG_ADMIN', permissionCodes: ['roles.manage'] })('roles.manage'), true);
  for (const file of ['employees/EmployeesPage', 'payroll/PayrollPage', 'org/ArrearsCasePage', 'org/DaRevisionPage']) {
    assert.match(source(`features/${file}.jsx`), /canPermission/);
    assert.doesNotMatch(source(`features/${file}.jsx`), /user\?\.role|can\('ORG_ADMIN'/);
  }
});

test('ACCESS_CHANGED clears the token and explains browser sign-in and QR relink', async () => {
  let notice;
  const values = new Map([['token', 'old-session']]);
  globalThis.sessionStorage = { getItem: key => values.get(key), removeItem: key => values.delete(key) };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init.detail; } };
  globalThis.window = { dispatchEvent: event => { notice = event.detail.message; } };
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ code: 'ACCESS_CHANGED' }) });
  await assert.rejects(api.get('/org/roles'), /access has changed/);
  assert.equal(values.has('token'), false);
  assert.match(notice, /sign in again/);
  assert.match(notice, /Relink your phone/);
});

test('binary exports also clear changed access and carry relink recovery copy', async () => {
  for (const download of [downloadFile, openFile]) {
    let message;
    let cleared = false;
    globalThis.sessionStorage = { getItem: () => 'stale', removeItem: () => { cleared = true; } };
    globalThis.window = { dispatchEvent: event => { message = event.detail.message; } };
    globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ code: 'ACCESS_CHANGED' }) });
    await assert.rejects(download('/file'), /access has changed/);
    assert.equal(cleared, true);
    assert.match(message, /Relink your phone/);
  }
});

test('employee child writes and queries use their specific permission boundaries', () => {
  for (const [file, view, write] of [['EmployeeBankAccountsTab', 'compensation.view', 'compensation.prepare'], ['EmployeeLoansTab', 'compensation.view', 'compensation.prepare'], ['EmployeeAttendanceTab', 'attendance.view', 'attendance.manage'], ['EmployeeDocumentsTab', 'documents.view', 'documents.manage']]) {
    const content = source(`features/employees/${file}.jsx`);
    assert.ok(content.includes(`canPermission('${view}'`), file);
    assert.ok(content.includes(`canPermission('${write}'`), file);
    assert.match(content, /if \(!canRead\)/, file);
    assert.doesNotMatch(content, /user\?\.role|includes\(user\.role/);
  }
  assert.match(source('features/employees/EmployeeDocumentsTab.jsx'), /canPermission\('self.documents'/);
  assert.match(source('features/employees/EmployeeAttendanceTab.jsx'), /readOnly=\{!canWrite\}/);
  assert.match(source('features/employees/ResourceSection.jsx'), /\{createFn && <Button/);
});

test('loan creation preserves the narrower legacy HR recorder boundary', () => {
  const content = source('features/employees/EmployeeLoansTab.jsx');
  const declarations = content.match(/  const canRead =[\s\S]*?(?=  if \(!canRead\))/)[0];
  for (const [role, expected] of [['HR_OFFICER', true], ['PAYROLL_OFFICER', false], ['ACCOUNTS_OFFICER', false]]) {
    const canPermission = (code, roles) => roles.includes(role);
    const gates = new Function('canPermission', `${declarations}\nreturn { canCreate, ${content.includes('const canRecord') ? 'canRecord' : 'canRecord: canCreate'} };`)(canPermission);
    assert.equal(gates.canCreate, true, `${role} can record a festival advance or LIC policy`);
    for (const method of ['addOverdraft', 'addRecurringDeposit', 'addHousingLoan', 'addVehicleLoan']) {
      const gate = content.match(new RegExp(`createFn=\\{(\\w+) \\? \\(data\\) => serviceBookApi\\.${method}`))[1];
      assert.equal(gates[gate], expected, `${role}: ${method}`);
    }
  }
});

test('payments-only reimbursement rows hide receipts and mark omitted details restricted', () => {
  const page = source('features/org/EmployeeServicesAdminPage.jsx');
  const receiptCell = page.match(/<td>([\s\S]*?)<\/td>\s*\{row\.status === 'SUBMITTED'/)?.[1] || page;
  assert.match(receiptCell, /canPermission\('expenses\.view', \['ORG_ADMIN', 'HR_ADMIN', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'\]\)/);
  assert.match(page, /row\.expenseDate \? fmt\.date\(row\.expenseDate\) : 'Restricted'/);
  assert.match(page, /row\.category \|\| 'Restricted'/);
  assert.match(page, /row\.purpose \|\| 'Restricted'/);
  assert.match(source('api/organizationAccess.js'), /expenses: \[\['expenses\.view', 'payments\.view'\], \['ORG_ADMIN', 'HR_ADMIN', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'\]\]/);
});

test('optional role assignment support failures stay local to assignment operations', () => {
  const page = source('features/org/RolesPermissionsPage.jsx');
  assert.match(page, /const coreQueries = \[readinessQuery, rolesQuery, catalogueQuery\]/);
  assert.match(page, /const coreLoadError = coreQueries\.find\(query => query\.error\)\?\.error/);
  assert.match(page, /enabled=\{customEnabled && !coreLoadError\}/);
  assert.match(page, /disabled=\{!readiness\.ready \|\| busy \|\| !!readinessQuery\.error\}/);
  assert.match(page, /User assignments[\s\S]*?usersQuery\.error/);
  assert.match(page, /assignmentsQuery\.error/);
  assert.match(page, /branchesQuery\.error/);
  assert.match(page, /departmentsQuery\.error/);
  assert.match(page, /enabled: allowed && !!selectedUser/);
  assert.doesNotMatch(page, /const queries = \[readinessQuery, rolesQuery, catalogueQuery, usersQuery, assignmentsQuery, branchesQuery, departmentsQuery\]/);
});
