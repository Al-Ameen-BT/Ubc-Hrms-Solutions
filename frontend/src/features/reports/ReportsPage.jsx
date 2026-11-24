import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, profileApi } from '../../api/extended';
import { fmt } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { StatLedger } from '../../components/ui/StatLedger';
import './ReportsPage.css';

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const REPORTS = [
  { id: 'loans', label: 'Loans & Advances', shortLabel: 'Loans', description: 'Employee advances, repayment demand and outstanding balances.' },
  { id: 'insurance', label: 'Insurance & Policies', shortLabel: 'Insurance', description: 'Staff policy coverage, deductions and maturity records.' },
  { id: 'salary', label: 'Master Salary Register', shortLabel: 'Salary register', description: 'Approved payroll earnings, deductions, arrears and net pay.' },
];

export function ReportsPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('loans'); // 'loans' | 'insurance' | 'salary'
  const [selectedBranch, setSelectedBranch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isExporting, setIsExporting] = useState(null);

  // Filters for Loans Tab
  const [loanType, setLoanType] = useState('ALL');
  const [loanStatus, setLoanStatus] = useState('ACTIVE');

  // Filters for Insurance Tab
  const [policyType, setPolicyType] = useState('ALL');
  const [policyStatus, setPolicyStatus] = useState('ACTIVE');

  // Filters for Master Salary Tab
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [salaryYear, setSalaryYear] = useState(currentYear);
  const [salaryMonth, setSalaryMonth] = useState(currentMonth);
  const [salaryStatus, setSalaryStatus] = useState('ALL');
  const activeReport = REPORTS.find((report) => report.id === activeTab) || REPORTS[0];

  // Fetch branches for filter
  const { data: branchesData } = useQuery({
    queryKey: ['org-branches', orgId],
    queryFn: () => profileApi.branches(),
    enabled: !!orgId,
  });
  const branches = branchesData?.rows || (Array.isArray(branchesData) ? branchesData : []);

  // Fetch Loans Data
  const {
    data: loansData,
    isLoading: isLoadingLoans,
    isError: isLoansError,
    error: loansError,
    refetch: refetchLoans,
  } = useQuery({
    queryKey: ['reports-loans', orgId, selectedBranch, loanType, loanStatus],
    queryFn: () =>
      reportsApi.loans(orgId, {
        branchId: selectedBranch || undefined,
        loanType,
        status: loanStatus,
      }),
    enabled: !!orgId && activeTab === 'loans',
  });

  // Fetch Insurance Data
  const {
    data: insuranceData,
    isLoading: isLoadingInsurance,
    isError: isInsuranceError,
    error: insuranceError,
    refetch: refetchInsurance,
  } = useQuery({
    queryKey: ['reports-insurance', orgId, selectedBranch, policyType, policyStatus],
    queryFn: () =>
      reportsApi.insurance(orgId, {
        branchId: selectedBranch || undefined,
        policyType,
        status: policyStatus,
      }),
    enabled: !!orgId && activeTab === 'insurance',
  });

  // Fetch Salary Data
  const {
    data: salaryData,
    isLoading: isLoadingSalary,
    isError: isSalaryError,
    error: salaryError,
    refetch: refetchSalary,
  } = useQuery({
    queryKey: ['reports-salary', orgId, selectedBranch, salaryYear, salaryMonth, salaryStatus],
    queryFn: () =>
      reportsApi.salaryData(orgId, {
        branchId: selectedBranch || undefined,
        year: salaryYear,
        month: salaryMonth,
        status: salaryStatus,
      }),
    enabled: !!orgId && activeTab === 'salary',
  });

  // Export Trigger
  const handleExport = async (format) => {
    setIsExporting(format);
    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      if (activeTab === 'loans') {
        const filename = `loans-portfolio-${timestamp}.${format}`;
        await reportsApi.downloadLoans(
          orgId,
          {
            branchId: selectedBranch || undefined,
            loanType,
            status: loanStatus,
            format,
          },
          filename
        );
      } else if (activeTab === 'insurance') {
        const filename = `insurance-policies-${timestamp}.${format}`;
        await reportsApi.downloadInsurance(
          orgId,
          {
            branchId: selectedBranch || undefined,
            policyType,
            status: policyStatus,
            format,
          },
          filename
        );
      } else if (activeTab === 'salary') {
        const periodStr = `${salaryYear}-${String(salaryMonth).padStart(2, '0')}`;
        const filename = `master-salary-register-${periodStr}.${format}`;
        await reportsApi.downloadSalaryData(
          orgId,
          {
            branchId: selectedBranch || undefined,
            year: salaryYear,
            month: salaryMonth,
            status: salaryStatus,
            format,
          },
          filename
        );
      }
      toast.add(`Export completed (${format.toUpperCase()})`, 'success');
    } catch (err) {
      toast.add(err.message || 'Export failed', 'error');
    } finally {
      setIsExporting(null);
    }
  };

  // Client-side search filters
  const filteredLoanRows = useMemo(() => {
    const rows = loansData?.rows || [];
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(
      (r) =>
        r.employeeName?.toLowerCase().includes(term) ||
        r.empCode?.toLowerCase().includes(term) ||
        r.accountOrRef?.toLowerCase().includes(term) ||
        r.branchName?.toLowerCase().includes(term)
    );
  }, [loansData, searchTerm]);

  const filteredInsuranceRows = useMemo(() => {
    const rows = insuranceData?.rows || [];
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(
      (r) =>
        r.employeeName?.toLowerCase().includes(term) ||
        r.empCode?.toLowerCase().includes(term) ||
        r.policyNumber?.toLowerCase().includes(term) ||
        r.branchName?.toLowerCase().includes(term)
    );
  }, [insuranceData, searchTerm]);

  const filteredSalaryRows = useMemo(() => {
    const rows = salaryData?.rows || [];
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(
      (r) =>
        r.employeeName?.toLowerCase().includes(term) ||
        r.empCode?.toLowerCase().includes(term) ||
        r.postName?.toLowerCase().includes(term) ||
        r.branchName?.toLowerCase().includes(term)
    );
  }, [salaryData, searchTerm]);

  const activeQuery = activeTab === 'loans'
    ? { isLoading: isLoadingLoans, isError: isLoansError, error: loansError, refetch: refetchLoans }
    : activeTab === 'insurance'
      ? { isLoading: isLoadingInsurance, isError: isInsuranceError, error: insuranceError, refetch: refetchInsurance }
      : { isLoading: isLoadingSalary, isError: isSalaryError, error: salaryError, refetch: refetchSalary };
  const activeRows = activeTab === 'loans' ? filteredLoanRows : activeTab === 'insurance' ? filteredInsuranceRows : filteredSalaryRows;
  const reportCounts = {
    loans: loansData?.summary?.activeAccountsCount,
    insurance: insuranceData?.summary?.totalActivePolicies,
    salary: salaryData?.summary?.employeeCount,
  };

  const resetActiveFilters = () => {
    setSelectedBranch('');
    setSearchTerm('');
    if (activeTab === 'loans') {
      setLoanType('ALL');
      setLoanStatus('ACTIVE');
    } else if (activeTab === 'insurance') {
      setPolicyType('ALL');
      setPolicyStatus('ACTIVE');
    } else {
      setSalaryYear(currentYear);
      setSalaryMonth(currentMonth);
      setSalaryStatus('ALL');
    }
  };

  return (
    <div className="reports-page page">
      {/* Page Header */}
      <div className="reports-header-row">
        <div>
          <h1 className="reports-title">Reports</h1>
          <p className="reports-subtitle text-muted">
            Review controlled employee financial registers and export the current scope for audit or reconciliation.
          </p>
        </div>
        <div className="reports-export-actions">
          <Button
            variant="secondary"
            loading={isExporting === 'csv'}
            disabled={!!isExporting || activeQuery.isLoading || activeQuery.isError || activeRows.length === 0}
            onClick={() => handleExport('csv')}
          >
            Export {activeReport.shortLabel} as CSV
          </Button>
          <Button
            variant="primary"
            loading={isExporting === 'xlsx'}
            disabled={!!isExporting || activeQuery.isLoading || activeQuery.isError || activeRows.length === 0}
            onClick={() => handleExport('xlsx')}
          >
            Export {activeReport.shortLabel} as Excel
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="reports-tabs-bar" role="tablist" aria-label="Available reports">
        {REPORTS.map((report) => (
          <button
            key={report.id}
            id={`report-tab-${report.id}`}
            type="button"
            role="tab"
            className={`reports-tab-btn ${activeTab === report.id ? 'active' : ''}`}
            aria-selected={activeTab === report.id}
            aria-controls={`report-panel-${report.id}`}
            tabIndex={activeTab === report.id ? 0 : -1}
            onClick={() => {
              setActiveTab(report.id);
              setSearchTerm('');
            }}
          >
            <span className="reports-tab-copy"><span className="reports-tab-label">{report.label}</span><small>{report.description}</small></span>
            {reportCounts[report.id] != null && <span className="reports-tab-pill">{reportCounts[report.id]}</span>}
          </button>
        ))}
      </div>

      {/* Filter Toolbar */}
      <section className="reports-filters-card card" aria-labelledby="reports-filter-title">
        <div className="reports-filter-heading"><div><h2 id="reports-filter-title">Report scope</h2><p>{activeReport.description}</p></div><Button variant="secondary" size="sm" onClick={resetActiveFilters}>Reset</Button></div>
        <div className="reports-filters-grid">
          {/* Universal Branch Selector */}
          <div className="filter-group">
            <label className="filter-label" htmlFor="reports-branch">Branch</label>
            <select
              id="reports-branch"
              className="input reports-control"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code || b.number})
                </option>
              ))}
            </select>
          </div>

          {/* Tab-Specific Filters */}
          {activeTab === 'loans' && (
            <>
              <div className="filter-group">
                <label className="filter-label" htmlFor="reports-loan-type">Loan type</label>
                <select
                  id="reports-loan-type"
                  className="input reports-control"
                  value={loanType}
                  onChange={(e) => setLoanType(e.target.value)}
                >
                  <option value="ALL">All Types</option>
                  <option value="HOUSING">Housing Loan</option>
                  <option value="VEHICLE">Vehicle Loan</option>
                  <option value="FESTIVAL_ADVANCE">Festival Advance</option>
                  <option value="OVERDRAFT">Overdraft</option>
                  <option value="RECURRING_DEPOSIT">Recurring Deposit</option>
                </select>
              </div>

              <div className="filter-group">
                <label className="filter-label" htmlFor="reports-loan-status">Status</label>
                <select
                  id="reports-loan-status"
                  className="input reports-control"
                  value={loanStatus}
                  onChange={(e) => setLoanStatus(e.target.value)}
                >
                  <option value="ACTIVE">Active Accounts</option>
                  <option value="CLOSED">Closed Accounts</option>
                  <option value="ALL">All Accounts</option>
                </select>
              </div>
            </>
          )}

          {activeTab === 'insurance' && (
            <>
              <div className="filter-group">
                <label className="filter-label" htmlFor="reports-policy-type">Policy type</label>
                <select
                  id="reports-policy-type"
                  className="input reports-control"
                  value={policyType}
                  onChange={(e) => setPolicyType(e.target.value)}
                >
                  <option value="ALL">All Policies</option>
                  <option value="LIC">LIC Policy</option>
                  <option value="GSLI">GSLI (Group Savings)</option>
                  <option value="WELFARE_FUND">Welfare Fund</option>
                </select>
              </div>

              <div className="filter-group">
                <label className="filter-label" htmlFor="reports-policy-status">Status</label>
                <select
                  id="reports-policy-status"
                  className="input reports-control"
                  value={policyStatus}
                  onChange={(e) => setPolicyStatus(e.target.value)}
                >
                  <option value="ACTIVE">Active Policies</option>
                  <option value="CLOSED">Matured / Closed</option>
                  <option value="ALL">All Policies</option>
                </select>
              </div>
            </>
          )}

          {activeTab === 'salary' && (
            <>
              <div className="filter-group">
                <label className="filter-label" htmlFor="reports-salary-year">Year</label>
                <select
                  id="reports-salary-year"
                  className="input reports-control"
                  value={salaryYear}
                  onChange={(e) => setSalaryYear(Number(e.target.value))}
                >
                  {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label className="filter-label" htmlFor="reports-salary-month">Month</label>
                <select
                  id="reports-salary-month"
                  className="input reports-control"
                  value={salaryMonth}
                  onChange={(e) => setSalaryMonth(Number(e.target.value))}
                >
                  {MONTH_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label className="filter-label" htmlFor="reports-salary-status">Payroll status</label>
                <select
                  id="reports-salary-status"
                  className="input reports-control"
                  value={salaryStatus}
                  onChange={(e) => setSalaryStatus(e.target.value)}
                >
                  <option value="ALL">All Runs</option>
                  <option value="PAID">Paid Only</option>
                  <option value="APPROVED">Approved / Confirmed</option>
                  <option value="DRAFT">Draft</option>
                </select>
              </div>
            </>
          )}

          {/* Quick Search */}
          <div className="filter-group filter-group-search">
            <label className="filter-label" htmlFor="reports-search">Search employee or reference</label>
            <input
              id="reports-search"
              type="text"
              className="input reports-control"
              placeholder="Name, employee ID or reference"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section id={`report-panel-${activeTab}`} role="tabpanel" aria-labelledby={`report-tab-${activeTab}`} className="reports-panel">
      {activeQuery.isError ? (
        <div className="reports-state reports-error-state" role="alert">
          <div><strong>{activeReport.label} could not be loaded</strong><span>{activeQuery.error?.message || 'Check your connection or access and try again.'}</span></div>
          <Button variant="secondary" size="sm" onClick={() => activeQuery.refetch()}>Retry loading {activeReport.shortLabel}</Button>
        </div>
      ) : (
        <>

      {/* TAB 1: LOANS PORTFOLIO & RECOVERIES */}
      {activeTab === 'loans' && (
        <div className="reports-content-section">
          {/* KPI Ledger */}
          <div className="reports-kpi-grid">
            <StatLedger
              label="Total Sanctioned"
              value={fmt.money(loansData?.summary?.totalPrincipal || 0)}
              subValue={`${loansData?.rows?.length || 0} Total Sanctions`}
            />
            <StatLedger
              label="Total Repayable"
              value={fmt.money(loansData?.summary?.totalRepayable || 0)}
              subValue="Principal + Sanctioned Interest"
            />
            <StatLedger
              label="Monthly Recovery Demand"
              value={fmt.money(loansData?.summary?.monthlyRecoveryDemand || 0)}
              subValue="Expected EMI / Mo."
            />
            <StatLedger
              label="Outstanding Balance"
              value={fmt.money(loansData?.summary?.totalBalanceRemaining || 0)}
              subValue={`${loansData?.summary?.activeAccountsCount || 0} Active Loans`}
              redInk={Boolean(loansData?.summary?.totalBalanceRemaining > 0)}
            />
          </div>

          {/* Loans Table */}
          <Card title="Loans & Advances Register" noPadding>
            {isLoadingLoans ? (
              <div className="reports-loading-box" role="status">Loading loans portfolio data…</div>
            ) : filteredLoanRows.length === 0 ? (
              <div className="reports-empty-box"><strong>No loan accounts match this scope</strong><span>Try a different branch, loan type, status or employee search.</span><Button variant="secondary" size="sm" onClick={resetActiveFilters}>Clear filters</Button></div>
            ) : (
              <div className="reports-table-scroll" tabIndex="0" aria-label="Loans and advances register; scroll horizontally for all columns">
                <table className="table reports-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>Sl.</th>
                      <th>Emp Code</th>
                      <th>Employee Name</th>
                      <th>Branch</th>
                      <th>Loan Type</th>
                      <th>Account / Ref</th>
                      <th className="text-right">Sanctioned</th>
                      <th className="text-right">Total Repayable</th>
                      <th className="text-right">Monthly EMI</th>
                      <th className="text-right">Repaid So Far</th>
                      <th className="text-right">Balance Outstanding</th>
                      <th>Start Date</th>
                      <th className="text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLoanRows.map((r, idx) => (
                      <tr key={r.id}>
                        <td className="text-muted">{idx + 1}</td>
                        <td className="mono">{r.empCode}</td>
                        <td className="font-semibold">{r.employeeName}</td>
                        <td>{r.branchName}</td>
                        <td>
                          <span className="reports-type-tag">{r.loanType}</span>
                        </td>
                        <td className="mono text-muted">{r.accountOrRef}</td>
                        <td className="text-right mono">{fmt.money(r.sanctionedAmount)}</td>
                        <td className="text-right mono">{fmt.money(r.totalRepayable)}</td>
                        <td className="text-right mono font-semibold">{fmt.money(r.monthlyInstallment)}</td>
                        <td className="text-right mono text-muted">{fmt.money(r.repaidSoFar)}</td>
                        <td className="text-right mono font-semibold text-danger">
                          {fmt.money(r.balanceRemaining)}
                        </td>
                        <td className="mono text-sm">{fmt.date(r.startDate)}</td>
                        <td className="text-center">
                          <Badge variant={r.status === 'ACTIVE' ? 'success' : 'default'}>
                            {r.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {loansData?.summary && (
                    <tfoot>
                      <tr className="reports-tfoot-row">
                        <td colSpan={6} className="text-right font-bold">
                          TOTAL ({filteredLoanRows.length} Accounts):
                        </td>
                        <td className="text-right mono font-bold">
                          {fmt.money(filteredLoanRows.reduce((s, r) => s + r.sanctionedAmount, 0))}
                        </td>
                        <td className="text-right mono font-bold">
                          {fmt.money(filteredLoanRows.reduce((s, r) => s + r.totalRepayable, 0))}
                        </td>
                        <td className="text-right mono font-bold">
                          {fmt.money(filteredLoanRows.reduce((s, r) => s + r.monthlyInstallment, 0))}
                        </td>
                        <td className="text-right mono font-bold text-muted">
                          {fmt.money(filteredLoanRows.reduce((s, r) => s + r.repaidSoFar, 0))}
                        </td>
                        <td className="text-right mono font-bold text-danger">
                          {fmt.money(filteredLoanRows.reduce((s, r) => s + r.balanceRemaining, 0))}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 2: INSURANCE & POLICIES REGISTER */}
      {activeTab === 'insurance' && (
        <div className="reports-content-section">
          {/* KPI Ledger */}
          <div className="reports-kpi-grid">
            <StatLedger
              label="Active Policies"
              value={insuranceData?.summary?.totalActivePolicies || 0}
              subValue="Enrolled staff coverage"
            />
            <StatLedger
              label="Total Sum Assured"
              value={fmt.money(insuranceData?.summary?.totalSumAssured || 0)}
              subValue="Life & Group Insurance Cover"
            />
            <StatLedger
              label="Monthly Premium Demand"
              value={fmt.money(insuranceData?.summary?.totalMonthlyDeduction || 0)}
              subValue="Payroll Deduction Demand"
            />
            <StatLedger
              label="Covered Employees"
              value={insuranceData?.summary?.enrolledEmployeesCount || 0}
              subValue="Staff with active insurance/fund"
            />
          </div>

          {/* Insurance Table */}
          <Card title="Insurance Policies & Staff Benefits Register" noPadding>
            {isLoadingInsurance ? (
              <div className="reports-loading-box" role="status">Loading insurance policy data…</div>
            ) : filteredInsuranceRows.length === 0 ? (
              <div className="reports-empty-box"><strong>No policy records match this scope</strong><span>Try a different branch, policy type, status or employee search.</span><Button variant="secondary" size="sm" onClick={resetActiveFilters}>Clear filters</Button></div>
            ) : (
              <div className="reports-table-scroll" tabIndex="0" aria-label="Insurance and policies register; scroll horizontally for all columns">
                <table className="table reports-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>Sl.</th>
                      <th>Emp Code</th>
                      <th>Employee Name</th>
                      <th>Branch</th>
                      <th>Policy Type</th>
                      <th>Policy Number / Ref</th>
                      <th className="text-right">Sum Assured</th>
                      <th className="text-right">Monthly Deduction</th>
                      <th>Start Date</th>
                      <th>Maturity Date</th>
                      <th className="text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInsuranceRows.map((r, idx) => (
                      <tr key={r.id}>
                        <td className="text-muted">{idx + 1}</td>
                        <td className="mono">{r.empCode}</td>
                        <td className="font-semibold">{r.employeeName}</td>
                        <td>{r.branchName}</td>
                        <td>
                          <span className="reports-type-tag">{r.policyType}</span>
                        </td>
                        <td className="mono">{r.policyNumber}</td>
                        <td className="text-right mono">
                          {r.sumAssuredAmount > 0 ? fmt.money(r.sumAssuredAmount) : '—'}
                        </td>
                        <td className="text-right mono font-semibold">
                          {fmt.money(r.monthlyDeduction)}
                        </td>
                        <td className="mono text-sm">{fmt.date(r.startedDate || r.openingDate)}</td>
                        <td className="mono text-sm">{fmt.date(r.maturityDate)}</td>
                        <td className="text-center">
                          <Badge variant={r.status === 'ACTIVE' ? 'success' : 'default'}>
                            {r.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {insuranceData?.summary && (
                    <tfoot>
                      <tr className="reports-tfoot-row">
                        <td colSpan={6} className="text-right font-bold">
                          TOTAL ({filteredInsuranceRows.length} Enrollments):
                        </td>
                        <td className="text-right mono font-bold">
                          {fmt.money(filteredInsuranceRows.reduce((s, r) => s + (r.sumAssuredAmount || 0), 0))}
                        </td>
                        <td className="text-right mono font-bold">
                          {fmt.money(filteredInsuranceRows.reduce((s, r) => s + r.monthlyDeduction, 0))}
                        </td>
                        <td colSpan={3}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: MASTER SALARY REGISTER (WITH ARREARS & DEDUCTIONS) */}
      {activeTab === 'salary' && (
        <div className="reports-content-section">
          {/* KPI Ledger */}
          <div className="reports-kpi-grid">
            <StatLedger
              label="Gross Earnings"
              value={fmt.money(salaryData?.summary?.totalGrossEarnings || 0)}
              subValue={`Basic: ${fmt.money(salaryData?.summary?.totalBasic || 0)} | DA: ${fmt.money(salaryData?.summary?.totalDa || 0)}`}
            />
            <StatLedger
              label="DA Arrears Disbursed"
              value={fmt.money(salaryData?.summary?.totalArrears || 0)}
              subValue="Special Arrears Installments"
            />
            <StatLedger
              label="Total Deductions"
              value={fmt.money(salaryData?.summary?.totalDeductions || 0)}
              subValue={`PF: ${fmt.money(salaryData?.summary?.totalPfEmployee || 0)} | Loans: ${fmt.money(salaryData?.summary?.totalLoansRecovery || 0)}`}
              redInk={Boolean(salaryData?.summary?.totalDeductions > 0)}
            />
            <StatLedger
              label="Net Pay Disbursed"
              value={fmt.money(salaryData?.summary?.totalNetPay || 0)}
              subValue={`${salaryData?.summary?.employeeCount || 0} Employees in Period`}
            />
          </div>

          {/* Salary Table */}
          <Card
            title={
              salaryData?.period
                ? `Master Payroll & Arrears Register — ${salaryData.period.monthName || salaryData.period.month} ${salaryData.period.year} (${salaryData.period.runStatus || 'COMPLETED'})`
                : 'Master Payroll & Arrears Register'
            }
            noPadding
          >
            {isLoadingSalary ? (
              <div className="reports-loading-box" role="status">Loading salary register…</div>
            ) : filteredSalaryRows.length === 0 ? (
              <div className="reports-empty-box"><strong>No salary records match this scope</strong><span>No payroll run was found for {MONTH_OPTIONS.find((month) => month.value === salaryMonth)?.label} {salaryYear}, or the current filters removed all rows.</span><Button variant="secondary" size="sm" onClick={resetActiveFilters}>Clear filters</Button></div>
            ) : (
              <div className="reports-table-scroll" tabIndex="0" aria-label="Master salary register; scroll horizontally for all columns">
                <table className="table reports-table reports-salary-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>Sl.</th>
                      <th>Emp Code</th>
                      <th>Employee Name</th>
                      <th>Post</th>
                      <th>Branch</th>
                      <th className="text-right">Basic</th>
                      <th className="text-right">DA</th>
                      <th className="text-right">HRA</th>
                      <th className="text-right">Allowances</th>
                      <th className="text-right">DA Arrears</th>
                      <th className="text-right font-bold">Gross Pay</th>
                      <th className="text-right">PF (Emp)</th>
                      <th className="text-right">PT</th>
                      <th className="text-right">TDS</th>
                      <th className="text-right">Loans</th>
                      <th className="text-right">Policies</th>
                      <th className="text-right font-bold text-danger">Total Deds</th>
                      <th className="text-right font-bold text-success">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSalaryRows.map((r, idx) => (
                      <tr key={r.lineId || idx}>
                        <td className="text-muted">{idx + 1}</td>
                        <td className="mono">{r.empCode}</td>
                        <td className="font-semibold">{r.employeeName}</td>
                        <td className="text-muted">{r.postName}</td>
                        <td>{r.branchName}</td>
                        <td className="text-right mono">{fmt.money(r.basic)}</td>
                        <td className="text-right mono">{fmt.money(r.da)}</td>
                        <td className="text-right mono">{fmt.money(r.hra)}</td>
                        <td className="text-right mono">
                          {fmt.money(
                            (r.riskAllowance || 0) +
                              (r.otherAllowance || 0) +
                              (r.cca || 0) +
                              (r.conveyance || 0) +
                              (r.medicalAllowance || 0) +
                              (r.customAllowancesTotal || 0)
                          )}
                        </td>
                        <td className="text-right mono font-semibold text-primary">
                          {r.arrearsAmount > 0 ? fmt.money(r.arrearsAmount) : '—'}
                        </td>
                        <td className="text-right mono font-bold">{fmt.money(r.grossEarnings)}</td>
                        <td className="text-right mono">{fmt.money(r.pfEmployee)}</td>
                        <td className="text-right mono">{fmt.money(r.professionalTax)}</td>
                        <td className="text-right mono">{fmt.money(r.incomeTax)}</td>
                        <td className="text-right mono text-muted">
                          {fmt.money(
                            (r.festivalAdvance || 0) +
                              (r.overdraft || 0) +
                              (r.housingLoan || 0) +
                              (r.vehicleLoan || 0) +
                              (r.recurringDeposit || 0)
                          )}
                        </td>
                        <td className="text-right mono text-muted">
                          {fmt.money((r.lic || 0) + (r.gsli || 0) + (r.welfareFund || 0))}
                        </td>
                        <td className="text-right mono font-bold text-danger">
                          {fmt.money(r.totalDeductions)}
                        </td>
                        <td className="text-right mono font-bold text-success">
                          {fmt.money(r.netPay)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {salaryData?.summary && (
                    <tfoot>
                      <tr className="reports-tfoot-row">
                        <td colSpan={5} className="text-right font-bold">
                          TOTAL ({filteredSalaryRows.length} Staff):
                        </td>
                        <td className="text-right mono font-bold">
                          {fmt.money(filteredSalaryRows.reduce((s, r) => s + r.basic, 0))}
                        </td>
                        <td className="text-right mono font-bold">
                          {fmt.money(filteredSalaryRows.reduce((s, r) => s + r.da, 0))}
                        </td>
                        <td className="text-right mono font-bold">
                          {fmt.money(filteredSalaryRows.reduce((s, r) => s + r.hra, 0))}
                        </td>
                        <td className="text-right mono font-bold">
                          {fmt.money(
                            filteredSalaryRows.reduce(
                              (s, r) =>
                                s +
                                (r.riskAllowance || 0) +
                                (r.otherAllowance || 0) +
                                (r.cca || 0) +
                                (r.conveyance || 0) +
                                (r.medicalAllowance || 0) +
                                (r.customAllowancesTotal || 0),
                              0
                            )
                          )}
                        </td>
                        <td className="text-right mono font-bold text-primary">
                          {fmt.money(filteredSalaryRows.reduce((s, r) => s + (r.arrearsAmount || 0), 0))}
                        </td>
                        <td className="text-right mono font-bold">
                          {fmt.money(filteredSalaryRows.reduce((s, r) => s + r.grossEarnings, 0))}
                        </td>
                        <td className="text-right mono font-bold">
                          {fmt.money(filteredSalaryRows.reduce((s, r) => s + r.pfEmployee, 0))}
                        </td>
                        <td className="text-right mono font-bold">
                          {fmt.money(filteredSalaryRows.reduce((s, r) => s + r.professionalTax, 0))}
                        </td>
                        <td className="text-right mono font-bold">
                          {fmt.money(filteredSalaryRows.reduce((s, r) => s + r.incomeTax, 0))}
                        </td>
                        <td className="text-right mono font-bold">
                          {fmt.money(
                            filteredSalaryRows.reduce(
                              (s, r) =>
                                s +
                                (r.festivalAdvance || 0) +
                                (r.overdraft || 0) +
                                (r.housingLoan || 0) +
                                (r.vehicleLoan || 0) +
                                (r.recurringDeposit || 0),
                              0
                            )
                          )}
                        </td>
                        <td className="text-right mono font-bold">
                          {fmt.money(
                            filteredSalaryRows.reduce(
                              (s, r) => s + (r.lic || 0) + (r.gsli || 0) + (r.welfareFund || 0),
                              0
                            )
                          )}
                        </td>
                        <td className="text-right mono font-bold text-danger">
                          {fmt.money(filteredSalaryRows.reduce((s, r) => s + r.totalDeductions, 0))}
                        </td>
                        <td className="text-right mono font-bold text-success">
                          {fmt.money(filteredSalaryRows.reduce((s, r) => s + r.netPay, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
        </>
      )}
      </section>
    </div>
  );
}
