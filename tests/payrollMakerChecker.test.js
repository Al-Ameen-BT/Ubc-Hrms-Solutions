'use strict';
process.env.DB_DIALECT = 'sqlite'; process.env.DB_STORAGE = ':memory:'; process.env.JWT_SECRET = 'maker-checker-test-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { sequelize, Organization, PostCadre, Employee, User, PayrollRun, ExpenseClaim, FinancialChangeProposal, OrganizationRole, OrganizationRolePermission, UserRoleAssignment } = require('../src/models');
const engine = require('../src/services/payrollEngine');
const changes = require('../src/services/financialChanges');
const { effectiveAccess, can } = require('../src/services/accessControl');
const { signToken } = require('../src/services/authService');
let org, maker, approver, payer, employee, server, base, serial = 0;
before(async () => {
  await sequelize.sync();
  org = await Organization.create({ code: 'MAKERCHECKER', name: 'Maker Checker Bank', accessControlMode: 'PERMISSIONS' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });
  employee = await Employee.create({ organizationId: org.id, postCadreId: post.id, empCode: 'E1', name: 'Employee', doj: '2020-01-01' });
  maker = await User.create({ organizationId: org.id, employeeId: employee.id, email: 'maker@checker.invalid', name: 'Maker', role: 'PAYROLL_OFFICER', passwordHash: 'unused' });
  approver = await User.create({ organizationId: org.id, email: 'approver@checker.invalid', name: 'Approver', role: 'APPROVING_AUTHORITY', passwordHash: 'unused' });
  payer = await User.create({ organizationId: org.id, email: 'payer@checker.invalid', name: 'Payer', role: 'ACCOUNTS_OFFICER', passwordHash: 'unused' });
  for (const [templateCode, permissionCode] of [['PAYROLL_OFFICER', 'payroll.prepare'], ['APPROVING_AUTHORITY', 'payroll.approve'], ['ACCOUNTS_OFFICER', 'payments.pay']]) {
    const role = await OrganizationRole.create({ organizationId: org.id, code: templateCode, templateCode, name: templateCode });
    await OrganizationRolePermission.create({ organizationId: org.id, roleId: role.id, permissionCode });
    await UserRoleAssignment.create({ organizationId: org.id, userId: maker.id, roleId: role.id, scopeType: 'ORGANISATION', effectiveFrom: '2020-01-01' });
  }
  for (const [actor, templateCode, permissionCode] of [[approver, 'APPROVING_AUTHORITY', 'expenses.approve'], [payer, 'ACCOUNTS_OFFICER', 'payments.pay']]) {
    const linked = await Employee.create({ organizationId: org.id, postCadreId: post.id, empCode: actor.name, name: actor.name, doj: '2020-01-01' });
    await actor.update({ employeeId: linked.id });
    const role = await OrganizationRole.create({ organizationId: org.id, code: `EXTRA_${actor.id}`, templateCode, name: actor.name });
    await OrganizationRolePermission.create({ organizationId: org.id, roleId: role.id, permissionCode });
    await UserRoleAssignment.create({ organizationId: org.id, userId: actor.id, roleId: role.id, scopeType: 'ORGANISATION', effectiveFrom: '2020-01-01' });
  }
  const app = express(); app.use(express.json()); app.use('/expenses', require('../src/routes/orgExpenses'));
  server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.on('error', reject); }); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await sequelize.close(); });
async function run(status = 'PROCESSED', extra = {}) {
  return PayrollRun.create({ organizationId: org.id, year: 2026, month: ++serial, status, processedByUserId: maker.id, processedAt: new Date(), ...extra });
}
const denied = promise => assert.rejects(promise, err => err.status === 403);
async function claim(extra = {}) {
  return ExpenseClaim.create({ organizationId: org.id, employeeId: employee.id, expenseDate: '2026-01-01', category: 'Travel', purpose: 'Travel', amount: 100, submittedBy: 900, preparedBy: maker.id, decidedBy: approver.id, status: 'APPROVED', ...extra });
}
async function expenseAction(row, action, actor, body) {
  const response = await fetch(`${base}/expenses/${row.id}/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${signToken(actor)}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

test('combined prepare, approve and payment roles cannot approve their own legacy payroll run', async () => {
  const access = await effectiveAccess(maker.id);
  for (const code of ['payroll.prepare', 'payroll.approve', 'payments.pay']) assert.equal(can(access, code), true);
  const row = await run();
  await denied(engine.approveRun(row, maker.id));
  assert.equal((await row.reload()).status, 'PROCESSED');
  await denied(engine.rejectRun(row, maker.id, 'Self rejection'));
  assert.equal((await row.reload()).status, 'PROCESSED');
});

test('payroll preparer and approver cannot record payment; unrelated actors can approve and pay', async () => {
  const row = await run();
  await engine.approveRun(row, approver.id);
  assert.equal(row.approvedByUserId, approver.id);
  await denied(engine.markPaid(row, maker.id));
  await denied(engine.markPaid(row, approver.id));
  assert.equal((await row.reload()).status, 'APPROVED');
  await engine.markPaid(row, payer.id);
  assert.equal((await row.reload()).paidByUserId, payer.id); assert.equal(row.status, 'PAID');
});

test('payment reloads persisted actor history instead of trusting a stale run object', async () => {
  const row = await run('APPROVED', { approvedByUserId: approver.id });
  const stale = await PayrollRun.findByPk(row.id);
  await row.update({ approvedByUserId: payer.id });
  await denied(engine.markPaid(stale, payer.id));
  assert.equal((await row.reload()).status, 'APPROVED');
});

test('financial proposal preparer cannot decide after changing legacy role; independent decision succeeds', async () => {
  const proposal = await FinancialChangeProposal.create({ organizationId: org.id, targetType: 'ORG_SETTINGS', patch: { otherAllowance: 1 }, effectiveDate: '2026-01-01', reason: 'test', preparedBy: maker.id });
  await maker.update({ role: 'APPROVING_AUTHORITY' });
  await denied(changes.decideFinancialChange({ organizationId: org.id, proposalId: proposal.id, decision: 'REJECTED', actorId: maker.id }));
  const decided = await changes.decideFinancialChange({ organizationId: org.id, proposalId: proposal.id, decision: 'REJECTED', actorId: approver.id });
  assert.equal(decided.decidedBy, approver.id); assert.equal(decided.status, 'REJECTED');
  await maker.update({ role: 'PAYROLL_OFFICER' });
});

test('expense payment denies preparer after role change, approver and claimant; independent accounts succeeds', async () => {
  const row = await claim(); const payment = { paidAt: '2026-11-16', paymentReference: 'REF-1' };
  for (const actor of [maker, approver]) {
    const oldRole = actor.role; await actor.update({ role: 'ACCOUNTS_OFFICER' });
    assert.equal((await expenseAction(row, 'pay', actor, payment)).status, 403);
    assert.equal((await row.reload()).status, 'APPROVED'); await actor.update({ role: oldRole });
  }
  const own = await claim({ submittedBy: payer.id });
  assert.equal((await expenseAction(own, 'pay', payer, payment)).status, 403);
  assert.equal((await expenseAction(row, 'pay', payer, payment)).status, 200);
  assert.equal((await row.reload()).paidBy, payer.id);
});

test('expense preparer and claimant cannot approve after role change; unrelated authority succeeds', async () => {
  const row = await claim({ status: 'PREPARED', decidedBy: null });
  await maker.update({ role: 'APPROVING_AUTHORITY' });
  assert.equal((await expenseAction(row, 'decide', maker, { decision: 'APPROVED' })).status, 403);
  await maker.update({ role: 'PAYROLL_OFFICER' });
  const own = await claim({ status: 'PREPARED', submittedBy: approver.id, decidedBy: null });
  assert.equal((await expenseAction(own, 'decide', approver, { decision: 'APPROVED' })).status, 403);
  assert.equal((await expenseAction(row, 'decide', approver, { decision: 'APPROVED' })).status, 200);
});

test('reprocessing cannot overwrite approval committed after the initial run lookup', async () => {
  const bank = await Organization.create({ code: 'PROCESSRACE', name: 'Processing Race Bank' });
  const initial = await engine.processRun({ organizationId: bank.id, year: 2026, month: 1, userId: maker.id });
  let approved = false;
  Employee.addHook('afterFind', 'approveDuringProcessing', async (_rows, options) => {
    if (options.where?.organization_id !== bank.id || approved) return;
    approved = true;
    await engine.approveRun(initial, approver.id);
  });
  try {
    await assert.rejects(engine.processRun({ organizationId: bank.id, year: 2026, month: 1, userId: payer.id }), err => err.status === 409);
    assert.equal(approved, true);
    assert.equal((await initial.reload()).status, 'APPROVED');
    assert.equal(initial.processedByUserId, maker.id);
  } finally { Employee.removeHook('afterFind', 'approveDuringProcessing'); }
});

test('approval fingerprint reads use the transaction holding the payroll run lock', async () => {
  const models = require('../src/models');
  const fingerprintModels = ['Employee', 'AllowanceType', 'PayScale', 'Organization', 'OrgPayrollSetting', 'PostCadre', 'PayStage', 'AllowanceTypePost', 'EmployeeAttendance', 'EmployeeBankAccount', 'EmployeeFestivalAdvance', 'EmployeeOverdraft', 'EmployeeRecurringDeposit', 'EmployeeLic', 'EmployeeHousingLoan', 'EmployeeVehicleLoan', 'EmployeeCompensationAssignment', 'OrganizationCatalogueAdoption', 'FinancialChangeProposal'];
  const row = await run('PROCESSED', { inputFingerprint: 'force-fingerprint-validation' });
  let heldTransaction;
  const reads = [];
  PayrollRun.addHook('beforeFind', 'observeApprovalLock', options => {
    if (options.lock) heldTransaction = options.transaction;
  });
  for (const name of fingerprintModels) models[name].addHook('beforeFind', 'observeFingerprintTransaction', options => reads.push({ name, transaction: options.transaction }));
  try {
    await assert.rejects(engine.approveRun(row, approver.id), err => err.status === 409 && /inputs changed/.test(err.message));
    assert.ok(heldTransaction);
    assert.deepEqual(reads.map(read => read.name).sort(), [...fingerprintModels].sort());
    for (const read of reads) assert.ok(read.transaction === heldTransaction, `${read.name} fingerprint read escaped the approval transaction`);
  } finally {
    PayrollRun.removeHook('beforeFind', 'observeApprovalLock');
    for (const name of fingerprintModels) models[name].removeHook('beforeFind', 'observeFingerprintTransaction');
  }
});
