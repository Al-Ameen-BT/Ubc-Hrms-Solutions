'use strict';
process.env.DB_DIALECT = 'sqlite'; process.env.DB_STORAGE = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../src/models');
const da = require('../src/services/daRevisions');
const arrears = require('../src/services/arrears');
let n = 0;
before(() => m.sequelize.sync()); after(() => m.sequelize.close());
async function fixture() {
  const org = await m.Organization.create({ code: `AR${++n}`, name: 'Arrears Bank', accessControlMode: 'PERMISSIONS' });
  const post = await m.PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });
  const employee = await m.Employee.create({ organizationId: org.id, empCode: 'E1', name: 'Employee', postCadreId: post.id, doj: '2020-01-01' });
  const users = [];
  for (const name of ['Maker', 'Checker', 'Accounts']) users.push(await m.User.create({ organizationId: org.id, name, email: `${name}${n}@arrears.invalid`, role: name === 'Accounts' ? 'ACCOUNTS_OFFICER' : 'PAYROLL_OFFICER', passwordHash: 'unused' }));
  const [maker, checker, accounts] = users;
  const revision = await da.create(org.id, { orderNumber: 'GO', orderDate: '2026-01-01', effectiveFrom: '2026-01-01', previousDaPercent: 5, increasePercent: 1 }, maker.id);
  const row = await m.ArrearsCase.create({ organizationId: org.id, daRevisionId: revision.id, employeeId: employee.id, empCode: 'E1', employeeName: 'Employee', calculatedBy: maker.id, effectiveTotalAmount: 100, totalCalculatedAmount: 100 });
  return { org, employee, maker, checker, accounts, revision, row };
}
test('DA approval reloads the revision and records separate immutable maker/checker history', async () => {
  const f = await fixture();
  assert.equal(f.revision.preparedBy, f.maker.id);
  await assert.rejects(da.advanceStatus(f.revision, 'APPROVED', f.maker.id), { status: 403 });
  await da.advanceStatus(f.revision, 'APPROVED', f.checker.id);
  assert.equal(f.revision.approvedBy, f.checker.id); assert.ok(f.revision.approvedAt);
  await da.advanceStatus(f.revision, 'ACTIVE', f.maker.id);
  assert.equal(f.revision.approvedBy, f.checker.id); assert.equal(f.revision.preparedBy, f.maker.id);
});
test('arrears plan/adjustment approval rejects the calculator and persists plan approval', async () => {
  const f = await fixture();
  await assert.rejects(arrears.adjustAmount(f.row, { approvedAmount: 100, reason: 'Checked', userId: f.maker.id }), { status: 403 });
  await assert.rejects(arrears.setSingleShot(f.row, { year: 2026, month: 12, userId: f.maker.id }), { status: 403 });
  await arrears.setSingleShot(f.row, { year: 2026, month: 12, userId: f.checker.id });
  assert.equal(f.row.planApprovedBy, f.checker.id); assert.ok(f.row.planApprovedAt);
  await assert.rejects(arrears.clearPaymentPlan(f.row, f.maker.id), { status: 403 });
});
test('installment payment reloads state, rejects makers/checkers, and stale retry cannot duplicate ledger entry', async () => {
  const f = await fixture();
  await arrears.setSingleShot(f.row, { year: 2026, month: 12, userId: f.checker.id });
  const installment = await m.ArrearsInstallment.findOne({ where: { arrearsCaseId: f.row.id } });
  const stale = await m.ArrearsCase.findByPk(f.row.id);
  await assert.rejects(arrears.payInstallment(f.row, installment.id, f.maker.id), { status: 403 });
  await assert.rejects(arrears.payInstallment(f.row, installment.id, f.checker.id), { status: 403 });
  await arrears.payInstallment(f.row, installment.id, f.accounts.id);
  await assert.rejects(arrears.payInstallment(stale, installment.id, f.accounts.id), { status: 409 });
  assert.equal(await m.EmployeeServiceHistory.count({ where: { employeeId: f.employee.id, eventType: 'DA_ARREARS_PAYMENT' } }), 1);
});
test('stale draft edits cannot overwrite approved DA amounts', async () => {
  const f = await fixture();
  const stale = await m.DaRevision.findByPk(f.revision.id);
  await da.advanceStatus(f.revision, 'APPROVED', f.checker.id);
  await assert.rejects(da.update(stale, { increasePercent: 99 }, f.maker.id), { status: 409 });
  await f.revision.reload(); assert.equal(f.revision.increasePercent, 1);
});
