import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { api } from '../src/api/client.js';
import { canVisitRoute, organizationAccessApi } from '../src/api/organizationAccess.js';
import { employeeApi } from '../src/api/employee.js';

const root = new URL('../src/', import.meta.url);
const source = path => {
  const url = new URL(path, root);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
};
const matches = (content, pattern, message) => assert.ok(pattern.test(content), message);

test('organisation structure route and navigation require structure or chart permission', () => {
  assert.equal(canVisitRoute('/organisation-structure', code => code === 'branches.view'), true);
  assert.equal(canVisitRoute('/organisation-structure', code => code === 'structure.view'), true);
  assert.equal(canVisitRoute('/organisation-structure', code => code === 'self.profile'), false);
  assert.equal(canVisitRoute('/my/workplace', code => code === 'chart.view'), true);
  matches(source('App.jsx'), /path="organisation-structure"/, 'workspace route is registered');
  matches(source('components/Sidebar.jsx'), /organisation-structure/, 'workspace is in permission-filtered navigation');
  matches(source('components/CommandPalette.jsx'), /organisation-structure/, 'workspace is searchable');
  const page = source('features/org/OrganisationStructurePage.jsx');
  matches(page, /const can = code => canPermission\(code, LEGACY_ACTION_ROLES\[code\] \|\| \[\]\)/, 'workspace actions use permission codes with explicit legacy role parity');
  matches(page, /'branches\.manage': \['ORG_ADMIN'\]/, 'branch mutation remains Organisation Admin only in legacy mode');
});

test('structure assignment reads keep role assignment API wiring intact', async () => {
  const originalGet = api.get;
  const paths = [];
  api.get = async path => { paths.push(path); return {}; };
  try {
    await organizationAccessApi.onboardingBranches();
    await organizationAccessApi.onboardingPositions('5', '9');
    await organizationAccessApi.assignments(7);
    await organizationAccessApi.organizationAssignments();
    await employeeApi.chart();
  } finally { api.get = originalGet; }
  assert.deepEqual(paths, ['/org/structure/branch-options', '/org/structure/position-options?branchId=5&departmentId=9', '/org/role-assignments?userId=7', '/org/structure/assignments', '/me/chart']);
});

test('permission-mode onboarding requests branch options with people.create access', () => {
  const page = source('features/employees/NewEmployeePage.jsx');
  matches(page, /queryFn: organizationAccessApi\.onboardingBranches/, 'onboarding reads the scoped branch-options endpoint');
  matches(page, /enabled: permissionMode && canPermission\('people\.create'/, 'branch options load for authorized employee creators');
  matches(page, /disabled=\{branchesQuery\.isLoading \|\| !canPermission\('people\.create'/, 'branch selector follows employee creation permission');
  matches(page, /queryFn: \(\) => organizationAccessApi\.onboardingPositions\(/, 'onboarding reads scoped position choices');
  matches(page, /enabled: permissionMode && !!organizationAssignment\.branchId && canPermission\('people\.create'/, 'position choices follow the selected branch and creation permission');
});

test('branch import uses a labeled xlsx picker and requires a clean signed preview before apply', () => {
  const page = source('features/org/OrganisationStructurePage.jsx');
  matches(page, /label="Select \.xlsx workbook"/, 'picker is labeled for the workbook format');
  matches(page, /accept="\.xlsx,application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet"/, 'picker accepts only xlsx');
  matches(page, /previewSignature/, 'server preview signature is retained');
  matches(page, /Apply import/, 'clean preview has an explicit apply action');
  matches(page, /errors\??\.length/, 'row errors block apply');
  matches(page, /row\.row/, 'row errors identify their source row');
  matches(page, /2 MiB/, 'file size limit is explained');
  matches(page, /1,000 rows/, 'row limit is explained');
});

test('position management shows capacity and active reporting parents while chart lists current occupants only', () => {
  const page = source('features/org/OrganisationStructurePage.jsx');
  const tree = source('components/WorkplaceTree.jsx');
  matches(page, /reportsToPositionId/, 'parent is stored as a position identifier');
  matches(page, /position\.status === 'ACTIVE'/, 'parent choices are active positions');
  matches(page, /id="assignment-position"[\s\S]{0,500}position\?\.departmentId/, 'choosing an assignment position also submits its required department');
  matches(page, /branchById\(positionForm\.branchId\)\?\.unitType === 'HEAD_OFFICE'/, 'leadership visibility follows the selected position unit');
  matches(page, /capacity/, 'capacity is shown in management');
  matches(page, /chart\.employees/, 'chart uses current employees from the API');
  matches(page, /<WorkplaceTree/, 'organisation chart uses the shared workplace hierarchy');
  for (const level of ['Workplace tree', 'Units', 'Departments', 'Positions', 'Employees']) matches(tree, new RegExp(level), `${level} is represented in the workplace tree`);
  matches(tree, /reportsToPositionId/, 'position reporting relationships are visible');
  matches(tree, /Find in tree/, 'large workplace trees can be searched');
  assert.doesNotMatch(page, /Vacant position|Empty position|vacancy card/i);
});

test('transfer bundles separate role scope and catalogue selection and expose approval states', () => {
  const page = source('features/org/OrganisationStructurePage.jsx');
  matches(page, /Financial approval/, 'financial state is disclosed');
  matches(page, /Role-scope plan/, 'role scope is presented separately');
  matches(page, /compensationProposalId/, 'existing compensation references are supported');
  matches(page, /roleChanges/, 'role changes are part of the submitted bundle');
  for (const status of ['PENDING', 'APPROVED', 'REJECTED', 'ACTIVATED']) assert.ok(page.includes(status), `transfer state ${status}`);
  assert.doesNotMatch(page, /id="transfer-amount"|name="amount"/);
});

test('employee creation requires a real assignment in permission mode and legacy fields remain available', () => {
  const page = source('features/employees/NewEmployeePage.jsx');
  matches(page, /accessControlMode === 'PERMISSIONS'/, 'permission mode gates authoritative assignment fields');
  matches(page, /organizationAssignment/, 'assignment is sent with onboarding');
  matches(page, /effectiveFrom/, 'assignment has an effective date');
  matches(page, /Select branch/, 'a real branch is selected');
  matches(page, /form\.department/, 'legacy department entry remains');
  matches(page, /form\.designation/, 'legacy designation entry remains');
});

test('employee details show structure resolution and authorized transfer entry; profile no longer mutates branches', () => {
  const detail = source('features/employees/EmployeeDetailPage.jsx');
  const profile = source('features/org/OrgProfilePage.jsx');
  matches(detail, /legacy/i, 'legacy assignment resolution is explained');
  matches(detail, /ambiguous/i, 'ambiguous assignment resolution is explained');
  matches(detail, /transfers\.manage/, 'transfer entry is permission-gated');
  matches(detail, /organisation-structure/, 'transfer scheduling links to the workspace');
  assert.doesNotMatch(profile, /profileApi\.(createBranch|updateBranch|deleteBranch)/);
  matches(profile, /organisation-structure/, 'branch structure links from the profile');
});

test('employee chart copy names own branch and Head Office leadership and handles unassigned employees', () => {
  const page = source('features/employee/EmployeeServicesPage.jsx');
  matches(page, /own branch/i, 'employee chart scope is stated');
  matches(page, /Head Office leadership/i, 'Head Office chart scope is stated');
  matches(page, /context\?\.assigned/, 'unassigned employee fallback is rendered');
  matches(page, /photoRef/, 'authenticated photo references are consumed');
  matches(page, /leadership/, 'manual leadership is rendered');
  matches(page, /<WorkplaceTree/, 'employee workplace uses the same hierarchy as the admin chart');
});
