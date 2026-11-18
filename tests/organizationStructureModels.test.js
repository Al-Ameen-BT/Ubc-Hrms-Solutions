'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { DataTypes } = require('sequelize');
const models = require('../src/models');
const { sequelize, Organization, OrganizationBranch, Employee, User } = models;
const { migrate } = require('../src/scripts/migrate');
const { assertSchemaCurrent } = require('../src/services/schemaReadiness');
const names = [
  'OrganizationDepartment', 'OrganizationPosition', 'EmployeeOrganizationAssignment',
  'OrganizationResponsibilityAssignment', 'OrganizationRole', 'OrganizationRolePermission',
  'UserRoleAssignment', 'UserRoleBranch', 'UserRoleDepartment',
];
after(async () => { await sequelize.close(); });

test('all organisation access models require tenant ownership and restrictive foreign keys', () => {
  for (const name of names) {
    const model = models[name];
    assert.ok(model, `${name} is exported`);
    assert.equal(model.rawAttributes.organizationId.allowNull, false, name);
    assert.equal(model.rawAttributes.organizationId.references.model, 'organization', name);
    for (const attr of Object.values(model.rawAttributes)) {
      if (attr.references) assert.equal(attr.onDelete, 'RESTRICT', `${name}.${attr.field}`);
    }
  }
});

test('scope enums cannot widen department or branch responsibilities to organisation access', () => {
  assert.deepEqual(models.UserRoleAssignment?.rawAttributes.scopeType?.values,
    ['OWN', 'DEPARTMENT', 'SELECTED_BRANCHES', 'ORGANISATION']);
  assert.deepEqual(models.OrganizationResponsibilityAssignment?.rawAttributes.scopeType?.values,
    ['BRANCH', 'ORGANISATION']);
  assert.deepEqual(models.OrganizationResponsibilityAssignment?.rawAttributes.responsibility?.values,
    ['BRANCH_MANAGER', 'SENIOR_MANAGER', 'GENERAL_MANAGER', 'DATA_PROTECTION_OFFICER']);
  assert.deepEqual(Organization.rawAttributes.accessControlMode?.values, ['LEGACY', 'PERMISSIONS']);
  assert.equal(Organization.build().accessControlMode, 'LEGACY');
});

test('legacy compatibility fields remain nullable and access version starts at zero', () => {
  for (const field of ['branchId', 'departmentId', 'positionId']) {
    assert.equal(Employee.rawAttributes[field]?.allowNull, true, field);
  }
  for (const field of ['number', 'unitType']) {
    assert.equal(OrganizationBranch.rawAttributes[field]?.allowNull, true, field);
    assert.equal(OrganizationBranch.build().get(field), undefined, field);
  }
  assert.deepEqual(OrganizationBranch.rawAttributes.unitType?.values, ['HEAD_OFFICE', 'BRANCH']);
  assert.equal(User.build().accessVersion, 0);
  assert.equal(User.rawAttributes.accessVersion?.allowNull, false);
});

test('assignment ledgers store mandatory effective-from and nullable effective-to dates and actors', () => {
  for (const name of ['EmployeeOrganizationAssignment', 'OrganizationResponsibilityAssignment', 'UserRoleAssignment']) {
    const attrs = models[name]?.rawAttributes;
    assert.ok(attrs, name);
    assert.equal(attrs.effectiveFrom.type.key, 'DATEONLY', name);
    assert.equal(attrs.effectiveFrom.allowNull, false, name);
    assert.equal(attrs.effectiveTo.type.key, 'DATEONLY', name);
    assert.equal(attrs.effectiveTo.allowNull, true, name);
    assert.ok(attrs.assignedBy.references, name);
  }
});

test('position capacity rejects zero, negative and fractional seats', async () => {
  const Position = models.OrganizationPosition;
  assert.ok(Position);
  const valid = { organizationId: 1, branchId: 1, departmentId: 1, code: 'CLERK', name: 'Clerk' };
  assert.equal(Position.build(valid).capacity, 1);
  assert.equal(Position.build(valid).leadershipVisible, false);
  assert.equal(Position.rawAttributes.postCadreId.allowNull, true);
  assert.equal(Position.rawAttributes.reportsToPositionId.allowNull, true);
  for (const capacity of [0, -1, 1.5]) {
    await assert.rejects(Position.build({ ...valid, capacity }).validate(), /capacity/);
  }
  await Position.build({ ...valid, capacity: 2 }).validate();
});

test('legacy sync then migration preserves data and adds tenant/unit uniqueness idempotently', async () => {
  const qi = sequelize.getQueryInterface();
  const legacyColumns = (model, omitted) => Object.fromEntries(
    Object.entries(model.rawAttributes).filter(([name]) => !omitted.includes(name))
      .map(([, attribute]) => [attribute.field, attribute]),
  );
  await qi.createTable('organization', legacyColumns(Organization, ['accessControlMode']));
  await qi.createTable('users', legacyColumns(User, ['accessVersion']));
  await qi.createTable('employee', legacyColumns(Employee, ['branchId', 'departmentId', 'positionId']));
  const now = new Date();
  await qi.bulkInsert('organization', [
    { id: 1, code: 'STRUCTURE', name: 'Structure Bank', created_at: now, updated_at: now },
    { id: 2, code: 'OTHER', name: 'Other Bank', created_at: now, updated_at: now },
  ]);
  const org = { id: 1 }, other = { id: 2 };
  await qi.bulkInsert('users', [{ organization_id: org.id, name: 'Legacy Admin', email: 'admin@example.invalid', password_hash: 'unchanged', role: 'ORG_ADMIN', created_at: now, updated_at: now }]);
  await qi.createTable('organization_branch', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organization_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    code: DataTypes.STRING(32), address: DataTypes.TEXT, phone: DataTypes.STRING(64),
    is_head_office: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await qi.bulkInsert('organization_branch', [{ organization_id: org.id, name: 'Legacy HO', code: 'HO', is_head_office: true, created_at: new Date(), updated_at: new Date() }]);
  await sequelize.sync();
  await migrate();
  await assertSchemaCurrent(sequelize);
  const legacy = await OrganizationBranch.findOne({ where: { organizationId: org.id } });
  assert.equal(legacy.name, 'Legacy HO');
  assert.equal(legacy.isHeadOffice, true);
  assert.equal(legacy.number, null);
  assert.equal(legacy.unitType, null);
  assert.equal((await Organization.findByPk(org.id)).accessControlMode, 'LEGACY');
  const legacyAdmin = await User.findOne();
  assert.equal(legacyAdmin.accessVersion, 0);
  assert.equal(legacyAdmin.passwordHash, 'unchanged');
  for (const column of ['branch_id', 'department_id', 'position_id']) {
    assert.equal((await qi.describeTable('employee'))[column].allowNull, true);
  }
  await qi.removeIndex('organization_branch', 'uq_org_branch_number');
  assert.deepEqual(await migrate(), ['organization_branch.uq_org_branch_number']);
  const branch = await OrganizationBranch.create({ organizationId: org.id, number: '001', code: 'B1', name: 'First', unitType: 'BRANCH' });
  await assert.rejects(OrganizationBranch.create({ organizationId: org.id, number: '001', code: 'B2', name: 'Duplicate number' }), /unique|Validation/i);
  await assert.rejects(OrganizationBranch.create({ organizationId: org.id, number: '002', code: 'B1', name: 'Duplicate code' }), /unique|Validation/i);
  await OrganizationBranch.create({ organizationId: other.id, number: '001', code: 'B1', name: 'Other tenant' });
  const Department = models.OrganizationDepartment;
  const first = { organizationId: org.id, branchId: branch.id, code: 'OPS', name: 'Operations' };
  await Department.create(first);
  await assert.rejects(Department.create({ ...first, name: 'Other name' }), /unique|Validation/i);
  await assert.rejects(Department.create({ ...first, code: 'OTHER' }), /unique|Validation/i);
  await Department.create({ ...first, branchId: legacy.id });
  await assert.rejects(branch.destroy(), /FOREIGN KEY/i);
  assert.deepEqual(await migrate(), []);
  await sequelize.sync();
  assert.equal(await Department.count(), 2);
});
