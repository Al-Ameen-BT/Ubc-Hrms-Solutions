'use strict';
process.env.DB_DIALECT = 'sqlite'; process.env.DB_STORAGE = ':memory:';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../src/models');
const { migrate } = require('../src/scripts/migrate');
after(() => m.sequelize.close());
test('approval-history columns migrate additively and idempotently without rewriting existing leave/arrears rows', async () => {
  const qi = m.sequelize.getQueryInterface();
  const additions = new Map([[m.LeaveApplication, ['selectedApproverUserId']], [m.DaRevision, ['preparedBy', 'approvedBy', 'approvedAt']], [m.ArrearsCase, ['planApprovedBy', 'planApprovedAt']]]);
  for (const [model, omitted] of additions) await qi.createTable(model.getTableName(), Object.fromEntries(Object.entries(model.rawAttributes).filter(([key]) => !omitted.includes(key)).map(([, value]) => [value.field, value])));
  await m.sequelize.sync();
  const org = await m.Organization.create({ code: 'APPROVALMIG', name: 'Migration Bank' });
  const post = await m.PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });
  const employee = await m.Employee.create({ organizationId: org.id, empCode: 'E1', name: 'Legacy employee', doj: '2020-01-01', postCadreId: post.id });
  const type = await m.LeaveType.create({ organizationId: org.id, code: 'CL', name: 'Casual', accrualMethod: 'NONE' });
  const now = new Date();
  await qi.bulkInsert('leave_application', [{ id: 1, employee_id: employee.id, leave_type_id: type.id, from_date: '2026-01-01', to_date: '2026-01-01', days: 1, status: 'APPROVED', created_at: now, updated_at: now }]);
  await qi.bulkInsert('da_revision', [{ id: 1, organization_id: org.id, order_number: 'LEGACY-GO', order_date: '2026-01-01', effective_from: '2026-01-01', previous_da_percent: 5, increase_percent: 1, revised_da_percent: 6, status: 'ACTIVE', created_at: now, updated_at: now }]);
  await qi.bulkInsert('arrears_case', [{ id: 1, organization_id: org.id, da_revision_id: 1, employee_id: employee.id, emp_code: 'E1', employee_name: 'Legacy employee', effective_total_amount: 100, total_calculated_amount: 100, status: 'PLAN_SET', payment_mode: 'SINGLE_SHOT', created_at: now, updated_at: now }]);
  const added = await migrate();
  for (const [model, fields] of additions) for (const key of fields) {
    const column = model.rawAttributes[key].field;
    assert.ok(added.includes(`${model.getTableName()}.${column}`));
    assert.equal((await qi.describeTable(model.getTableName()))[column].allowNull, true);
    assert.ok(`${model.getTableName()}_${column}_foreign_idx`.length < 64);
  }
  const historical = await m.LeaveApplication.findByPk(1);
  assert.equal(historical.status, 'APPROVED'); assert.equal(historical.selectedApproverUserId, null); assert.equal(historical.days, 1);
  const revision = await m.DaRevision.findByPk(1), arrears = await m.ArrearsCase.findByPk(1);
  assert.equal(revision.status, 'ACTIVE'); assert.equal(revision.preparedBy, null); assert.equal(revision.approvedBy, null);
  assert.equal(arrears.paymentMode, 'SINGLE_SHOT'); assert.equal(arrears.planApprovedBy, null); assert.equal(arrears.effectiveTotalAmount, 100);
  assert.deepEqual(await migrate(), []);
});
