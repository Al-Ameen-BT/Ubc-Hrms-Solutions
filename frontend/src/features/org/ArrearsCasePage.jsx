import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { arrearsApi } from '../../api/extended';
import { fmt, downloadFile } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* One employee's arrears case under a DA revision (routes/arrears.js):
   month-by-month ledger, manual adjustment (mandatory reason), payment plan,
   and standalone installment payment with a PDF receipt. */
export function ArrearsCasePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ approvedAmount: '', reason: '' });
  const [planOpen, setPlanOpen] = useState(false);
  const [planMode, setPlanMode] = useState('INSTALLMENT');
  const [planForm, setPlanForm] = useState({ numberOfInstallments: '6', startYear: '', startMonth: '' });
  const [confirmClearPlan, setConfirmClearPlan] = useState(false);
  const [actionError, setActionError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['arrears-case', id],
    queryFn: () => arrearsApi.caseDetail(id),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['arrears-case', id] });

  const adjust = useMutation({
    mutationFn: (payload) => arrearsApi.adjustCase(id, payload),
    onSuccess: () => { invalidate(); setAdjustOpen(false); setAdjustForm({ approvedAmount: '', reason: '' }); toast.add('Arrears adjusted.', 'success'); },
    onError: (err) => toast.add(err.message || 'Could not adjust.', 'error'),
  });

  const setPlan = useMutation({
    mutationFn: (payload) => arrearsApi.setPaymentPlan(id, payload),
    onSuccess: () => { invalidate(); setPlanOpen(false); toast.add('Payment plan set.', 'success'); },
    onError: (err) => toast.add(err.message || 'Could not set plan.', 'error'),
  });

  const clearPlan = useMutation({
    mutationFn: () => arrearsApi.clearPaymentPlan(id),
    onSuccess: () => {
      invalidate();
      toast.add('Payment plan cleared.', 'success');
      setConfirmClearPlan(false);
    },
    onError: (err) => setActionError(err.message || 'Could not clear plan.'),
  });

  const payInstallment = useMutation({
    mutationFn: (instId) => arrearsApi.payInstallment(id, instId),
    onSuccess: () => { invalidate(); toast.add('Installment marked paid.', 'success'); },
    onError: (err) => toast.add(err.message || 'Could not pay.', 'error'),
  });

  const getReceipt = async (instId) => {
    try { await downloadFile(arrearsApi.receiptPdfUrl(id, instId)); }
    catch (err) { toast.add(err.message || 'Receipt unavailable.', 'error'); }
  };

  if (isLoading) return <div className="page"><p>Loading…</p></div>;

  const c = data?.case;
  const months = data?.months || [];
  const installments = data?.installments || [];
  const revision = data?.revision;
  if (!c) return <div className="page"><p>Arrears case not found.</p></div>;

  const paid = installments.filter((i) => i.status === 'PAID').reduce((s, i) => s + Number(i.amount), 0);
  const balance = Math.max(0, Number(c.effectiveTotalAmount) - paid);
  const fullyPaid = c.status === 'FULLY_PAID' || balance <= 0;

  const statusVariant = c.status === 'FULLY_PAID' ? 'success' : c.status === 'CALCULATED' ? 'warning' : 'info';
  const paymentMode = c.paymentMode !== 'NONE' ? <Badge variant="info">{c.paymentMode.replace(/_/g, ' ')}</Badge> : '—';

  const monthColumns = [
    {
      field: 'period', label: 'Period',
      render: (r) => <span className="mono">{r.year}-{String(r.month).padStart(2, '0')}</span>,
    },
    { field: 'previousDaPercent', label: 'Previous DA %', mono: true, align: 'right', render: (r) => `${Number(r.previousDaPercent)}%` },
    { field: 'revisedDaPercent', label: 'Revised DA %', mono: true, align: 'right', render: (r) => `${Number(r.revisedDaPercent)}%` },
    { field: 'difference', label: 'Difference', mono: true, align: 'right', render: (r) => fmt.money(r.differenceAmount) },
    { field: 'amount', label: 'Arrears', mono: true, align: 'right', render: (r) => fmt.money(r.arrearsAmount) },
  ];

  const installmentColumns = [
    { field: 'period', label: 'Due', render: (r) => <span className="mono">{MONTHS[r.month - 1]} {r.year}</span> },
    { field: 'amount', label: 'Amount', mono: true, align: 'right', render: (r) => fmt.money(r.amount) },
    { field: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'PAID' ? 'success' : 'warning'}>{r.status}</Badge> },
    {
      field: 'actions', label: '', sortable: false,
      render: (r) => (
        <div className="row-actions">
          {r.status !== 'PAID' && (
            <Button variant="secondary" size="sm" onClick={() => { if (window.confirm('Mark this installment as paid? This posts a Service Book entry.')) payInstallment.mutate(r.id); }}>Pay</Button>
          )}
          {r.status === 'PAID' && (
            <Button variant="secondary" size="sm" onClick={() => getReceipt(r.id)}>Receipt</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1>{c.employeeName}</h1>
            <p className="mono">{c.empCode} · {revision?.orderNumber ? `Order ${revision.orderNumber}` : 'No order'}</p>
          </div>
          <div className="page-header-actions">
            <Badge variant={statusVariant}>{c.status.replace(/_/g, ' ')}</Badge>
            <Button variant="secondary" onClick={() => navigate('/arrears')}>Back</Button>
          </div>
        </div>
      </header>

      <div className="stat-grid">
        <div className="stat-ledger"><div className="stat-ledger-label">Calculated</div><div className="stat-ledger-value mono">{fmt.money(c.totalCalculatedAmount)}</div></div>
        <div className="stat-ledger"><div className="stat-ledger-label">Effective</div><div className="stat-ledger-value mono">{fmt.money(c.effectiveTotalAmount)}</div></div>
        <div className="stat-ledger"><div className="stat-ledger-label">Paid</div><div className="stat-ledger-value mono">{fmt.money(paid)}</div></div>
        <div className="stat-ledger"><div className="stat-ledger-label">Balance</div><div className="stat-ledger-value mono red-ink">{fmt.money(balance)}</div></div>
        <div className="stat-ledger"><div className="stat-ledger-label">Payment Mode</div><div className="stat-ledger-value">{paymentMode}</div></div>
      </div>

      {c.adjustmentReason && (
        <div className="auth-notice" role="status">
          <strong>Adjustment:</strong> {c.adjustmentReason}
        </div>
      )}

      {!fullyPaid && (
        <Card title="Manual Adjustment">
          <p className="form-note">
            Override the calculated amount after management approval. A reason is mandatory and is recorded on the audit log.
          </p>
          <div className="card-actions">
            <Button variant="secondary" onClick={() => { setAdjustForm({ approvedAmount: String(c.effectiveTotalAmount), reason: '' }); setAdjustOpen(true); }}>
              Adjust Amount
            </Button>
          </div>
        </Card>
      )}

      <Card title={installments.length ? `Payment Plan (${installments.filter((i) => i.status === 'PAID').length}/${installments.length} paid)` : 'Payment Plan'} noPadding>
        <div className="table-toolbar">
          <span className="form-note">Arrears are paid separately from salary. Set a plan, then mark each month paid.</span>
          {!installments.length && (
            <Button onClick={() => { setPlanForm({ numberOfInstallments: '6', startYear: String(new Date().getFullYear()), startMonth: String(new Date().getMonth() + 1) }); setPlanOpen(true); }}>
              Set Plan
            </Button>
          )}
          {installments.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => {
                setActionError('');
                setConfirmClearPlan(true);
              }}
            >
              Clear Plan
            </Button>
          )}
        </div>
        <Table columns={installmentColumns} data={installments} keyField="id" emptyMessage="No installments yet." />
      </Card>

      <Card title={`Month-by-Month (${months.length})`} noPadding>
        <Table columns={monthColumns} data={months} keyField={(r) => `${r.year}-${r.month}`} emptyMessage="No month details." />
      </Card>

      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Manual Adjustment"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button loading={adjust.isPending} onClick={() => adjust.mutate(adjustForm)}>Save Adjustment</Button>
          </>
        }
      >
        <form noValidate>
          <div className="form-grid">
            <Input id="ac-amt" label="Approved Amount" type="number" value={adjustForm.approvedAmount} onChange={(e) => setAdjustForm({ ...adjustForm, approvedAmount: e.target.value })} required mono />
            <Input id="ac-reason" label="Reason" value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} required hint="Mandatory — recorded on the audit log." />
          </div>
        </form>
      </Modal>

      <Modal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        title="Set Payment Plan"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPlanOpen(false)}>Cancel</Button>
            <Button loading={setPlan.isPending} onClick={() => {
              if (planMode === 'SINGLE_SHOT') setPlan.mutate({ mode: 'SINGLE_SHOT', year: planForm.startYear, month: planForm.startMonth });
              else setPlan.mutate({ mode: 'INSTALLMENT', numberOfInstallments: planForm.numberOfInstallments, startYear: planForm.startYear, startMonth: planForm.startMonth });
            }}>Set Plan</Button>
          </>
        }
      >
        <form noValidate>
          <div className="field">
            <label className="field-label" htmlFor="pp-mode">Mode</label>
            <select id="pp-mode" className="input" value={planMode} onChange={(e) => setPlanMode(e.target.value)}>
              <option value="INSTALLMENT">Equal installments</option>
              <option value="SINGLE_SHOT">Single shot</option>
            </select>
          </div>
          {planMode === 'INSTALLMENT' && (
            <Input id="pp-count" label="Number of Installments" type="number" value={planForm.numberOfInstallments} onChange={(e) => setPlanForm({ ...planForm, numberOfInstallments: e.target.value })} required mono />
          )}
          <div className="form-grid">
            <Input id="pp-year" label="Start Year" type="number" value={planForm.startYear} onChange={(e) => setPlanForm({ ...planForm, startYear: e.target.value })} required mono />
            <Input id="pp-month" label="Start Month (1-12)" type="number" min="1" max="12" value={planForm.startMonth} onChange={(e) => setPlanForm({ ...planForm, startMonth: e.target.value })} required mono />
          </div>
          <p className="form-note">Custom installment schedules (unequal amounts) are set from the API.</p>
        </form>
      </Modal>

      <ConfirmationModal
        open={confirmClearPlan}
        onClose={() => setConfirmClearPlan(false)}
        onConfirm={() => clearPlan.mutate()}
        title="Clear Arrears Payment Plan"
        itemName={c?.employeeName || 'Payment Plan'}
        details={{
          'Employee': c?.employeeName,
          'Total Arrears': fmt.money(c?.effectiveTotalAmount),
          'Installments': `${installments.filter((i) => i.status === 'PAID').length} paid / ${installments.length} total`,
        }}
        warningMessage="Clearing the payment plan will remove all unpaid installments. Paid installments and their Service Book records remain unaffected."
        confirmLabel="Confirm Clear Plan"
        confirmVariant="danger"
        loading={clearPlan.isPending}
        error={actionError}
      />
    </div>
  );
}
