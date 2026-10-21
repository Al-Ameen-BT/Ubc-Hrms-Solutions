import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { masterDataApi, fmt } from '../../api/client';
import { leaveApi } from '../../api/extended';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { EmployeeBankAccountsTab } from './EmployeeBankAccountsTab';
import { EmployeeLoansTab } from './EmployeeLoansTab';
import { EmployeeAttendanceTab } from './EmployeeAttendanceTab';
import { EmployeeDocumentsTab } from './EmployeeDocumentsTab';
import { EmployeePayslipTab } from './EmployeePayslipTab';

const TABS = ['Service Book', 'Pay History', 'Leave', 'Attendance', 'Bank Accounts', 'Loans', 'Documents', 'Payslip'];
const NON_PAY_EVENTS = ['APPOINTMENT', 'PROBATION', 'CONFIRMATION', 'TRANSFER', 'SUSPENSION', 'LWA', 'BREAK_IN_SERVICE', 'DISCIPLINARY', 'RETIREMENT', 'OTHER'];

export function EmployeeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState('Service Book');
  const [eventOpen, setEventOpen] = useState(false);
  const [eventForm, setEventForm] = useState({ eventType: 'CONFIRMATION', eventDate: '', remarks: '' });
  const [error, setError] = useState('');

  const { data: book, isLoading } = useQuery({
    queryKey: ['service-book', id],
    queryFn: () => masterDataApi.serviceBook(id),
  });

  const { data: balances } = useQuery({
    queryKey: ['employee-leave-balances', id],
    queryFn: () => leaveApi.employeeBalances(id),
    enabled: tab === 'Leave',
  });

  const addEvent = useMutation({
    mutationFn: (payload) => masterDataApi.addServiceBookEvent(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-book', id] });
      toast.add('Service book entry added.', 'success');
      setEventOpen(false);
      setEventForm({ eventType: 'CONFIRMATION', eventDate: '', remarks: '' });
    },
    onError: (err) => setError(err.message || 'Could not add entry.'),
  });

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payForm, setPayForm] = useState({ hraType: 'PERCENT', fixedHraAmount: '', riskAllowance: '', otherAllowance: '' });

  const updatePay = useMutation({
    mutationFn: (payload) => masterDataApi.updateEmployee(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-book', id] });
      queryClient.invalidateQueries({ queryKey: ['emp-payslip', id] });
      toast.add('Allowances updated.', 'success');
      setPayModalOpen(false);
    },
    onError: (err) => setError(err.message || 'Could not update allowances.'),
  });

  if (isLoading) return <div className="page"><p>Loading…</p></div>;
  const employee = book?.employee;
  if (!employee) return <div className="page"><EmptyState title="Employee not found" /></div>;

  const timeline = book?.timeline || [];
  const payEntries = timeline.filter((t) => t.PayHistoryEntry);

  const openPayModal = () => {
    setError('');
    setPayForm({
      hraType: employee.hraType || 'PERCENT',
      fixedHraAmount: employee.fixedHraAmount ?? '',
      riskAllowance: employee.riskAllowance ?? '',
      otherAllowance: employee.otherAllowance ?? '',
    });
    setPayModalOpen(true);
  };

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1>{employee.name}</h1>
            <p className="mono">
              {employee.empCode} · {employee.PostCadre?.name || 'No post'} · {employee.designation || 'No designation'}
            </p>
          </div>
          <div className="page-header-actions">
            <Button variant="secondary" onClick={openPayModal}>Edit Allowances</Button>
            <Badge variant={employee.status === 'ACTIVE' ? 'success' : 'default'}>{employee.status}</Badge>
            <Button variant="secondary" onClick={() => navigate('/employees')}>Back</Button>
          </div>
        </div>
      </header>

      <div className="stat-grid">
        <div className="stat-ledger"><div className="stat-ledger-label">Basic Pay</div><div className="stat-ledger-value mono">{fmt.money(employee.currentBasicPay)}</div></div>
        <div className="stat-ledger"><div className="stat-ledger-label">Grade</div><div className="stat-ledger-value">{employee.CurrentPayScale?.name || '—'}</div></div>
        <div className="stat-ledger"><div className="stat-ledger-label">Stage</div><div className="stat-ledger-value mono">{employee.CurrentPayStage?.stageNo ?? '—'}</div></div>
        {Number(employee.riskAllowance) > 0 && (
          <div className="stat-ledger"><div className="stat-ledger-label">Risk Allowance</div><div className="stat-ledger-value mono">{fmt.money(employee.riskAllowance)}</div></div>
        )}
        <div className="stat-ledger"><div className="stat-ledger-label">Date of Joining</div><div className="stat-ledger-value mono">{fmt.date(employee.doj)}</div></div>
        <div className="stat-ledger"><div className="stat-ledger-label">Retirement</div><div className="stat-ledger-value mono">{fmt.date(book?.effectiveRetirementDate)}</div></div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? 'tab-active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Service Book' && (
        <Card noPadding>
          <div className="table-toolbar">
            <span className="mono">{book?.timelineCount || 0} entries</span>
            <Button onClick={() => { setError(''); setEventOpen(true); }}>Add Entry</Button>
          </div>
          <div className="service-book-timeline">
            {timeline.length ? timeline.map((entry) => (
              <div key={entry.id} className="timeline-entry">
                <div className="timeline-date mono">{fmt.date(entry.eventDate)}</div>
                <div className="timeline-content">
                  <div className="timeline-event">{entry.eventType?.replace(/_/g, ' ')}</div>
                  {entry.PayHistoryEntry && (
                    <div className="timeline-pay mono">
                      Pay {fmt.money(entry.PayHistoryEntry.newBasicPay)}
                      {entry.PayHistoryEntry.previousBasicPay != null && ` (from ${fmt.money(entry.PayHistoryEntry.previousBasicPay)})`}
                    </div>
                  )}
                  {entry.GovernmentOrder && <div className="timeline-particulars">GO: {entry.GovernmentOrder.goNumber}</div>}
                  {entry.RuleReference && <div className="timeline-particulars">Rule: {entry.RuleReference.ruleNumber || entry.RuleReference.title}</div>}
                  {entry.orderRef && <div className="timeline-particulars">Ref: {entry.orderRef}</div>}
                  {entry.remarks && <div className="timeline-particulars">{entry.remarks}</div>}
                  {entry.document && <div className="timeline-stamp"><Badge stamp variant="info">Document</Badge></div>}
                </div>
              </div>
            )) : <EmptyState title="No service book entries" description="Entries appear here as events are recorded." />}
          </div>
        </Card>
      )}

      {tab === 'Pay History' && (
        <Card noPadding>
          <table className="table">
            <thead>
              <tr>
                <th className="table-th">Date</th>
                <th className="table-th">Event</th>
                <th className="table-th table-th-right">Previous</th>
                <th className="table-th table-th-right">New Basic</th>
              </tr>
            </thead>
            <tbody>
              {payEntries.length ? payEntries.map((row) => (
                <tr key={row.id} className="table-row">
                  <td className="table-td mono">{fmt.date(row.eventDate)}</td>
                  <td className="table-td">{row.eventType?.replace(/_/g, ' ')}</td>
                  <td className="table-td table-td-right mono">{fmt.money(row.PayHistoryEntry.previousBasicPay)}</td>
                  <td className="table-td table-td-right mono">{fmt.money(row.PayHistoryEntry.newBasicPay)}</td>
                </tr>
              )) : (
                <tr><td colSpan={4}><EmptyState title="No pay history" description="Increments and promotions posted by the pay engines appear here." /></td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'Leave' && (
        <Card title="Leave Balances" noPadding>
          <table className="table">
            <thead>
              <tr>
                <th className="table-th">Leave Type</th>
                <th className="table-th table-th-right">Opening</th>
                <th className="table-th table-th-right">Accrued</th>
                <th className="table-th table-th-right">Availed</th>
                <th className="table-th table-th-right">Closing</th>
              </tr>
            </thead>
            <tbody>
              {(balances?.rows || []).length ? balances.rows.map((b) => (
                <tr key={b.id} className="table-row">
                  <td className="table-td">{b.LeaveType?.name || '—'}</td>
                  <td className="table-td table-td-right mono">{Number(b.openingBalance)}</td>
                  <td className="table-td table-td-right mono">{Number(b.accrued)}</td>
                  <td className="table-td table-td-right mono">{Number(b.availed)}</td>
                  <td className="table-td table-td-right mono">{Number(b.closingBalance)}</td>
                </tr>
              )) : (
                <tr><td colSpan={5}><EmptyState title="No leave balances" description="Balances appear once accrual is run for a leave type." /></td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'Attendance' && <EmployeeAttendanceTab employeeId={id} />}
      {tab === 'Bank Accounts' && <EmployeeBankAccountsTab employeeId={id} />}
      {tab === 'Loans' && <EmployeeLoansTab employeeId={id} />}
      {tab === 'Documents' && <EmployeeDocumentsTab employeeId={id} />}
      {tab === 'Payslip' && <EmployeePayslipTab employeeId={id} employeeName={employee.name} />}

      <Modal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        title="Employee Allowances"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayModalOpen(false)}>Cancel</Button>
            <Button
              loading={updatePay.isPending}
              onClick={() => {
                setError('');
                updatePay.mutate({
                  hraType: payForm.hraType,
                  fixedHraAmount: payForm.hraType === 'FIXED' ? (payForm.fixedHraAmount === '' ? null : Number(payForm.fixedHraAmount)) : null,
                  riskAllowance: payForm.riskAllowance === '' ? null : Number(payForm.riskAllowance),
                  otherAllowance: payForm.otherAllowance === '' ? null : Number(payForm.otherAllowance),
                });
              }}
            >
              Save Allowances
            </Button>
          </>
        }
      >
        <form noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="modal-emp-hratype">HRA Basis</label>
              <select
                id="modal-emp-hratype"
                className="input"
                value={payForm.hraType || 'PERCENT'}
                onChange={(e) => setPayForm({ ...payForm, hraType: e.target.value })}
              >
                <option value="PERCENT">Calculated from Basic Pay (%)</option>
                <option value="FIXED">Fixed Amount</option>
              </select>
            </div>
            {payForm.hraType === 'FIXED' && (
              <Input
                id="modal-emp-fixed-hra"
                label="Fixed HRA Amount (₹)"
                type="number"
                step="0.01"
                value={payForm.fixedHraAmount}
                onChange={(e) => setPayForm({ ...payForm, fixedHraAmount: e.target.value })}
                mono
                required
                hint="Fixed HRA is still subject to the bank's maximum HRA ceiling."
              />
            )}
            <Input
              id="emp-risk-allowance"
              label="Risk Allowance (₹)"
              type="number"
              step="0.01"
              value={payForm.riskAllowance}
              onChange={(e) => setPayForm({ ...payForm, riskAllowance: e.target.value })}
              mono
              hint="Set amount to grant Risk Allowance to this employee. Set to 0 or leave empty to remove."
            />
            <Input
              id="emp-other-allowance"
              label="Other Allowance (₹)"
              type="number"
              step="0.01"
              value={payForm.otherAllowance}
              onChange={(e) => setPayForm({ ...payForm, otherAllowance: e.target.value })}
              mono
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={eventOpen}
        onClose={() => setEventOpen(false)}
        title="Add Service Book Entry"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEventOpen(false)}>Cancel</Button>
            <Button loading={addEvent.isPending} onClick={() => { setError(''); addEvent.mutate(eventForm); }}>Add Entry</Button>
          </>
        }
      >
        <form noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="field">
            <label className="field-label" htmlFor="ev-type">Event Type</label>
            <select id="ev-type" className="input" value={eventForm.eventType} onChange={(e) => setEventForm({ ...eventForm, eventType: e.target.value })}>
              {NON_PAY_EVENTS.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <Input id="ev-date" label="Event Date" type="date" value={eventForm.eventDate} onChange={(e) => setEventForm({ ...eventForm, eventDate: e.target.value })} required />
          <Input id="ev-remarks" label="Remarks" value={eventForm.remarks} onChange={(e) => setEventForm({ ...eventForm, remarks: e.target.value })} />
          <p className="form-note">Increments, promotions, higher grade and pay revisions are posted by the pay engines, not entered here.</p>
        </form>
      </Modal>
    </div>
  );
}
