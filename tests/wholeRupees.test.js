'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sequelize, OrgPayrollSetting, Organization, PayStage, EmployeeAttendance, Employee, PostCadre, PayRevision, PayScale } = require('../src/models');
const { scheduleStatus, housingLoanEmi } = require('../src/services/loans');
const { computePayslip } = require('../src/services/payslip');
const catalogue = require('../src/services/bankRuleCatalogue');
let org, post, scale;
before(async () => { await sequelize.sync(); org = await Organization.create({ code: 'ROUND', name: 'Rounding test', bankClass: 'CLASS_I' }); post = await PostCadre.create({ organizationId: org.id, code: 'T', name: 'Test post' }); const revision = await PayRevision.create({ organizationId: org.id, name: 'Test', effectiveDate: '2026-01-01' }); scale = await PayScale.create({ organizationId: org.id, payRevisionId: revision.id, code: 'T', name: 'Test', effectiveFrom: '2026-01-01' }); });
after(async () => { await sequelize.close(); });
test('new and changed money values round half up; percentages retain precision', async () => {
  const settings = await OrgPayrollSetting.create({ organizationId: org.id, medicalAllowanceAmount: 140.5, hraMaxAmount: 140.4, daPercent: 12.345, odMultiplier: 15.5 });
  assert.equal(Number(settings.medicalAllowanceAmount), 141);
  assert.equal(Number(settings.hraMaxAmount), 140);
  assert.equal(Number(settings.daPercent), 12.345);
  assert.equal(Number(settings.odMultiplier), 15.5);
  await OrgPayrollSetting.update({ medicalAllowanceAmount: 3000.4 }, { where: { id: settings.id } });
  assert.equal(Number((await settings.reload()).medicalAllowanceAmount), 3000);
});
test('fractional attendance remains supported; historical money is not rewritten by unrelated edits', async () => {
  const employee = await Employee.create({ organizationId: org.id, empCode: 'T1', name: 'Test', postCadreId: post.id, doj: '2020-01-01', currentBasicPay: 123.1 });
  assert.equal(Number(employee.currentBasicPay), 123);
  const attendance = await EmployeeAttendance.create({ employeeId: employee.id, year: 2026, month: 1, lopDays: 0.5 });
  assert.equal(Number(attendance.lopDays), 0.5);
  await sequelize.query('UPDATE employee SET current_basic_pay = 123.45 WHERE id = :id', { replacements: { id: employee.id } });
  await employee.reload(); employee.name = 'Renamed'; await employee.save();
  assert.equal(Number((await employee.reload()).currentBasicPay), 123.45);
});
test('bulk-created stages use whole rupees', async () => {
  const stages = await PayStage.bulkCreate([{ payScaleId: scale.id, stageNo: 1, amount: 200.6 }], { validate: false });
  assert.equal(Number(stages[0].amount), 201);
});
test('catalogue monetary settings and scales require integers; decimal percentages stay valid', () => {
  const metadata = catalogue.payrollFields();
  assert.equal(metadata.find(f => f.key === 'medicalAllowanceAmount').decimals, 0);
  assert.equal(metadata.find(f => f.key === 'daPercent').decimals, 3);
  assert.throws(() => catalogue.expandStages('100.10-0.10/2-100.30'), /whole|integer/i);
});
test('festival recovery uses whole instalments and an exact final balance', () => {
  const record = { amount: 1000, repayMonths: 3, availedDate: '2026-01-01' };
  const rows = [0, 1, 2].map(m => scheduleStatus(record, new Date(Date.UTC(2026, m, 1))));
  assert.deepEqual(rows.map(r => r.dueThisMonth), [334, 334, 332]);
  assert.equal(rows.reduce((s, r) => s + r.dueThisMonth, 0), 1000);
  assert.equal(scheduleStatus(record, new Date('2026-04-01')).balanceRemaining, 0);
});

test('loan EMI cannot round below the amount needed to repay principal', () => {
  assert.equal(housingLoanEmi({ totalLoanAmount: 1000, interestRatePercent: 0, periodMonths: 3 }), 334);
});
test('custom allowance displayed rows sum to their total and gross earnings', () => {
  const settings = { daPercent: 0, hraPercent: 0, pfEmployeePercent: 0, pfEmployerPercent: 0, medicalAllowanceMonth: 12, bonusMonth: 12 };
  const payslip = computePayslip({ currentBasicPay: 10000, daType: 'VARIABLE', gsliOptIn: false }, settings, 1, {}, null, [{ id: 1, name: 'One', amount: 1.5 }, { id: 2, name: 'Two', amount: 1.5 }]);
  assert.equal(payslip.earnings.customAllowancesTotal, 4);
  assert.equal(payslip.earnings.grossEarnings, 10004);
});

test('rupee conversion rounds at fifty paise and preserves percentage precision', () => {
  const { toPaise, toRupees, roundRupees, percentOf } = require('../src/utils/money');
  assert.equal(roundRupees(140.4), 140);
  assert.equal(roundRupees(140.5), 141);
  assert.equal(roundRupees(-140.5), -141);
  assert.equal(toRupees(toPaise(140.4)), 140);
  assert.equal(toRupees(toPaise(140.5)), 141);
  assert.equal(toRupees(toPaise(140.99)), 141);
  assert.equal(toRupees(percentOf(toPaise(10001), 12.345)), 1235);
  assert.equal(toRupees(toPaise(100)), 100);
  assert.equal(percentOf(toPaise(1), 0.1), 0);
  assert.equal(toRupees(percentOf(toPaise(1), 0.1)), 0);
});

test('payslip rounds displayed earnings at fifty paise', () => {
  const settings = { daPercent: 0, hraPercent: 0, pfEmployeePercent: 0, pfEmployerPercent: 0, medicalAllowanceMonth: 12, bonusMonth: 12 };
  const payslip = computePayslip({ currentBasicPay: 140.4, daType: 'VARIABLE', gsliOptIn: false }, settings, 1, {});
  assert.equal(payslip.earnings.basic, 140);
  assert.equal(payslip.earnings.grossEarnings, 140);
});

test('arrears instalments preserve the total with an exact final remainder', async () => {
  const { DaRevision, ArrearsCase, ArrearsInstallment } = require('../src/models');
  const { setInstallments } = require('../src/services/arrears');
  const employee = await Employee.findOne();
  const revision = await DaRevision.create({ organizationId: org.id, orderNumber: 'TEST', orderDate: '2026-01-01', effectiveFrom: '2026-01-01', previousDaPercent: 1, increasePercent: 1, revisedDaPercent: 2 });
  const arrears = await ArrearsCase.create({ organizationId: org.id, daRevisionId: revision.id, employeeId: employee.id, empCode: employee.empCode, employeeName: employee.name, totalCalculatedAmount: 1000, effectiveTotalAmount: 1000 });
  await setInstallments(arrears, { numberOfInstallments: 3, startYear: 2026, startMonth: 1 });
  let rows = await ArrearsInstallment.findAll({ where: { arrearsCaseId: arrears.id }, order: [['month', 'ASC']] });
  assert.deepEqual(rows.map(r => Number(r.amount)), [334, 334, 332]);
  assert.equal(rows.reduce((s, r) => s + Number(r.amount), 0), 1000);
  await arrears.update({ effectiveTotalAmount: 100 });
  await setInstallments(arrears, { numberOfInstallments: 60, startYear: 2026, startMonth: 1 });
  rows = await ArrearsInstallment.findAll({ where: { arrearsCaseId: arrears.id } });
  assert.equal(rows.reduce((s, r) => s + Number(r.amount), 0), 100);
  assert.ok(rows.every(r => Number(r.amount) >= 1));
});
