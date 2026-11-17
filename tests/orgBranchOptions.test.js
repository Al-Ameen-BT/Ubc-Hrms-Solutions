'use strict';
process.env.DB_DIALECT = 'sqlite'; process.env.DB_STORAGE = ':memory:'; process.env.JWT_SECRET = 'org-branch-options-test-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../src/models');
const structure = require('../src/services/organizationStructure');
const { effectiveAccess } = require('../src/services/accessControl');
const { requirePermission } = require('../src/middleware/permissions');

let sequence = 0;
before(async () => { await m.sequelize.sync(); });
after(async () => { await m.sequelize.close(); });

async function hrFixture(templateCode, scopeType) {
  const org = await m.Organization.create({ code: `BO${++sequence}`, name: 'Branch Options Bank', accessControlMode: 'PERMISSIONS' });
  const post = await m.PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });
  const branches = await Promise.all(['A', 'B'].map(code => m.OrganizationBranch.create({ organizationId: org.id, code, name: `Branch ${code}`, status: 'ACTIVE', address: `Private ${code}`, phone: `555-${code}` })));
  const employee = await m.Employee.create({ organizationId: org.id, empCode: `ACTOR${sequence}`, name: 'HR actor', doj: '2020-01-01', postCadreId: post.id });
  const actor = await m.User.create({ organizationId: org.id, employeeId: employee.id, name: 'HR actor', email: `hr${sequence}@branch-options.invalid`, passwordHash: 'unused', role: templateCode });
  const role = await m.OrganizationRole.create({ organizationId: org.id, code: `CUSTOM${sequence}`, name: 'People creator', templateCode });
  await m.OrganizationRolePermission.create({ organizationId: org.id, roleId: role.id, permissionCode: 'people.create' });
  const assignment = await m.UserRoleAssignment.create({ organizationId: org.id, userId: actor.id, roleId: role.id, scopeType, effectiveFrom: '2020-01-01' });
  if (scopeType === 'SELECTED_BRANCHES') await m.UserRoleBranch.create({ organizationId: org.id, userRoleAssignmentId: assignment.id, branchId: branches[0].id });
  return { actor, branches };
}

async function authorize(permissionCode, actor) {
  let allowed = false, statusCode, responseBody, nextError;
  const response = { status(code) { statusCode = code; return this; }, json(body) { responseBody = body; return this; } };
  await requirePermission(permissionCode)({ user: actor, params: {} }, response, error => { if (error) nextError = error; else allowed = true; });
  return { allowed, statusCode, responseBody, nextError };
}

test('people.create branch options honor effective branch scope and expose no branch-master details', async () => {
  assert.equal(typeof structure.branchOptions, 'function', 'scoped branch option reader is available');
  const officer = await hrFixture('HR_OFFICER', 'SELECTED_BRANCHES');
  const officerGate = await authorize('people.create', officer.actor);
  assert.equal(officerGate.allowed, true);
  const officerAccess = await effectiveAccess(officer.actor.id, '2026-11-17');
  assert.equal(officerAccess.permissionCodes.includes('branches.view'), false);
  const officerRows = await structure.branchOptions(officerAccess);
  assert.deepEqual(officerRows, [{ id: officer.branches[0].id, name: 'Branch A', status: 'ACTIVE' }]);
  assert.equal((await authorize('branches.view', officer.actor)).statusCode, 403);
  assert.equal((await authorize('branches.manage', officer.actor)).statusCode, 403);

  const admin = await hrFixture('HR_ADMIN', 'ORGANISATION');
  const adminAccess = await effectiveAccess(admin.actor.id, '2026-11-17');
  assert.equal(adminAccess.permissionCodes.includes('branches.view'), false);
  const adminRows = await structure.branchOptions(adminAccess);
  assert.deepEqual(adminRows, [
    { id: admin.branches[0].id, name: 'Branch A', status: 'ACTIVE' },
    { id: admin.branches[1].id, name: 'Branch B', status: 'ACTIVE' },
  ]);
});
