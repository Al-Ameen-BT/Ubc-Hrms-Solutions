'use strict';

/**
 * REPORTING ENDPOINTS — /api/v1/organizations/:orgId/reports
 * ============================================================================
 * Provides audit-ready reporting and exports for:
 *   - Loans Portfolio & Recoveries
 *   - Insurance Policies & Staff Benefits
 *   - Master Salary, Arrears & Deductions Register
 *
 * Formats:
 *   - application/json (UI table & dashboard cards)
 *   - application/vnd.openxmlformats-officedocument.spreadsheetml.sheet (.xlsx)
 *   - text/csv (.csv)
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireFeaturePermission } = require('../middleware/permissions');
const { requireFeature } = require('../middleware/featureGate');
const { Organization } = require('../models');
const { audit } = require('../services/audit');
const reports = require('../services/reports');

const router = express.Router({ mergeParams: true });

const VIEWERS = [
  'SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER',
  'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'AUDITOR'
];

router.use(authenticate);

router.use((req, res, next) => {
  if (req.user.role !== 'SUPER_ADMIN' && String(req.params.orgId) !== String(req.user.organizationId)) {
    return res.status(403).json({ status: 'error', message: "Cannot access another organisation's reports" });
  }
  next();
});

router.use(requireFeature('payroll'));

async function loadOrgOr404(req, res) {
  const org = await Organization.findByPk(req.params.orgId);
  if (!org) {
    res.status(404).json({ status: 'error', message: 'Organisation not found' });
    return null;
  }
  return org;
}

// ------------------------------------------------------------- Summary KPIs
router.get('/summary', requireFeaturePermission('payroll.view', VIEWERS), async (req, res) => {
  try {
    const org = await loadOrgOr404(req, res);
    if (!org) return;

    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const data = await reports.getReportsSummary({
      organizationId: org.id,
      branchId,
    });
    res.json({ data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ------------------------------------------------------------- Loans Report (JSON)
router.get('/loans', requireFeaturePermission('compensation.view', VIEWERS), async (req, res) => {
  try {
    const org = await loadOrgOr404(req, res);
    if (!org) return;

    const { branchId, loanType, status, asOfDate } = req.query;
    const reportData = await reports.getLoansReport({
      organizationId: org.id,
      branchId: branchId ? Number(branchId) : null,
      loanType: loanType || 'ALL',
      status: status || 'ALL',
      asOfDate,
    });
    res.json({ data: reportData });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ------------------------------------------------------------- Loans Export (XLSX / CSV)
router.get('/loans/export', requireFeaturePermission('payroll.export', VIEWERS), async (req, res) => {
  try {
    const org = await loadOrgOr404(req, res);
    if (!org) return;

    const { branchId, loanType, status, asOfDate, format = 'xlsx' } = req.query;
    const reportData = await reports.getLoansReport({
      organizationId: org.id,
      branchId: branchId ? Number(branchId) : null,
      loanType: loanType || 'ALL',
      status: status || 'ALL',
      asOfDate,
    });

    await audit(req, 'report.loans.exported', {
      organizationId: org.id,
      targetType: 'report',
      details: { format, count: reportData.rows.length, loanType, status },
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    if (format.toLowerCase() === 'csv') {
      const csv = reports.buildLoansCsv(reportData, org);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="loans-report-${org.code}-${timestamp}.csv"`);
      return res.send(csv);
    }

    const buffer = await reports.buildLoansExcelWorkbook(reportData, org);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="loans-report-${org.code}-${timestamp}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ------------------------------------------------------------- Insurance Report (JSON)
router.get('/insurance-policies', requireFeaturePermission('compensation.view', VIEWERS), async (req, res) => {
  try {
    const org = await loadOrgOr404(req, res);
    if (!org) return;

    const { branchId, policyType, status } = req.query;
    const reportData = await reports.getInsuranceReport({
      organizationId: org.id,
      branchId: branchId ? Number(branchId) : null,
      policyType: policyType || 'ALL',
      status: status || 'ALL',
    });
    res.json({ data: reportData });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ------------------------------------------------------------- Insurance Export (XLSX / CSV)
router.get('/insurance-policies/export', requireFeaturePermission('payroll.export', VIEWERS), async (req, res) => {
  try {
    const org = await loadOrgOr404(req, res);
    if (!org) return;

    const { branchId, policyType, status, format = 'xlsx' } = req.query;
    const reportData = await reports.getInsuranceReport({
      organizationId: org.id,
      branchId: branchId ? Number(branchId) : null,
      policyType: policyType || 'ALL',
      status: status || 'ALL',
    });

    await audit(req, 'report.insurance.exported', {
      organizationId: org.id,
      targetType: 'report',
      details: { format, count: reportData.rows.length, policyType, status },
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    if (format.toLowerCase() === 'csv') {
      const csv = reports.buildInsuranceCsv(reportData, org);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="insurance-policies-report-${org.code}-${timestamp}.csv"`);
      return res.send(csv);
    }

    const buffer = await reports.buildInsuranceExcelWorkbook(reportData, org);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="insurance-policies-report-${org.code}-${timestamp}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ------------------------------------------------------------- Salary Data Report (JSON)
router.get('/salary-data', requireFeaturePermission('payroll.view', VIEWERS), async (req, res) => {
  try {
    const org = await loadOrgOr404(req, res);
    if (!org) return;

    const { branchId, year, month, status } = req.query;
    const reportData = await reports.getSalaryDataReport({
      organizationId: org.id,
      branchId: branchId ? Number(branchId) : null,
      year: year ? Number(year) : null,
      month: month ? Number(month) : null,
      status: status || 'ALL',
    });
    res.json({ data: reportData });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ------------------------------------------------------------- Salary Data Export (XLSX / CSV)
router.get('/salary-data/export', requireFeaturePermission('payroll.export', VIEWERS), async (req, res) => {
  try {
    const org = await loadOrgOr404(req, res);
    if (!org) return;

    const { branchId, year, month, status, format = 'xlsx' } = req.query;
    const reportData = await reports.getSalaryDataReport({
      organizationId: org.id,
      branchId: branchId ? Number(branchId) : null,
      year: year ? Number(year) : null,
      month: month ? Number(month) : null,
      status: status || 'ALL',
    });

    await audit(req, 'report.salary_data.exported', {
      organizationId: org.id,
      targetType: 'report',
      details: { format, count: reportData.rows.length, period: reportData.period },
    });

    const periodStr = `${reportData.period.year}-${String(reportData.period.month).padStart(2, '0')}`;
    if (format.toLowerCase() === 'csv') {
      const csv = reports.buildSalaryDataCsv(reportData, org);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="master-salary-register-${org.code}-${periodStr}.csv"`);
      return res.send(csv);
    }

    const buffer = await reports.buildSalaryDataExcelWorkbook(reportData, org);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="master-salary-register-${org.code}-${periodStr}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
