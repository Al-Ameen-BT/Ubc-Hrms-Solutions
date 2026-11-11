'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'catalogue-payroll-test-secret';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { sequelize, Organization, BankRuleCatalogue, PostCadre, Employee, EmployeeCompensationAssignment, OrganizationCatalogueAdoption, PayrollRunLine, OrgPayrollSetting, User } = require('../src/models');
const { resolveCompensation, segmentsForMonth } = require('../src/services/compensationResolver');
const { computePayslip } = require('../src/services/payslip');
let employee, legacy, revision, server, base, hrToken;
before(async () => {
  await sequelize.sync();
  const org = await Organization.create({ code: 'SEG', name: 'Segment Bank', bankClass: 'CLASS_I' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'LEG', name: 'Legacy' });
  employee = await Employee.create({ organizationId: org.id, empCode: 'S1', name: 'Stage Clerk', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 9000 });
  legacy = await Employee.create({ organizationId: org.id, empCode: 'S2', name: 'Old Clerk', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 9000 });
  revision = await BankRuleCatalogue.create({ name: 'Class I', bankClass: 'CLASS_I', status: 'PUBLISHED', effectiveDate: '2026-04-01', orderNumber: 'GO/1', posts: [{ code: 'CLERK', name: 'Clerk', stages: [10000, 10500], payableDays: 30 }], rules: [], payrollDefaults: { daPercent: 12 }, createdByUserId: 1 });
  await OrganizationCatalogueAdoption.create({ organizationId: org.id, catalogueId: revision.id, effectiveDate: '2026-04-01', status: 'APPROVED', preparedBy: 1, decidedBy: 2 });
  await OrgPayrollSetting.create({ organizationId: org.id, daPercent: 1.2 });
  await EmployeeCompensationAssignment.bulkCreate([
    { organizationId: org.id, employeeId: employee.id, catalogueId: revision.id, postCode: 'CLERK', stageNo: 1, amount: 10000, effectiveDate: '2026-04-01', reason: 'Initial', status: 'APPROVED', preparedBy: 1, decidedBy: 2 },
    { organizationId: org.id, employeeId: employee.id, catalogueId: revision.id, postCode: 'CLERK', stageNo: 2, amount: 10500, effectiveDate: '2026-04-16', reason: 'Increment', status: 'APPROVED', preparedBy: 1, decidedBy: 2 },
  ]);
  const hr = await User.create({ organizationId: org.id, name: 'HR', email: 'hr@segment.invalid', role: 'HR_ADMIN', passwordHash: 'unused' });
  hrToken = require('../src/services/authService').signToken(hr);
  const app = express(); app.use(express.json()); app.use('/api/v1', require('../src/routes'));
  server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

test('payroll run uses adopted catalogue stage and defaults, then freezes provenance', async () => {
  const run = await require('../src/services/payrollEngine').processRun({ organizationId: employee.organizationId, year: 2026, month: 4 });
  const line = await PayrollRunLine.findOne({ where: { payrollRunId: run.id, employeeId: employee.id } });
  const slip = JSON.parse(line.payslipJson);
  assert.equal(slip.earnings.basic, 10250);
  assert.equal(slip.earnings.da, 1230);
  assert.equal(slip.compensationSegments[0].orderNumber, 'GO/1');
  assert.equal(slip.compensationSegments[1].stageNo, 2);
});


after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await sequelize.close(); });

test('live payslip preview matches the dated catalogue salary', async () => {
  const response = await fetch(`${base}/employees/${employee.id}/payslip?year=2026&month=4`, { headers: { Authorization: `Bearer ${hrToken}` } });
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.earnings.basic, 10250);
  assert.equal(data.earnings.da, 1230);
});

test('salary-based overdraft eligibility uses the effective approved stage', async () => {
  const response = await fetch(`${base}/employees/${employee.id}/overdrafts`, { headers: { Authorization: `Bearer ${hrToken}` } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.eligibility.basic, 10500);
});

test('service book reports effective catalogue pay and its government order', async () => {
  const response = await fetch(`${base}/employees/${employee.id}/service-book`, { headers: { Authorization: `Bearer ${hrToken}` } });
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.effectiveCompensation.basicPay, 10500);
  assert.equal(data.effectiveCompensation.orderNumber, 'GO/1');
});

test('a newly onboarded bank cannot process payroll before adoption', async () => {
  const org = await Organization.create({ code: 'PENDING', name: 'Pending Bank', bankClass: 'CLASS_I', requiresCatalogueAdoption: true });
  await assert.rejects(
    require('../src/services/payrollEngine').processRun({ organizationId: org.id, year: 2026, month: 4 }),
    /adoption/i,
  );
});

test('a new bank cannot pay an active employee without an approved dated assignment', async () => {
  const org = await Organization.create({ code: 'UNASSIGNED', name: 'Unassigned Bank', bankClass: 'CLASS_I', requiresCatalogueAdoption: true });
  const post = await PostCadre.create({ organizationId: org.id, code: 'CLERK', name: 'Clerk' });
  await OrganizationCatalogueAdoption.create({ organizationId: org.id, catalogueId: revision.id, effectiveDate: '2026-04-01', status: 'APPROVED', preparedBy: 1, decidedBy: 2 });
  await Employee.create({ organizationId: org.id, empCode: 'U1', name: 'Unassigned', doj: '2026-04-01', postCadreId: post.id, currentBasicPay: 10000 });
  await assert.rejects(require('../src/services/payrollEngine').processRun({ organizationId: org.id, year: 2026, month: 4 }), /salary assignment/i);
});

test('a pending new bank cannot use the old employee editor to set salary', async () => {
  const org = await Organization.findOne({ where: { code: 'UNASSIGNED' } });
  const worker = await Employee.findOne({ where: { organizationId: org.id } });
  const admin = await User.create({ organizationId: org.id, name: 'Pending HR', email: 'pending-hr@segment.invalid', role: 'HR_ADMIN', passwordHash: 'unused' });
  const token = require('../src/services/authService').signToken(admin);
  const response = await fetch(`${base}/employees/${worker.id}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ currentBasicPay: 50000 }) });
  assert.equal(response.status, 409);
});

test('a new bank can onboard an employee without a salary before separate assignment', async () => {
  const org = await Organization.findOne({ where: { code: 'UNASSIGNED' } });
  const post = await PostCadre.findOne({ where: { organizationId: org.id } });
  const admin = await User.findOne({ where: { organizationId: org.id, role: 'HR_ADMIN' } });
  const token = require('../src/services/authService').signToken(admin);
  const response = await fetch(`${base}/employees`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId: org.id, empCode: 'U2', name: 'Pending Salary', dob: '1995-01-01', doj: '2026-04-01', postCadreId: post.id, designation: 'Clerk', gender: 'FEMALE', panNumber: 'AAAAA0000A', aadhaarNumber: '123456789012', personalEmail: 'u2@example.invalid', bankName: 'Bank', bankAccountNumber: '123', bankIfsc: 'ABCD0123456' }) });
  assert.equal(response.status, 201);
  const { data } = await response.json();
  assert.equal(data.currentBasicPay ?? null, null);
});

test('new-bank bulk import cannot activate deductions before approval', async () => {
  const org = await Organization.findOne({ where: { code: 'UNASSIGNED' } });
  const admin = await User.findOne({ where: { organizationId: org.id, role: 'HR_ADMIN' } });
  const token = require('../src/services/authService').signToken(admin);
  const csv = 'empCode,name,doj,postCode,welfareFundOptIn,gsliOptIn,taxRegime\nU3,Bulk Worker,2026-04-01,CLERK,TRUE,TRUE,OLD';
  const response = await fetch(`${base}/employees/bulk-import`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.summary.created, 0);
});

test('catalogue-linked salary cannot be changed through employee master CRUD', async () => {
  const response = await fetch(`${base}/employees/${employee.id}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentBasicPay: 1, riskAllowance: 100 }),
  });
  assert.equal(response.status, 409);
  await employee.reload();
  assert.equal(Number(employee.currentBasicPay), 9000);
});

test('adopted bank payroll settings require a separate approval', async () => {
  const admin = await User.create({ organizationId: employee.organizationId, name: 'Admin', email: 'admin@segment.invalid', role: 'ORG_ADMIN', passwordHash: 'unused' });
  const adminToken = require('../src/services/authService').signToken(admin);
  const direct = await fetch(`${base}/org/settings/payroll`, { method: 'PUT', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ medicalAllowanceAmount: 6000, medicalAllowanceMonth: 5 }) });
  assert.equal(direct.status, 409);
  const proposed = await fetch(`${base}/org/financial-changes`, { method: 'POST', headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ targetType: 'ORG_SETTINGS', patch: { medicalAllowanceAmount: 6000, medicalAllowanceMonth: 5 }, effectiveDate: '2026-05-01', reason: 'Board decision' }) });
  assert.equal(proposed.status, 201);
  const { data } = await proposed.json();
  const sameActor = await fetch(`${base}/org/financial-changes/${data.id}/decide`, { method: 'POST', headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'APPROVED' }) });
  assert.equal(sameActor.status, 403);
  const authority = await User.create({ organizationId: employee.organizationId, name: 'Approver', email: 'approver@segment.invalid', role: 'APPROVING_AUTHORITY', passwordHash: 'unused' });
  const token = require('../src/services/authService').signToken(authority);
  const approved = await fetch(`${base}/org/financial-changes/${data.id}/decide`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'APPROVED' }) });
  assert.equal(approved.status, 200);
  const settings = await require('../src/services/financialChanges').settingsForDate(employee.organizationId, '2026-05-01');
  assert.equal(Number(settings.medicalAllowanceAmount), 6000);
  const prior = await require('../src/services/financialChanges').settingsForDate(employee.organizationId, '2026-04-30');
  assert.equal(Number(prior.medicalAllowanceAmount), 4000);
});

test('approved dated settings and employee allowance affect payroll only from their effective month', async () => {
  const prepared = await require('../src/services/financialChanges').proposeFinancialChange({ organizationId: employee.organizationId, targetType: 'EMPLOYEE', targetId: employee.id, patch: { riskAllowance: 200 }, effectiveDate: '2026-05-01', reason: 'Approved risk duty', actorId: 1 });
  await require('../src/services/financialChanges').decideFinancialChange({ organizationId: employee.organizationId, proposalId: prepared.id, decision: 'APPROVED', actorId: 2 });
  const run = await require('../src/services/payrollEngine').processRun({ organizationId: employee.organizationId, year: 2026, month: 5 });
  const line = await PayrollRunLine.findOne({ where: { payrollRunId: run.id, employeeId: employee.id } });
  const slip = JSON.parse(line.payslipJson);
  assert.equal(slip.earnings.riskAllowance, 200);
  assert.equal(slip.earnings.medicalAllowance, 6000);
});

test('financial proposals reject malformed amounts and government-controlled rates', async () => {
  const changes = require('../src/services/financialChanges');
  const common = { organizationId: employee.organizationId, targetType: 'ORG_SETTINGS', effectiveDate: '2026-06-01', reason: 'Test', actorId: 1 };
  await assert.rejects(changes.proposeFinancialChange({ ...common, patch: { medicalAllowanceAmount: 'not money' } }), /number|amount|value/i);
  await assert.rejects(changes.proposeFinancialChange({ ...common, patch: { daPercent: 99 } }), /government/i);
  await assert.rejects(changes.proposeFinancialChange({ ...common, patch: { retirementAge: 500 } }), /retirementAge|range|years/i);
  await assert.rejects(changes.proposeFinancialChange({ ...common, patch: { medicalAllowanceAmount: 9999999999 } }), /medicalAllowanceAmount|range/i);
});

test('bank-class change blocks payroll until that class has an approved adoption', async () => {
  const org = await Organization.findByPk(employee.organizationId);
  await org.update({ bankClass: 'CLASS_V' });
  try { await assert.rejects(require('../src/services/payrollEngine').processRun({ organizationId: org.id, year: 2026, month: 5 }), /class|adoption/i); }
  finally { await org.update({ bankClass: 'CLASS_I' }); }
});

test('class change still requires remapping old-class salary assignments', async () => {
  const org = await Organization.findByPk(employee.organizationId);
  const rule = await BankRuleCatalogue.create({ name: 'Class V', bankClass: 'CLASS_V', status: 'PUBLISHED', effectiveDate: '2026-06-01', posts: [{ code: 'CLERK', name: 'Clerk', stages: [8000], payableDays: 30 }], rules: [], payrollDefaults: {}, createdByUserId: 1 });
  await OrganizationCatalogueAdoption.create({ organizationId: org.id, catalogueId: rule.id, effectiveDate: '2026-06-01', status: 'APPROVED', preparedBy: 1, decidedBy: 2 });
  await org.update({ bankClass: 'CLASS_V' });
  try { await assert.rejects(require('../src/services/payrollEngine').processRun({ organizationId: org.id, year: 2026, month: 6 }), /class|remap/i); }
  finally { await org.update({ bankClass: 'CLASS_I' }); }
});

test('legacy direct-pay edit cannot bypass approval once the employee is assigned', async () => {
  const post = await PostCadre.findOne({ where: { organizationId: employee.organizationId } });
  const worker = await Employee.create({ organizationId: employee.organizationId, empCode: 'D1', name: 'Direct Pay', doj: '2020-01-01', postCadreId: post.id, directPay: true, currentBasicPay: 10000 });
  await EmployeeCompensationAssignment.create({ organizationId: employee.organizationId, employeeId: worker.id, amount: 10000, effectiveDate: '2026-04-01', reason: 'Initial', status: 'APPROVED', preparedBy: 1, decidedBy: 2 });
  const response = await fetch(`${base}/employees/${worker.id}/direct-pay-salary`, { method: 'PUT', headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 12000, reason: 'Raise' }) });
  assert.equal(response.status, 409);
});

test('resolver reads the immutable stage for each date and keeps legacy fallback', async () => {
  assert.equal((await resolveCompensation(employee, '2026-04-15')).basicPay, 10000);
  const after = await resolveCompensation(employee, '2026-04-16');
  assert.equal(after.basicPay, 10500);
  assert.equal(after.orderNumber, 'GO/1');
  assert.equal((await resolveCompensation(legacy, '2026-04-16')).basicPay, 9000);
});

test('mid-month stage change splits basic and percentage earnings once', async () => {
  const segments = await segmentsForMonth(employee, 2026, 4);
  assert.deepEqual(segments.map(row => [row.fromDate, row.toDate, row.basicPay]), [['2026-04-01', '2026-04-15', 10000], ['2026-04-16', '2026-04-30', 10500]]);
  const slip = computePayslip(employee, { daPercent: 12, hraType: 'PERCENT', hraPercent: 0, pfCalculationBase: 'BASIC', pfEmployeePercent: 0, pfEmployerPercent: 0, medicalAllowanceMonth: 12, bonusMonth: 12, ptSchedule: 'MONTHLY' }, 4, {}, null, [], segments);
  assert.equal(slip.earnings.basic, 10250);
  assert.equal(slip.earnings.da, 1230);
  assert.equal(slip.compensationSegments.length, 2);
  assert.equal(slip.compensationSegments[0].catalogueId, revision.id);
});

test('first mid-month mapping preserves the employee prior salary for earlier days', async () => {
  const post = await PostCadre.findOne({ where: { organizationId: employee.organizationId } });
  const worker = await Employee.create({ organizationId: employee.organizationId, empCode: 'S3', name: 'New Mapping', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 9000 });
  const proposal = await require('../src/services/compensationAssignments').proposeAssignment({ organizationId: employee.organizationId, employeeId: worker.id, catalogueId: revision.id, postCode: 'CLERK', stageNo: 1, effectiveDate: '2026-04-16', actorId: 1, reason: 'First mapping' });
  await require('../src/services/compensationAssignments').decideAssignment({ organizationId: employee.organizationId, proposalId: proposal.id, decision: 'APPROVED', actorId: 2 });
  await worker.reload();
  const segments = await segmentsForMonth(worker, 2026, 4);
  assert.deepEqual(segments.map(row => row.basicPay), [9000, 10000]);
  const estimate = await require('../src/services/arrears').basicPayAsOfMonth(employee.organizationId, worker.id, 2026, 5);
  assert.equal(estimate.amount, 10000);
  assert.equal(estimate.source, 'CATALOGUE_ASSIGNMENT');
});

test('a mid-month adopted rate revision splits DA without paying monthly items twice', async () => {
  const org = await Organization.create({ code: 'RATES', name: 'Rate Bank', bankClass: 'CLASS_I' });
  const post = await PostCadre.create({ organizationId: org.id, code: 'OLD', name: 'Old' });
  const worker = await Employee.create({ organizationId: org.id, empCode: 'R1', name: 'Worker', doj: '2020-01-01', postCadreId: post.id, currentBasicPay: 10000 });
  const old = await BankRuleCatalogue.create({ name: 'Old', bankClass: 'CLASS_I', status: 'SUPERSEDED', effectiveDate: '2026-04-01', orderNumber: 'GO/OLD', posts: [{ code: 'CLERK', name: 'Clerk', stages: [10000], payableDays: 30 }], rules: [], payrollDefaults: { daPercent: 12, pfEmployeePercent: 12 }, createdByUserId: 1 });
  const next = await BankRuleCatalogue.create({ name: 'New', bankClass: 'CLASS_I', status: 'PUBLISHED', effectiveDate: '2026-04-16', orderNumber: 'GO/NEW', posts: [{ code: 'CLERK', name: 'Clerk', stages: [10000], payableDays: 30 }], rules: [], payrollDefaults: { daPercent: 20, pfEmployeePercent: 20 }, createdByUserId: 1 });
  await OrganizationCatalogueAdoption.bulkCreate([
    { organizationId: org.id, catalogueId: old.id, effectiveDate: '2026-04-01', status: 'APPROVED', preparedBy: 1, decidedBy: 2 },
    { organizationId: org.id, catalogueId: next.id, effectiveDate: '2026-04-16', status: 'APPROVED', preparedBy: 1, decidedBy: 2 },
  ]);
  await EmployeeCompensationAssignment.create({ organizationId: org.id, employeeId: worker.id, catalogueId: old.id, postCode: 'CLERK', stageNo: 1, amount: 10000, effectiveDate: '2026-04-01', reason: 'Initial', status: 'APPROVED', preparedBy: 1, decidedBy: 2 });
  const run = await require('../src/services/payrollEngine').processRun({ organizationId: org.id, year: 2026, month: 4 });
  const line = await PayrollRunLine.findOne({ where: { payrollRunId: run.id, employeeId: worker.id } });
  const slip = JSON.parse(line.payslipJson);
  assert.equal(slip.earnings.basic, 10000);
  assert.equal(slip.earnings.da, 1600);
  assert.equal(slip.deductions.pfEmployee, 1600);
  assert.equal(slip.compensationSegments.length, 2);
});

test('employee allowance approved mid-month is prorated over that month', async () => {
  const changes = require('../src/services/financialChanges');
  const proposal = await changes.proposeFinancialChange({ organizationId: employee.organizationId, targetType: 'EMPLOYEE', targetId: employee.id, patch: { otherAllowance: 300 }, effectiveDate: '2026-04-16', reason: 'Midmonth duty', actorId: 1 });
  await changes.decideFinancialChange({ organizationId: employee.organizationId, proposalId: proposal.id, decision: 'APPROVED', actorId: 2 });
  const segments = await segmentsForMonth(employee, 2026, 4);
  const settings = segments.at(-1).settings;
  const slip = computePayslip({ ...employee.toJSON(), ...segments.at(-1).employeeFields }, settings, 4, {}, null, [], segments);
  assert.equal(slip.earnings.otherAllowance, 150);
  assert.equal(slip.compensationSegments[1].employeeFields, undefined);
});

test('loss of pay uses each salary segment payable-day basis', () => {
  const settings = { daPercent: 0, hraType: 'PERCENT', hraPercent: 0, pfCalculationBase: 'BASIC', pfEmployeePercent: 0, pfEmployerPercent: 0, medicalAllowanceMonth: 12, bonusMonth: 12, ptSchedule: 'MONTHLY' };
  const fields = employee.toJSON();
  const segments = [
    { fromDate: '2026-04-01', toDate: '2026-04-15', source: 'CATALOGUE', basicPay: 10000, payableDays: 30, settings, employeeFields: fields },
    { fromDate: '2026-04-16', toDate: '2026-04-30', source: 'CATALOGUE', basicPay: 10000, payableDays: 20, settings, employeeFields: fields },
  ];
  const slip = computePayslip(employee, settings, 4, {}, { lopDays: 3 }, [], segments);
  assert.equal(slip.earnings.basic, 9375);
});

test('loan reference month uses the requested payroll year', () => {
  const date = require('../src/services/loans').asOfForMonth(4, 2024);
  assert.equal(date.toISOString().slice(0, 10), '2024-04-01');
});

test('payroll approval requires reprocessing after a direct allowance or loan change', async () => {
  const engine = require('../src/services/payrollEngine');
  const { AllowanceType, EmployeeFestivalAdvance } = require('../src/models');
  const run = await engine.processRun({ organizationId: employee.organizationId, year: 2026, month: 5, userId: 1 });
  await AllowanceType.create({ organizationId: employee.organizationId, name: 'New grant', frequency: 'MONTHLY', amount: 100 });
  await assert.rejects(engine.approveRun(run, 2), /reprocess|changed|stale/i);
  const refreshed = await engine.processRun({ organizationId: employee.organizationId, year: 2026, month: 5, userId: 1 });
  await EmployeeFestivalAdvance.create({ employeeId: employee.id, amount: 1000, availedDate: '2026-05-01', repayMonths: 5 });
  await assert.rejects(engine.approveRun(refreshed, 2), /reprocess|changed|stale/i);
});

test('the payroll preparer cannot approve their own catalogue-bank run', async () => {
  const engine = require('../src/services/payrollEngine');
  const org = await Organization.findOne({ where: { code: 'RATES' } });
  const run = await engine.processRun({ organizationId: org.id, year: 2026, month: 5, userId: 1 });
  await assert.rejects(engine.approveRun(run, 1), /different|separate/i);
});

test('a processed payroll run cannot be approved after a relevant salary approval', async () => {
  const engine = require('../src/services/payrollEngine');
  const run = await engine.findCurrentRun(employee.organizationId, 2026, 4);
  run.processedAt = new Date('2026-05-01T00:00:00Z');
  await run.save();
  const proposal = await EmployeeCompensationAssignment.create({ organizationId: employee.organizationId, employeeId: employee.id, catalogueId: revision.id, postCode: 'CLERK', stageNo: 1, amount: 10000, effectiveDate: '2026-04-20', reason: 'Correction', preparedBy: 1 });
  await require('../src/services/compensationAssignments').decideAssignment({ organizationId: employee.organizationId, proposalId: proposal.id, decision: 'APPROVED', actorId: 2 });
  await assert.rejects(engine.approveRun(run, 3), /reprocess|changed|stale/i);
});
