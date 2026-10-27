import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { payrollApi, downloadFile, fmt } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const EARNING_LABELS = [
  ['basic', 'Basic Pay'], ['da', 'Dearness Allowance'], ['hra', 'House Rent Allowance'],
  ['riskAllowance', 'Risk Allowance'], ['otherAllowance', 'Other Allowance'],
  ['cca', 'City Compensatory Allowance'], ['conveyance', 'Conveyance'],
  ['medicalAllowance', 'Medical Allowance'], ['bonus', 'Bonus'],
];
const DEDUCTION_LABELS = [
  ['pfEmployee', 'Provident Fund (employee)'], ['vpf', 'Voluntary PF'], ['welfareFund', 'Welfare Fund'],
  ['gsli', 'Group Savings Linked Insurance'], ['professionalTax', 'Professional Tax'], ['incomeTax', 'Income Tax'],
  ['festivalAdvance', 'Festival Advance'], ['overdraft', 'Overdraft'], ['recurringDeposit', 'Recurring Deposit'],
  ['lic', 'LIC'], ['housingLoan', 'Housing Loan'], ['vehicleLoan', 'Vehicle Loan'],
];

function PayslipBody({ payslip }) {
  if (!payslip) return <p className="form-note">Loading payslip…</p>;
  const e = payslip.earnings || {};
  const d = payslip.deductions || {};
  return (
    <div className="payslip-grid">
      <div className="payslip-col">
        <h4 className="payslip-heading">Earnings</h4>
        {EARNING_LABELS.filter(([k]) => Number(e[k])).map(([k, label]) => (
          <div className="payslip-row" key={k}><span>{label}</span><span className="mono">{fmt.money(e[k])}</span></div>
        ))}
        {(e.customAllowances || []).map((c) => (
          <div className="payslip-row" key={c.code || c.name}><span>{c.name || c.code}</span><span className="mono">{fmt.money(c.amount)}</span></div>
        ))}
        <div className="payslip-row payslip-total"><span>Gross Earnings</span><span className="mono">{fmt.money(e.grossEarnings)}</span></div>
      </div>
      <div className="payslip-col">
        <h4 className="payslip-heading">Deductions</h4>
        {DEDUCTION_LABELS.filter(([k]) => Number(d[k])).map(([k, label]) => (
          <div className="payslip-row" key={k}><span>{label}</span><span className="mono">{fmt.money(d[k])}</span></div>
        ))}
        <div className="payslip-row payslip-total"><span>Total Deductions</span><span className="mono">{fmt.money(d.totalDeductions)}</span></div>
      </div>
    </div>
  );
}

export function PayrollRunPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const orgId = user?.organizationId;
  const isApprover = can('ORG_ADMIN', 'APPROVING_AUTHORITY');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [viewLine, setViewLine] = useState(null);
  const [confirmDeleteRun, setConfirmDeleteRun] = useState(false);
  const [actionError, setActionError] = useState('');

  const { data: run, isLoading } = useQuery({
    queryKey: ['payroll-run', orgId, id],
    queryFn: () => payrollApi.run(orgId, id),
    enabled: !!orgId,
  });

  const { data: lines } = useQuery({
    queryKey: ['payroll-lines', orgId, id],
    queryFn: () => payrollApi.lines(orgId, id),
    enabled: !!orgId,
  });

  const { data: lineDetail, isLoading: lineLoading } = useQuery({
    queryKey: ['payroll-line', orgId, id, viewLine?.employeeId],
    queryFn: () => payrollApi.line(orgId, id, viewLine.employeeId),
    enabled: !!orgId && !!viewLine,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['payroll-run', orgId, id] });
    queryClient.invalidateQueries({ queryKey: ['payroll-lines', orgId, id] });
  };

  const approve = useMutation({
    mutationFn: () => payrollApi.approve(orgId, id),
    onSuccess: () => { invalidate(); toast.add('Run approved and locked.', 'success'); },
    onError: (err) => toast.add(err.message || 'Could not approve.', 'error'),
  });
  const reject = useMutation({
    mutationFn: (reason) => payrollApi.reject(orgId, id, reason),
    onSuccess: () => { invalidate(); toast.add('Run rejected.', 'success'); },
    onError: (err) => toast.add(err.message || 'Could not reject.', 'error'),
  });
  const markPaid = useMutation({
    mutationFn: () => payrollApi.markPaid(orgId, id),
    onSuccess: () => { invalidate(); toast.add('Run marked as paid.', 'success'); },
    onError: (err) => toast.add(err.message || 'Could not mark paid.', 'error'),
  });
  const removeRun = useMutation({
    mutationFn: () => payrollApi.remove(orgId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-runs', orgId] });
      toast.add('Run deleted.', 'success');
      navigate('/payroll');
    },
    onError: (err) => setActionError(err.message || 'Could not delete run.'),
  });
  const reprocess = useMutation({
    mutationFn: () => payrollApi.createRun(orgId, { year: run.year, month: run.month }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['payroll-runs', orgId] });
      toast.add('Run re-processed.', 'success');
      if (res?.id) navigate(`/payroll/${res.id}`);
    },
    onError: (err) => toast.add(err.message || 'Could not re-process.', 'error'),
  });
  const sendPayslips = useMutation({
    mutationFn: () => payrollApi.sendPayslips(orgId, id),
    onSuccess: (res) => {
      invalidate();
      toast.add(`Payslips emailed — ${res.sent} sent, ${res.failed} failed of ${res.total}.`, res.failed ? 'info' : 'success');
    },
    onError: (err) => toast.add(err.message || 'Could not send payslips.', 'error'),
  });

  const exportFile = async (path, label) => {
    try {
      await downloadFile(path);
      toast.add(`${label} downloaded.`, 'success');
    } catch (err) {
      toast.add(err.message || 'Download failed.', 'error');
    }
  };

  if (isLoading) return <div className="page"><p>Loading…</p></div>;

  const statusVariant = run?.status === 'PAID' ? 'success' : run?.status === 'APPROVED' ? 'info' : run?.status === 'REJECTED' ? 'danger' : 'warning';
  const canExportBank = run?.status === 'APPROVED' || run?.status === 'PAID';

  const columns = [
    { field: 'empCode', label: 'Code', mono: true },
    { field: 'employeeName', label: 'Employee' },
    { field: 'postName', label: 'Post', render: (r) => r.postName || '—' },
    { field: 'lopDays', label: 'LOP', mono: true, align: 'right', render: (r) => (Number(r.lopDays) ? Number(r.lopDays) : '—') },
    { field: 'grossEarnings', label: 'Gross', mono: true, align: 'right', render: (r) => fmt.money(r.grossEarnings) },
    { field: 'totalDeductions', label: 'Deductions', mono: true, align: 'right', render: (r) => fmt.money(r.totalDeductions) },
    { field: 'netPay', label: 'Net Pay', mono: true, align: 'right', render: (r) => fmt.money(r.netPay) },
    {
      field: 'bank', label: 'Bank',
      render: (r) => (r.hasBankDetails
        ? <Badge variant="success">On file</Badge>
        : <Badge variant="warning">Missing</Badge>),
    },
    {
      field: '__actions', label: '', sortable: false,
      render: (r) => (
        <div className="row-actions">
          <Button variant="secondary" size="sm" onClick={() => setViewLine(r)}>Payslip</Button>
          <Button variant="secondary" size="sm" onClick={() => exportFile(payrollApi.payslipPdfUrl(orgId, id, r.employeeId), 'Payslip PDF')}>PDF</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Payroll Run — {MONTHS[(run?.month || 1) - 1]} {run?.year}</h1>
            <p className="mono">Run #{run?.id}</p>
          </div>
          <div className="page-header-actions">
            <Badge variant={statusVariant}>{run?.status}</Badge>
            <Button variant="secondary" onClick={() => navigate('/payroll')}>Back</Button>
          </div>
        </div>
      </header>

      {run?.status === 'REJECTED' && run?.rejectionReason && (
        <div className="auth-notice auth-notice-error" role="status">Rejected: {run.rejectionReason}</div>
      )}

      <div className="counterfoil">
        <div className="counterfoil-header">
          <span className="counterfoil-serial mono">No. {run?.id}</span>
          <span className="counterfoil-date mono">{fmt.dateTime(run?.processedAt)}</span>
        </div>

        <div className="stat-grid">
          <div className="stat-ledger">
            <div className="stat-ledger-label">Total Gross</div>
            <div className="stat-ledger-value mono">{fmt.money(run?.totalGrossEarnings)}</div>
          </div>
          <div className="stat-ledger">
            <div className="stat-ledger-label">Total Deductions</div>
            <div className="stat-ledger-value mono">{fmt.money(run?.totalDeductions)}</div>
          </div>
          <div className="stat-ledger">
            <div className="stat-ledger-label">Net Pay</div>
            <div className="stat-ledger-value mono red-ink">{fmt.money(run?.totalNetPay)}</div>
          </div>
          <div className="stat-ledger">
            <div className="stat-ledger-label">Employees</div>
            <div className="stat-ledger-value mono">{run?.employeeCount}</div>
          </div>
        </div>

        <div className="card-actions">
          {run?.status === 'PROCESSED' && isApprover && (
            <>
              <Button
                loading={approve.isPending}
                onClick={() => { if (window.confirm('Approve this run? Once approved it is locked and cannot be re-processed.')) approve.mutate(); }}
              >
                Approve
              </Button>
              <Button
                variant="secondary"
                loading={reject.isPending}
                onClick={() => {
                  const reason = window.prompt('Reason for rejecting (optional):');
                  if (reason === null) return; // cancelled
                  reject.mutate(reason || undefined);
                }}
              >
                Reject
              </Button>
            </>
          )}
          {run?.status === 'APPROVED' && isApprover && (
            <Button
              loading={markPaid.isPending}
              onClick={() => { if (window.confirm('Mark this run as paid? This records disbursement — it does not move money.')) markPaid.mutate(); }}
            >
              Mark as Paid
            </Button>
          )}
          {(run?.status === 'PROCESSED' || run?.status === 'REJECTED') && (
            <>
              <Button
                variant="secondary"
                loading={reprocess.isPending}
                onClick={() => { if (window.confirm('Re-process this month? A fresh run replaces this one.')) reprocess.mutate(); }}
              >
                Re-process
              </Button>
              <Button
                variant="secondary"
                loading={removeRun.isPending}
                onClick={() => {
                  setActionError('');
                  setConfirmDeleteRun(true);
                }}
              >
                Delete Run
              </Button>
            </>
          )}
        </div>
      </div>

      <Card title="Exports" noPadding>
        <div className="table-toolbar">
          <span className="form-note">Download the register for records, or the bank transfer file once the run is approved.</span>
          <div className="row-actions">
            <Button variant="secondary" size="sm" onClick={() => exportFile(payrollApi.registerCsvUrl(orgId, id), 'Payroll register')}>Register CSV</Button>
            <Button variant="secondary" size="sm" disabled={!canExportBank} onClick={() => exportFile(payrollApi.bankTransferCsvUrl(orgId, id), 'Bank transfer file')}>Bank Transfer CSV</Button>
            <Button
              variant="secondary" size="sm"
              disabled={run?.status === 'REJECTED'}
              loading={sendPayslips.isPending}
              onClick={() => { if (window.confirm('Email the payslip PDF to every employee in this run?')) sendPayslips.mutate(); }}
            >Email Payslips</Button>
          </div>
        </div>
      </Card>

      <Card title={`Payslip Lines (${lines?.rows?.length || 0})`} noPadding>
        <Table columns={columns} data={lines?.rows || []} keyField="id" emptyMessage="No lines in this run." />
      </Card>

      <Modal
        open={!!viewLine}
        onClose={() => setViewLine(null)}
        title={viewLine ? `${viewLine.employeeName} — ${MONTHS[(run?.month || 1) - 1]} ${run?.year}` : 'Payslip'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setViewLine(null)}>Close</Button>
            <Button onClick={() => exportFile(payrollApi.payslipPdfUrl(orgId, id, viewLine.employeeId), 'Payslip PDF')}>Download PDF</Button>
          </>
        }
      >
        {lineLoading ? <p className="form-note">Loading…</p>
          : lineDetail?.payslip ? <PayslipBody payslip={lineDetail.payslip} />
            : <EmptyState title="Payslip unavailable" />}
        {lineDetail?.payslip && (
          <div className="stat-grid">
            <div className="stat-ledger"><div className="stat-ledger-label">Net Pay</div><div className="stat-ledger-value mono">{fmt.money(lineDetail.payslip.netPay)}</div></div>
            <div className="stat-ledger"><div className="stat-ledger-label">Paid Days</div><div className="stat-ledger-value mono">{lineDetail.payslip.attendance?.paidDays ?? '—'}</div></div>
            <div className="stat-ledger"><div className="stat-ledger-label">LOP Days</div><div className="stat-ledger-value mono">{lineDetail.payslip.attendance?.lopDays ?? 0}</div></div>
          </div>
        )}
        {lineDetail?.payslip?.note && <p className="form-note">{lineDetail.payslip.note}</p>}
      </Modal>

      <ConfirmationModal
        open={confirmDeleteRun}
        onClose={() => setConfirmDeleteRun(false)}
        onConfirm={() => removeRun.mutate()}
        title="Delete Payroll Run"
        itemName={run ? `${MONTHS[(run.month || 1) - 1]} ${run.year} Payroll Run` : 'Payroll Run'}
        details={{
          'Period': run ? `${MONTHS[(run.month || 1) - 1]} ${run.year}` : '—',
          'Status': run?.status,
          'Total Gross Pay': fmt.money(run?.totalGrossPay),
          'Total Net Pay': fmt.money(run?.totalNetPay),
          'Paylines': lines?.rows?.length || 0,
        }}
        warningMessage="Deleting this payroll run will permanently delete all calculated paylines and payslips for this period. This action cannot be undone."
        confirmLabel="Confirm Deletion"
        confirmVariant="danger"
        loading={removeRun.isPending}
        error={actionError}
      />
    </div>
  );
}
