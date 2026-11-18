'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'dpdp-governance-test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  sequelize,
  Organization,
  User,
  Employee,
  PostCadre,
  OrganizationResponsibilityAssignment,
  DpdpDocument,
  DpdpOrganizationProfile,
} = require('../src/models');
const dpdpGovernance = require('../src/services/dpdpGovernance');

let org;
let foreignOrg;
let post;
let adminUser;
let emp1;
let emp2;
let user1;
let user2;

before(async () => {
  await sequelize.sync();
  org = await Organization.create({ code: 'GOV_TEST', name: 'Governance Test Bank', accessControlMode: 'PERMISSIONS' });
  foreignOrg = await Organization.create({ code: 'GOV_FOREIGN', name: 'Foreign Bank', accessControlMode: 'PERMISSIONS' });
  post = await PostCadre.create({ organizationId: org.id, code: 'OFF_GOV', name: 'Officer' });

  emp1 = await Employee.create({
    organizationId: org.id,
    empCode: 'EMP_DPO1',
    name: 'Suresh Kumar',
    doj: '2020-01-01',
    postCadreId: post.id,
    currentBasicPay: 40000,
    status: 'ACTIVE',
  });

  emp2 = await Employee.create({
    organizationId: org.id,
    empCode: 'EMP_DPO2',
    name: 'Priya Nair',
    doj: '2021-01-01',
    postCadreId: post.id,
    currentBasicPay: 42000,
    status: 'ACTIVE',
  });

  adminUser = await User.create({
    organizationId: org.id,
    email: 'admin@govbank.invalid',
    name: 'Bank Admin',
    role: 'ORG_ADMIN',
    employeeId: emp1.id,
    passwordHash: 'dummy',
    accessVersion: 0,
  });

  user1 = await User.create({
    organizationId: org.id,
    email: 'dpo1@govbank.invalid',
    name: 'Suresh Kumar User',
    role: 'HR_ADMIN',
    employeeId: emp1.id,
    passwordHash: 'dummy',
    accessVersion: 0,
  });

  user2 = await User.create({
    organizationId: org.id,
    email: 'dpo2@govbank.invalid',
    name: 'Priya Nair User',
    role: 'HR_OFFICER',
    employeeId: emp2.id,
    passwordHash: 'dummy',
    accessVersion: 0,
  });
});

after(async () => {
  await sequelize.close();
});

test('readiness fails when DPO is missing', async () => {
  const result = await dpdpGovernance.readiness(org.id);
  assert.equal(result.isReady, false);
  assert.ok(result.blockers.some((b) => b.code === 'DPO_REQUIRED'));
});

test('assignDpo validates active employee linkage and tenant isolation', async () => {
  // Foreign user rejection
  const foreignPost = await PostCadre.create({ organizationId: foreignOrg.id, code: 'FOR_OFF', name: 'Foreign Officer' });
  const foreignEmp = await Employee.create({
    organizationId: foreignOrg.id,
    empCode: 'FOR_E1',
    name: 'Foreign Staff',
    doj: '2022-01-01',
    postCadreId: foreignPost.id,
    currentBasicPay: 30000,
  });
  const foreignUser = await User.create({
    organizationId: foreignOrg.id,
    email: 'foreign@other.invalid',
    name: 'Foreign User',
    role: 'EMPLOYEE',
    employeeId: foreignEmp.id,
    passwordHash: 'dummy',
  });

  await assert.rejects(async () => {
    await dpdpGovernance.assignDpo({
      organizationId: org.id,
      actor: adminUser,
      userId: foreignUser.id,
      effectiveFrom: '2026-01-01',
    });
  }, /tenant|Tenant|organisation/i);

  // User without linked employee rejection
  const userNoEmp = await User.create({
    organizationId: org.id,
    email: 'noemp@govbank.invalid',
    name: 'No Emp User',
    role: 'EMPLOYEE',
    employeeId: null,
    passwordHash: 'dummy',
  });

  await assert.rejects(async () => {
    await dpdpGovernance.assignDpo({
      organizationId: org.id,
      actor: adminUser,
      userId: userNoEmp.id,
      effectiveFrom: '2026-01-01',
    });
  }, /employee/i);
});

test('assignDpo creates DPO responsibility and invalidates sessions for affected users', async () => {
  const oldAv1 = user1.accessVersion;
  const res = await dpdpGovernance.assignDpo({
    organizationId: org.id,
    actor: adminUser,
    userId: user1.id,
    effectiveFrom: '2026-01-01',
  });

  assert.ok(res.assignment);
  assert.equal(res.assignment.responsibility, 'DATA_PROTECTION_OFFICER');

  // Verify accessVersion incremented
  await user1.reload();
  assert.ok(user1.accessVersion > oldAv1, 'Old accessVersion was incremented');

  // Verify profile updated with DPO details
  const profile = await DpdpOrganizationProfile.findOne({ where: { organizationId: org.id } });
  assert.ok(profile);
  assert.equal(profile.dpoName, user1.name);
  assert.equal(profile.dpoEmail, user1.email);
});

test('replacing DPO transactionally closes prior responsibility and invalidates both users', async () => {
  await user1.reload();
  await user2.reload();
  const av1 = user1.accessVersion;
  const av2 = user2.accessVersion;

  await dpdpGovernance.assignDpo({
    organizationId: org.id,
    actor: adminUser,
    userId: user2.id,
    effectiveFrom: '2026-02-01',
  });

  // Verify prior assignment ended
  const prior = await OrganizationResponsibilityAssignment.findOne({
    where: { organizationId: org.id, userId: user1.id, responsibility: 'DATA_PROTECTION_OFFICER' },
  });
  assert.ok(prior.status === 'INACTIVE' || (prior.effectiveTo && prior.effectiveTo < '2026-02-01'));

  // Both users had their access invalidated
  await user1.reload();
  await user2.reload();
  assert.ok(user1.accessVersion > av1, 'Former DPO accessVersion incremented');
  assert.ok(user2.accessVersion > av2, 'New DPO accessVersion incremented');
});

test('readiness succeeds when DPO and all 3 required documents are published', async () => {
  // Create the 3 required published documents
  await DpdpDocument.create({
    ownerType: 'PLATFORM',
    type: 'TERMS',
    version: '1.0-gov',
    title: 'Terms',
    body: 'Terms content',
    state: 'PUBLISHED',
  });
  await DpdpDocument.create({
    ownerType: 'PLATFORM',
    type: 'PLATFORM_PRIVACY',
    version: '1.0-gov',
    title: 'Platform Privacy',
    body: 'Privacy content',
    state: 'PUBLISHED',
  });
  await DpdpDocument.create({
    ownerType: 'ORGANIZATION',
    organizationId: org.id,
    type: 'EMPLOYEE_NOTICE',
    version: '1.0-gov',
    title: 'Employee Notice',
    body: 'Employee notice content',
    state: 'PUBLISHED',
  });

  const readiness = await dpdpGovernance.readiness(org.id);
  assert.equal(readiness.isReady, true);
  assert.equal(readiness.blockers.length, 0);
  assert.ok(readiness.dpo);
  assert.equal(readiness.dpo.userId, user2.id);
});
