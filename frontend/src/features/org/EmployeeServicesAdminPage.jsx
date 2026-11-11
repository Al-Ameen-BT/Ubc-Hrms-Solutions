import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { employeeAdminApi } from '../../api/employee';
import { fmt } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import '../employee/EmployeeServices.css';

const bankTime = value => value ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const bankInput = value => value ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)).replace(' ', 'T') : '';
const bankIso = value => value ? new Date(`${value}:00+05:30`).toISOString() : null;

const sections = { policy: 'Policy', holidays: 'Holidays', time: 'Time corrections', expenses: 'Expense approvals' };
function Notice({ error }) { return error ? <p className="auth-error" role="alert">{error}</p> : null; }
export function EmployeeServicesAdminPage() {
  const { section = 'expenses' } = useParams(); const { user } = useAuth();
  const allowed = { policy: ['ORG_ADMIN'], holidays: ['ORG_ADMIN', 'HR_ADMIN'], time: ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER'], expenses: ['ORG_ADMIN', 'HR_ADMIN', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'] };
  const visible = Object.entries(sections).filter(([key]) => allowed[key].includes(user?.role));
  const Component = { policy: PolicyEditor, holidays: Holidays, time: TimeCorrections, expenses: ExpenseReview }[section];
  return <div className="page"><header className="page-header"><h1>Employee Services</h1><p>Manage policies, holidays, time corrections, and reimbursement claims</p></header><nav className="ess-tabs" aria-label="Employee services">{visible.map(([key, label]) => <Link key={key} to={`/employee-services/${key}`} aria-current={section === key ? 'page' : undefined}>{label}</Link>)}</nav>{allowed[section]?.includes(user?.role) && Component ? <Component /> : <EmptyState title="No access to this section" />}</div>;
}

function PolicyEditor() {
  const client = useQueryClient(); const [error, setError] = useState(''); const [form, setForm] = useState(null);
  const { data, error: queryError } = useQuery({ queryKey: ['org', 'employee-policy'], queryFn: employeeAdminApi.policy });
  const save = useMutation({ mutationFn: employeeAdminApi.publishPolicy, onSuccess: () => { client.invalidateQueries({ queryKey: ['org', 'employee-policy'] }); setForm(null); setError(''); }, onError: e => setError(e.message) });
  const value = form || { title: data?.title || '', body: data?.body || '' };
  return <><Notice error={error || queryError?.message} /><Card title="Published policy"><p>Saving changed text publishes a new version and asks employees to acknowledge it again.</p><form onSubmit={e => { e.preventDefault(); save.mutate(value); }} className="ess-policy-form"><Input id="policy-title" label="Title" required value={value.title} onChange={e => setForm({ ...value, title: e.target.value })} /><div className="field"><label className="field-label" htmlFor="policy-body">Policy text</label><textarea id="policy-body" className="input ess-textarea" required value={value.body} onChange={e => setForm({ ...value, body: e.target.value })} /></div><div className="row-actions"><span>Current version: {data?.version || 'None'}</span><Button type="submit" loading={save.isPending}>Publish policy</Button></div></form></Card></>;
}

function Holidays() {
  const client = useQueryClient();
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ date: '', name: '' });
  const { data, error: queryError } = useQuery({ queryKey: ['org', 'holidays'], queryFn: employeeAdminApi.holidays });
  const refresh = () => client.invalidateQueries({ queryKey: ['org', 'holidays'] });
  const save = useMutation({
    mutationFn: () => editing ? employeeAdminApi.updateHoliday(editing.id, form) : employeeAdminApi.createHoliday(form),
    onSuccess: () => { refresh(); setEditing(null); setForm({ date: '', name: '' }); setError(''); },
    onError: e => setError(e.message),
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, status }) => employeeAdminApi.updateHoliday(id, { status }),
    onSuccess: refresh,
    onError: e => setError(e.message),
  });
  return <>
    <Notice error={error || queryError?.message} />
    <Card title={editing ? 'Edit holiday' : 'Add holiday'}>
      <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="ess-form">
        <Input id="holiday-date" label="Date" type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
        <Input id="holiday-name" label="Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <div className="row-actions"><Button type="submit" loading={save.isPending}>{editing ? 'Save holiday' : 'Add holiday'}</Button>{editing && <Button variant="secondary" onClick={() => { setEditing(null); setForm({ date: '', name: '' }); }}>Cancel</Button>}</div>
      </form>
    </Card>
    <Card title="Bank holidays"><div className="ess-scroll"><table className="table"><thead><tr><th>Date</th><th>Name</th><th>Status</th><th>Actions</th></tr></thead><tbody>{(data?.rows || []).map(row => <tr key={row.id}><td>{fmt.date(row.date)}</td><td>{row.name}</td><td><Badge variant={row.status === 'ACTIVE' ? 'success' : 'default'}>{row.status}</Badge></td><td><div className="row-actions"><Button size="sm" variant="secondary" onClick={() => { setEditing(row); setForm({ date: row.date, name: row.name }); }}>Edit</Button><Button size="sm" variant="secondary" loading={changeStatus.isPending} onClick={() => changeStatus.mutate({ id: row.id, status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}>{row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</Button></div></td></tr>)}</tbody></table></div>{!(data?.rows || []).length && <EmptyState title="No holidays entered" />}</Card>
  </>;
}

function TimeCorrections() {
  const client = useQueryClient(); const [error, setError] = useState(''); const today = new Date(); const [period, setPeriod] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const { data, error: queryError } = useQuery({ queryKey: ['org', 'time', period.year, period.month], queryFn: () => employeeAdminApi.time(period.year, period.month) });
  const [editing, setEditing] = useState(null); const [reason, setReason] = useState(''); const [checkInAt, setCheckInAt] = useState(''); const [checkOutAt, setCheckOutAt] = useState('');
  const correct = useMutation({ mutationFn: () => employeeAdminApi.correctTime(editing.id, { checkInAt: bankIso(checkInAt), checkOutAt: bankIso(checkOutAt), reason }), onSuccess: () => { client.invalidateQueries({ queryKey: ['org', 'time'] }); setEditing(null); setError(''); }, onError: e => setError(e.message) });
  return <><Notice error={error || queryError?.message} /><Card title="Daily time records" actions={<input aria-label="Month" className="input" type="month" value={`${period.year}-${String(period.month).padStart(2, '0')}`} onChange={e => { if (e.target.value) { const [year, month] = e.target.value.split('-').map(Number); setPeriod({ year, month }); } }} />}><p>Corrections require a reason and are recorded in the audit log. Monthly LOP remains a separate payroll action.</p><div className="ess-scroll"><table className="table"><thead><tr><th>Employee</th><th>Date</th><th>Check-in</th><th>Check-out</th><th></th></tr></thead><tbody>{(data?.rows || []).map(row => <tr key={row.id}><td>{row.Employee?.name} · {row.Employee?.empCode}</td><td>{fmt.date(row.localDate)}</td><td>{bankTime(row.checkInAt)}</td><td>{row.checkOutAt ? bankTime(row.checkOutAt) : 'Open'}</td><td><Button size="sm" variant="secondary" onClick={() => { setEditing(row); setReason(''); setCheckInAt(bankInput(row.checkInAt)); setCheckOutAt(bankInput(row.checkOutAt)); }}>Correct</Button></td></tr>)}</tbody></table></div>{!(data?.rows || []).length && <EmptyState title="No entries this month" />}</Card>{editing && <Card title={`Correct ${editing.Employee?.name} · ${editing.localDate}`}><form onSubmit={e => { e.preventDefault(); correct.mutate(); }} className="ess-form"><Input id="time-correct-in" label="Check-in time (IST)" type="datetime-local" required value={checkInAt} onChange={e => setCheckInAt(e.target.value)} /><Input id="time-correct-out" label="Check-out time (IST)" type="datetime-local" value={checkOutAt} onChange={e => setCheckOutAt(e.target.value)} /><Input id="time-correct-reason" label="Reason" required value={reason} onChange={e => setReason(e.target.value)} /><div className="row-actions"><Button type="submit" loading={correct.isPending}>Save correction</Button><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button></div></form></Card>}</>;
}

function ExpenseReview() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const [payment, setPayment] = useState(null);
  const [rejection, setRejection] = useState(null);
  const [reference, setReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const { data, error: queryError } = useQuery({ queryKey: ['org', 'expenses'], queryFn: employeeAdminApi.expenses });
  const refresh = () => client.invalidateQueries({ queryKey: ['org', 'expenses'] });
  const action = useMutation({
    mutationFn: ({ id, kind, reason: decisionReason }) => kind === 'prepare' ? employeeAdminApi.prepareExpense(id) : employeeAdminApi.decideExpense(id, kind, decisionReason),
    onSuccess: () => { refresh(); setError(''); setRejection(null); setReason(''); },
    onError: e => setError(e.message),
  });
  const pay = useMutation({
    mutationFn: () => employeeAdminApi.payExpense(payment.id, reference, paymentDate),
    onSuccess: () => { refresh(); setPayment(null); setReference(''); setError(''); },
    onError: e => setError(e.message),
  });
  const rows = data?.rows || [];
  return <>
    <Notice error={error || queryError?.message} />
    <Card title="Reimbursement claims">
      <p>Prepared claims need separate approval. Record payment only after the bank transfer has been made.</p>
      <div className="ess-scroll"><table className="table"><thead><tr><th>Employee</th><th>Expense</th><th>Purpose</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.id}>
          <td>{row.Employee?.name}</td><td>{fmt.date(row.expenseDate)} · {row.category}</td><td>{row.purpose}</td><td>{fmt.money(row.amount)}</td>
          <td><Badge variant={['APPROVED', 'PAID'].includes(row.status) ? 'success' : ['REJECTED', 'WITHDRAWN'].includes(row.status) ? 'danger' : 'warning'}>{row.status}</Badge></td>
          <td><div className="row-actions">
            <Button size="sm" variant="secondary" onClick={() => employeeAdminApi.openExpenseReceipt(row.id).catch(e => setError(e.message))}>Receipt</Button>
            {row.status === 'SUBMITTED' && ['ACCOUNTS_OFFICER', 'PAYROLL_OFFICER'].includes(user?.role) && <Button size="sm" onClick={() => action.mutate({ id: row.id, kind: 'prepare' })}>Prepare</Button>}
            {row.status === 'PREPARED' && ['ORG_ADMIN', 'APPROVING_AUTHORITY'].includes(user?.role) && <><Button size="sm" onClick={() => action.mutate({ id: row.id, kind: 'APPROVED' })}>Approve</Button><Button size="sm" variant="secondary" onClick={() => { setRejection(row); setReason(''); }}>Reject</Button></>}
            {row.status === 'APPROVED' && user?.role === 'ACCOUNTS_OFFICER' && <Button size="sm" onClick={() => setPayment(row)}>Record payment</Button>}
          </div></td>
        </tr>)}
      </tbody></table></div>
      {!rows.length && <EmptyState title="No claims submitted" />}
    </Card>
    {rejection && <Card title={`Reject claim · ${rejection.Employee?.name}`}><form onSubmit={e => { e.preventDefault(); action.mutate({ id: rejection.id, kind: 'REJECTED', reason }); }} className="ess-form"><Input id="rejection-reason" label="Reason for rejection" required value={reason} onChange={e => setReason(e.target.value)} /><div className="row-actions"><Button type="submit" loading={action.isPending}>Confirm rejection</Button><Button variant="secondary" onClick={() => setRejection(null)}>Cancel</Button></div></form></Card>}
    {payment && <Card title={`Record payment · ${payment.Employee?.name}`}><form onSubmit={e => { e.preventDefault(); pay.mutate(); }} className="ess-form"><Input id="payment-reference" label="Bank payment reference" required value={reference} onChange={e => setReference(e.target.value)} /><Input id="payment-date" label="Payment date" type="date" required value={paymentDate} onChange={e => setPaymentDate(e.target.value)} /><div className="row-actions"><Button type="submit" loading={pay.isPending}>Mark paid</Button><Button variant="secondary" onClick={() => setPayment(null)}>Cancel</Button></div></form></Card>}
  </>;
}
