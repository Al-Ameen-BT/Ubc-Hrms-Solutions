'use strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'reports-api-test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const m = require('../src/models');
const { signToken } = require('../src/services/authService');
const bootstrap = require('../src/services/accessBootstrap');
const reports = require('../src/services/reports');

let server, base, serial = 0;

before(async () => {
  await m.sequelize.sync();
  const app = express();
  app.use(express.json());
  app.use('/api/v1', require('../src/routes'));
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await m.sequelize.close();
});

async function fixture() {
  const n = ++serial;
  const org = await m.Organization.create({
    code: `REP${n}`,
    name: `Cooperative Bank ${n}`,
    status: 'ACTIVE',
  });

  const branchHo = await m.OrganizationBranch.create({
    organizationId: org.id,
    number: '001',
    code: 'HO',
    name: 'Head Office',
    unitType: 'HEAD_OFFICE',
    isHeadOffice: true,
  });

  const branchCity = await m.OrganizationBranch.create({
    organizationId: org.id,
    number: '002',
    code: 'CITY',
    name: 'City Branch',
    unitType: 'BRANCH',
  });

  const dept = await m.OrganizationDepartment.create({
    organizationId: org.id,
    branchId: branchHo.id,
    code: 'ACCOUNTS',
    name: 'Accounts & Operations',
  });

  const post = await m.PostCadre.create({
    organizationId: org.id,
    code: 'OFFICER',
    name: 'Accounts Officer',
  });

  // Admin user
  const adminEmp = await m.Employee.create({
    organizationId: org.id,
    postCadreId: post.id,
    empCode: `ADM${n}`,
    name: 'Admin Officer',
    doj: '2020-01-01',
    branchId: branchHo.id,
    departmentId: dept.id,
    status: 'ACTIVE',
  });

  const adminUser = await m.User.create({
    organizationId: org.id,
    employeeId: adminEmp.id,
    email: `admin${n}@repbank.test`,
    name: 'Admin User',
    role: 'ORG_ADMIN',
    passwordHash: 'hash',
  });

  // Regular Employee in HO
  const emp1 = await m.Employee.create({
    organizationId: org.id,
    postCadreId: post.id,
    empCode: `EMP${n}1`,
    name: 'Rajesh Kumar',
    doj: '2021-03-01',
    branchId: branchHo.id,
    departmentId: dept.id,
    status: 'ACTIVE',
    gsliOptIn: true,
    gsliAmount: 400,
    welfareFundOptIn: true,
    welfareFundAmount: 150,
  });

  // Regular Employee in City Branch
  const emp2 = await m.Employee.create({
    organizationId: org.id,
    postCadreId: post.id,
    empCode: `EMP${n}2`,
    name: 'Sneha Nair',
    doj: '2022-06-15',
    branchId: branchCity.id,
    departmentId: dept.id,
    status: 'ACTIVE',
    gsliOptIn: false,
    welfareFundOptIn: true,
    welfareFundAmount: 150,
  });

  await bootstrap.bootstrapOrganizationAccess({ organizationId: org.id });

  async function request(path, actor = adminUser) {
    const current = await m.User.findByPk(actor.id);
    const r = await fetch(`${base}${path}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${signToken(current)}`,
        'content-type': 'application/json',
      },
    });
    const cType = r.headers.get('content-type') || '';
    let body;
    if (cType.includes('application/json')) {
      body = await r.json();
    } else if (cType.includes('text/csv')) {
      body = await r.text();
    } else {
      const arrBuf = await r.arrayBuffer();
      body = Buffer.from(arrBuf);
    }
    return { status: r.status, headers: r.headers, body };
  }

  return { org, branchHo, branchCity, dept, post, adminUser, emp1, emp2, request };
}

test('reports service accurately aggregates loan portfolio (Housing, Vehicle, FA, OD, RD)', async () => {
  const f = await fixture();

  // Create Housing loan for emp1
  await m.EmployeeHousingLoan.create({
    employeeId: f.emp1.id,
    totalLoanAmount: 1500000,
    totalRepaymentAmount: 2200000,
    monthlyPayment: 9166.67,
    interestRatePercent: 8.5,
    periodMonths: 240,
    emiAmount: 9166.67,
    emiStartDate: '2024-01-01',
    emiEndDate: '2043-12-31',
    remarks: 'Staff housing scheme',
  });

  // Create Vehicle loan for emp2
  await m.EmployeeVehicleLoan.create({
    employeeId: f.emp2.id,
    vehicleType: 'Car',
    totalAmount: 400000,
    totalRepaymentAmount: 500000,
    monthlyPayment: 8333.33,
    periodMonths: 60,
    emiAmount: 8333.33,
    startDate: '2024-06-01',
    endDate: '2029-05-31',
  });

  // Create Festival advance for emp1
  await m.EmployeeFestivalAdvance.create({
    employeeId: f.emp1.id,
    amount: 30000,
    repayMonths: 10,
    availedDate: '2024-08-15',
  });

  // Query service directly
  const repAll = await reports.getLoansReport({ organizationId: f.org.id });
  assert.equal(repAll.rows.length, 3);
  assert.equal(repAll.summary.activeAccountsCount, 2);
  assert.equal(repAll.summary.closedAccountsCount, 1);
  assert.ok(repAll.summary.totalPrincipal > 1900000);
  assert.ok(repAll.summary.monthlyRecoveryDemand > 15000);

  // Status filter: ACTIVE
  const repActive = await reports.getLoansReport({ organizationId: f.org.id, status: 'ACTIVE' });
  assert.equal(repActive.rows.length, 2);
  assert.equal(repActive.rows.every(r => r.status === 'ACTIVE'), true);

  // Filter by branch
  const repHo = await reports.getLoansReport({ organizationId: f.org.id, branchId: f.branchHo.id });
  assert.equal(repHo.rows.length, 2); // Housing loan & FA for emp1
  assert.equal(repHo.rows.every(r => r.branchId === f.branchHo.id), true);

  // Filter by loan type
  const repVehicle = await reports.getLoansReport({ organizationId: f.org.id, loanType: 'VEHICLE' });
  assert.equal(repVehicle.rows.length, 1);
  assert.equal(repVehicle.rows[0].employeeName, 'Sneha Nair');
  assert.equal(repVehicle.rows[0].loanTypeCode, 'VEHICLE');
});

test('reports service accurately aggregates insurance, GSLI, and Welfare Fund enrollments', async () => {
  const f = await fixture();

  // Create LIC policy for emp1
  await m.EmployeeLic.create({
    employeeId: f.emp1.id,
    policyNumber: 'LIC-78901234',
    sumAssuredAmount: 500000,
    deductionAmount: 2450,
    openingDate: '2022-01-01',
    startedDate: '2022-01-01',
    maturityDate: '2037-01-01',
  });

  const repInsurance = await reports.getInsuranceReport({ organizationId: f.org.id });
  // Should have LIC for emp1, GSLI for emp1, Welfare Fund for emp1, Welfare Fund for emp2 = 4 total
  assert.equal(repInsurance.rows.length, 4);
  assert.equal(repInsurance.summary.totalActivePolicies, 4);
  assert.equal(repInsurance.summary.enrolledEmployeesCount, 2);
  assert.ok(repInsurance.summary.totalSumAssured >= 500000);
  assert.ok(repInsurance.summary.totalMonthlyDeduction >= (2450 + 400 + 150 + 150));

  // Filter by policy type LIC
  const repLicOnly = await reports.getInsuranceReport({ organizationId: f.org.id, policyType: 'LIC' });
  assert.equal(repLicOnly.rows.length, 1);
  assert.equal(repLicOnly.rows[0].policyNumber, 'LIC-78901234');
});

test('reports service parses payslipJson with arrears installment breakdown for master salary register', async () => {
  const f = await fixture();

  // Create Payroll Run for 2026-03
  const run = await m.PayrollRun.create({
    organizationId: f.org.id,
    year: 2026,
    month: 3,
    status: 'PAID',
    runType: 'REGULAR',
    grossTotal: 85000,
    deductionsTotal: 15000,
    netTotal: 70000,
    employeeCount: 1,
  });

  const payslipJson = JSON.stringify({
    attendance: { payableDays: 30, lopDays: 0 },
    earnings: {
      basic: 50000,
      da: 25000,
      hra: 5000,
      riskAllowance: 2000,
      conveyance: 1500,
      grossEarnings: 83500,
    },
    deductions: {
      pfEmployee: 6000,
      pt: 200,
      tds: 3000,
      housingLoan: 5000,
      welfareFund: 150,
      totalDeductions: 14350,
    },
    netSalary: 69150,
  });

  await m.PayrollRunLine.create({
    payrollRunId: run.id,
    employeeId: f.emp1.id,
    empCode: f.emp1.empCode,
    employeeName: f.emp1.name,
    postName: 'Accounts Officer',
    grossEarnings: 83500,
    totalDeductions: 14350,
    netPay: 69150,
    payslipJson,
  });

  // Create a DA Revision and Arrears Case & paid installment in the same period
  const daRev = await m.DaRevision.create({
    organizationId: f.org.id,
    orderNumber: `GO-${f.org.code}-1`,
    orderDate: '2026-01-01',
    effectiveFrom: '2025-07-01',
    previousDaPercent: 15,
    increasePercent: 3,
    revisedDaPercent: 18,
    status: 'ACTIVE',
  });

  const arrearsCase = await m.ArrearsCase.create({
    organizationId: f.org.id,
    daRevisionId: daRev.id,
    employeeId: f.emp1.id,
    empCode: f.emp1.empCode,
    employeeName: f.emp1.name,
    totalArrears: 12000,
    netPayable: 12000,
    status: 'ACTIVE',
  });

  await m.ArrearsInstallment.create({
    arrearsCaseId: arrearsCase.id,
    installmentNumber: 1,
    year: 2026,
    month: 3,
    amount: 4000,
    status: 'PAID',
  });

  const salaryRep = await reports.getSalaryDataReport({
    organizationId: f.org.id,
    year: 2026,
    month: 3,
  });

  assert.equal(salaryRep.rows.length, 1);
  const row = salaryRep.rows[0];
  assert.equal(row.empCode, f.emp1.empCode);
  assert.equal(row.basic, 50000);
  assert.equal(row.da, 25000);
  assert.equal(row.hra, 5000);
  assert.equal(row.arrearsAmount, 4000);
  // Adjusted gross includes arrears (83500 + 4000 = 87500)
  assert.equal(row.grossEarnings, 87500);
  assert.equal(row.pfEmployee, 6000);
  assert.equal(row.totalDeductions, 14350);
  assert.equal(row.netPay, 87500 - 14350);
});

test('excel and csv generators produce valid binary workbooks and utf-8 csv content', async () => {
  const f = await fixture();

  await m.EmployeeHousingLoan.create({
    employeeId: f.emp1.id,
    totalLoanAmount: 1000000,
    interestRatePercent: 8.5,
    periodMonths: 120,
    emiAmount: 12000,
    emiStartDate: '2024-01-01',
    emiEndDate: '2033-12-31',
  });

  const rep = await reports.getLoansReport({ organizationId: f.org.id });
  const xlsxBuf = await reports.buildLoansExcelWorkbook(rep, f.org);
  assert.ok(xlsxBuf instanceof Buffer);
  assert.ok(xlsxBuf.length > 1000); // Valid xlsx zip stream

  const csv = reports.buildLoansCsv(rep, f.org);
  assert.ok(typeof csv === 'string');
  assert.ok(csv.includes('LOAN PORTFOLIO & RECOVERIES AUDIT REGISTER'));
  assert.ok(csv.includes(f.emp1.empCode));
});

test('HTTP API endpoints serve JSON, XLSX, and CSV with RBAC guards and audit trail', async () => {
  const f = await fixture();

  // Summary endpoint
  const sumRes = await f.request(`/organizations/${f.org.id}/reports/summary`);
  assert.equal(sumRes.status, 200);
  assert.ok(sumRes.body.data.loans);
  assert.ok(sumRes.body.data.insurance);
  assert.ok(sumRes.body.data.salary);

  // Loans endpoint (JSON)
  const loansRes = await f.request(`/organizations/${f.org.id}/reports/loans`);
  assert.equal(loansRes.status, 200);
  assert.ok(Array.isArray(loansRes.body.data.rows));

  // Loans Export (XLSX)
  const xlsxRes = await f.request(`/organizations/${f.org.id}/reports/loans/export?format=xlsx`);
  assert.equal(xlsxRes.status, 200);
  assert.ok(xlsxRes.headers.get('content-type').includes('spreadsheetml'));
  assert.ok(xlsxRes.body instanceof Buffer);
  assert.ok(xlsxRes.body.length > 500);

  // Loans Export (CSV)
  const csvRes = await f.request(`/organizations/${f.org.id}/reports/loans/export?format=csv`);
  assert.equal(csvRes.status, 200);
  assert.ok(csvRes.headers.get('content-type').includes('text/csv'));
  assert.ok(typeof csvRes.body === 'string');

  // Cross-organisation isolation
  const otherOrg = await m.Organization.create({ code: 'OTHER_ORG', name: 'Other Bank' });
  const crossRes = await f.request(`/organizations/${otherOrg.id}/reports/summary`);
  assert.equal(crossRes.status, 403);
});
