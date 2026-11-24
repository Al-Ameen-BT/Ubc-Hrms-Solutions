import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { yearEndApi } from '../../api/extended';
import { fmt } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { StatLedger } from '../../components/ui/StatLedger';
import { BuildingIcon, CalendarIcon } from '../../components/ui/Icons';

export function YearEndPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const queryClient = useQueryClient();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('financial'); // 'financial' | 'leave'

  // Financial Year State
  const [closeYear, setCloseYear] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [viewYear, setViewYear] = useState(null);

  // Leave Rollover State
  const currentCalendarYear = new Date().getUTCFullYear();
  const [rolloverFromYear, setRolloverFromYear] = useState(currentCalendarYear - 1);
  const [confirmRollover, setConfirmRollover] = useState(false);
  const [rolloverRemarks, setRolloverRemarks] = useState('');

  // Queries - Financial Year
  const { data: years, isLoading: isLoadingYears } = useQuery({
    queryKey: ['year-end-years', orgId],
    queryFn: () => yearEndApi.years(orgId),
    enabled: !!orgId,
  });

  const { data: summary } = useQuery({
    queryKey: ['year-end-summary', orgId, viewYear],
    queryFn: () => yearEndApi.summary(orgId, viewYear),
    enabled: !!orgId && !!viewYear,
  });

  // Queries - Leave Rollover
  const { data: leavePreview, isLoading: isLoadingLeavePreview, refetch: refetchLeavePreview } = useQuery({
    queryKey: ['leave-rollover-preview', orgId, rolloverFromYear],
    queryFn: () => yearEndApi.previewLeaveRollover(orgId, rolloverFromYear),
    enabled: !!orgId && activeTab === 'leave',
  });

  const { data: leaveHistory, isLoading: isLoadingLeaveHistory } = useQuery({
    queryKey: ['leave-rollover-history', orgId],
    queryFn: () => yearEndApi.leaveRolloverHistory(orgId),
    enabled: !!orgId && activeTab === 'leave',
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['year-end-years', orgId] });
    queryClient.invalidateQueries({ queryKey: ['year-end-summary', orgId, viewYear] });
    queryClient.invalidateQueries({ queryKey: ['leave-rollover-preview', orgId, rolloverFromYear] });
    queryClient.invalidateQueries({ queryKey: ['leave-rollover-history', orgId] });
  };

  // Mutations - Financial Year
  const closeMutation = useMutation({
    mutationFn: ({ year, text }) => yearEndApi.close(orgId, year, text),
    onSuccess: () => {
      invalidate();
      toast.add('Financial year closed.', 'success');
      setCloseYear(null);
      setRemarks('');
    },
    onError: (err) => toast.add(err.message || 'Could not close the year.', 'error'),
  });

  const reopenMutation = useMutation({
    mutationFn: (year) => yearEndApi.reopen(orgId, year),
    onSuccess: () => {
      invalidate();
      toast.add('Financial year reopened.', 'success');
    },
    onError: (err) => toast.add(err.message || 'Could not reopen the year.', 'error'),
  });

  // Mutations - Leave Rollover
  const rolloverMutation = useMutation({
    mutationFn: ({ fromYear, text }) => yearEndApi.executeLeaveRollover(orgId, fromYear, text),
    onSuccess: () => {
      invalidate();
      toast.add('Leave year-end rollover executed successfully.', 'success');
      setConfirmRollover(false);
      setRolloverRemarks('');
    },
    onError: (err) => toast.add(err.message || 'Could not execute leave rollover.', 'error'),
  });

  const rows = years?.rows || [];
  const openYears = rows.filter((r) => r.status === 'OPEN').length;
  const closedYears = rows.filter((r) => r.status === 'CLOSED').length;

  const financialColumns = [
    { field: 'year', label: 'Financial Year', mono: true, render: (r) => `FY ${r.year}-${Number(r.year) + 1}` },
    { field: 'startDate', label: 'Fiscal Start', mono: true, render: (r) => fmt.date(r.startDate) },
    { field: 'endDate', label: 'Fiscal End', mono: true, render: (r) => fmt.date(r.endDate) },
    { field: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'CLOSED' ? 'success' : 'warning'}>{r.status}</Badge> },
    { field: 'closedAt', label: 'Closed On', mono: true, render: (r) => fmt.dateTime(r.closedAt) },
    {
      field: 'actions', label: '', sortable: false,
      render: (r) => (
        <div className="row-actions">
          <Button variant="secondary" size="sm" onClick={() => setViewYear(r.year)}>Summary &amp; Checklist</Button>
          {r.status === 'OPEN'
            ? <Button size="sm" onClick={() => setCloseYear(r.year)}>Close Year</Button>
            : <Button size="sm" variant="secondary" onClick={() => reopenMutation.mutate(r.year)}>Reopen</Button>}
        </div>
      ),
    },
  ];

  const previewRecords = leavePreview?.records || [];
  const leavePreviewColumns = [
    { field: 'empCode', label: 'Emp Code', mono: true },
    { field: 'employeeName', label: 'Employee Name' },
    { field: 'leaveTypeCode', label: 'Leave Type', mono: true, render: (r) => `${r.leaveTypeCode} (${r.leaveTypeName})` },
    { field: 'previousClosing', label: 'Year Closing', mono: true, render: (r) => `${r.previousClosing} d` },
    {
      field: 'lapsedDays', label: 'Lapsed (CL)', mono: true,
      render: (r) => r.lapsedDays > 0 ? <span className="text-danger">-{r.lapsedDays} d</span> : '—',
    },
    {
      field: 'carriedForwardDays', label: 'Carried Forward (EL)', mono: true,
      render: (r) => r.carriedForwardDays > 0 ? <span className="text-success">+{r.carriedForwardDays} d</span> : '—',
    },
    {
      field: 'cappedDays', label: 'Capped (>300d)', mono: true,
      render: (r) => r.cappedDays > 0 ? <span className="text-warning">capped {r.cappedDays} d</span> : '—',
    },
    { field: 'newOpeningBalance', label: 'New Opening', mono: true, render: (r) => <strong>{r.newOpeningBalance} d</strong> },
  ];

  const leaveHistoryRows = leaveHistory || [];
  const leaveHistoryColumns = [
    { field: 'cycle', label: 'Rollover Cycle', mono: true, render: (r) => `${r.fromYear} → ${r.toYear} (${r.cycleType})` },
    { field: 'employeesCount', label: 'Staff Count', mono: true },
    { field: 'totalLapsedDays', label: 'Total Lapsed (CL)', mono: true, render: (r) => `${r.totalLapsedDays} d` },
    { field: 'totalCarriedForwardDays', label: 'Total Carried (EL)', mono: true, render: (r) => `${r.totalCarriedForwardDays} d` },
    { field: 'totalCappedDays', label: 'Total Capped', mono: true, render: (r) => `${r.totalCappedDays} d` },
    { field: 'executedAt', label: 'Executed At', mono: true, render: (r) => fmt.dateTime(r.executedAt) },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Year-End Governance &amp; Allocations</h1>
        <p>Decoupled management for Indian Financial Year-End (Apr–Mar) and KSR Leave Year-End (Jan–Dec)</p>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border, #e5e7eb)', paddingBottom: '8px' }}>
        <Button
          variant={activeTab === 'financial' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('financial')}
        >
          <BuildingIcon size={17} /> Financial Year-End (Fiscal: 1 Apr – 31 Mar)
        </Button>
        <Button
          variant={activeTab === 'leave' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('leave')}
        >
          <CalendarIcon size={17} /> Leave Year-End Rollover (KSR Calendar: 1 Jan – 31 Dec)
        </Button>
      </div>

      {activeTab === 'financial' && (
        <>
          <div className="stat-grid">
            <StatLedger label="Financial Years Tracked" value={rows.length} />
            <StatLedger label="Open Fiscal Years" value={openYears} />
            <StatLedger label="Closed Fiscal Years" value={closedYears} />
          </div>

          {summary && (
            <Card title={`Fiscal Summary & Checklist — FY ${summary.closure?.year}-${Number(summary.closure?.year) + 1}`}>
              <div className="stat-grid" style={{ marginBottom: '16px' }}>
                <StatLedger label="Payroll Runs Approved/Paid" value={`${summary.payrollRunsIncluded} / ${summary.payrollRunsExpected}`} />
                <StatLedger label="Gross Earnings" value={fmt.money(summary.totals?.grossEarnings)} />
                <StatLedger label="Deductions" value={fmt.money(summary.totals?.deductions)} />
                <StatLedger label="Net Pay" value={fmt.money(summary.totals?.netPay)} />
              </div>

              {summary.bonusSummary && (
                <div style={{ background: 'var(--bg-subtle, #f9fafb)', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                  <h4>Annual Statutory Bonus / Ex-Gratia Allocation</h4>
                  <p style={{ margin: '4px 0', fontSize: '0.875rem' }}>
                    Result: <strong>{summary.bonusSummary.declaredResult}</strong> ({summary.bonusSummary.ratePercent}% rate, max cap ₹{summary.bonusSummary.maxCeiling})
                  </p>
                  <p style={{ margin: '4px 0', fontSize: '0.875rem' }}>
                    Eligible Active Staff: <strong>{summary.bonusSummary.eligibleStaffCount}</strong> | Total Estimated Allocation: <strong>{fmt.money(summary.bonusSummary.totalEstimatedBonus)}</strong>
                  </p>
                </div>
              )}

              <h4>12-Month Payroll Reconciliation Checklist</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginTop: '8px' }}>
                {summary.checklist?.map((item) => (
                  <div
                    key={`${item.year}-${item.month}`}
                    style={{
                      border: '1px solid var(--border, #e5e7eb)',
                      borderRadius: '6px',
                      padding: '8px',
                      textAlign: 'center',
                      background: item.isApprovedOrPaid ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)' }}>
                      {item.month}/{item.year}
                    </div>
                    <div style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>
                      {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][item.month - 1]}
                    </div>
                    <Badge variant={item.isApprovedOrPaid ? 'success' : 'danger'}>
                      {item.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title="Financial Year Register" noPadding>
            <Table columns={financialColumns} data={rows} keyField="id" loading={isLoadingYears} emptyMessage="No financial year records yet." />
          </Card>

          <Modal
            open={closeYear != null}
            onClose={() => setCloseYear(null)}
            title={`Close Financial Year FY ${closeYear ?? ''}-${Number(closeYear || 0) + 1}`}
            footer={
              <>
                <Button variant="secondary" onClick={() => setCloseYear(null)}>Cancel</Button>
                <Button loading={closeMutation.isPending} onClick={() => closeMutation.mutate({ year: closeYear, text: remarks })}>
                  Confirm &amp; Lock Financial Year
                </Button>
              </>
            }
          >
            <p className="form-note">
              Closing a financial year snapshots the 12-month payroll totals, reconciles annual statutory bonus allocations, and blocks further payroll runs for that fiscal year.
            </p>
            <Input id="ye-remarks" label="Remarks (optional)" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Modal>
        </>
      )}

      {activeTab === 'leave' && (
        <>
          <div style={{ background: 'var(--bg-subtle, #f9fafb)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 8px 0' }}>Kerala Service Rules (KSR) Leave Rollover Cycle</h3>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted, #6b7280)' }}>
              Under KSR Part I, leave balances operate strictly on a <strong>Calendar Year (1 Jan – 31 Dec)</strong>.
              Casual Leave (CL) lapses on 31 December; Earned Leave (EL) closing balance carries forward to 1 January up to the statutory <strong>300-day limit</strong>.
            </p>
          </div>

          <Card title="Execute Annual Leave Rollover">
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '16px' }}>
              <div style={{ width: '200px' }}>
                <label htmlFor="rollover-from-year" style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', fontWeight: 500 }}>
                  Rollover From Year:
                </label>
                <Input
                  id="rollover-from-year"
                  type="number"
                  value={rolloverFromYear}
                  onChange={(e) => setRolloverFromYear(Number(e.target.value))}
                />
              </div>
              <Button variant="secondary" onClick={() => refetchLeavePreview()}>
                Refresh Preview
              </Button>
              <Button variant="primary" onClick={() => setConfirmRollover(true)}>
                Execute Rollover for {rolloverFromYear} → {rolloverFromYear + 1}
              </Button>
            </div>

            {leavePreview && (
              <div className="stat-grid" style={{ marginBottom: '16px' }}>
                <StatLedger label="Staff Processed" value={leavePreview.employeesCount} />
                <StatLedger label="Total CL Days Lapsed" value={`${leavePreview.totalLapsedDays} d`} />
                <StatLedger label="Total EL Days Carried" value={`${leavePreview.totalCarriedForwardDays} d`} />
                <StatLedger label="Total Days Capped (>300)" value={`${leavePreview.totalCappedDays} d`} />
              </div>
            )}

            <Table
              columns={leavePreviewColumns}
              data={previewRecords}
              keyField={(r) => `${r.employeeId}-${r.leaveTypeId}`}
              loading={isLoadingLeavePreview}
              emptyMessage="No leave preview records available."
            />
          </Card>

          <Card title="Leave Rollover Historical Audit Log" noPadding>
            <Table
              columns={leaveHistoryColumns}
              data={leaveHistoryRows}
              keyField="id"
              loading={isLoadingLeaveHistory}
              emptyMessage="No historical leave rollovers recorded yet."
            />
          </Card>

          <Modal
            open={confirmRollover}
            onClose={() => setConfirmRollover(false)}
            title={`Confirm Leave Rollover: ${rolloverFromYear} → ${rolloverFromYear + 1}`}
            footer={
              <>
                <Button variant="secondary" onClick={() => setConfirmRollover(false)}>Cancel</Button>
                <Button
                  loading={rolloverMutation.isPending}
                  onClick={() => rolloverMutation.mutate({ fromYear: rolloverFromYear, text: rolloverRemarks })}
                >
                  Confirm &amp; Execute Rollover
                </Button>
              </>
            }
          >
            <p className="form-note">
              Executing the rollover will create new opening balances for all active staff in year <strong>{rolloverFromYear + 1}</strong>.
              All unavailed Casual Leave will lapse, and Earned Leave will be carried forward capped at the 300-day limit.
              This action is immutable and logged in the statutory audit register.
            </p>
            <Input
              id="rollover-remarks"
              label="Remarks (optional)"
              value={rolloverRemarks}
              onChange={(e) => setRolloverRemarks(e.target.value)}
            />
          </Modal>
        </>
      )}
    </div>
  );
}
