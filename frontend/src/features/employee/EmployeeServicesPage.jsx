import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { employeeApi } from '../../api/employee';
import { fmt } from '../../api/client';
import { assertUploadable, readFileAsDataUrl, ACCEPTED_UPLOAD_TYPES } from '../../lib/files';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { ServiceBookPayslips } from '../employees/ServiceBookPayslips';
import { masterDataApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import './EmployeeServices.css';

const labels = { payslips: 'My Payslips', leave: 'My Leave', policies: 'Bank Policies', calendar: 'My Calendar', workplace: 'Workplace', time: 'Check-in & Check-out', expenses: 'Reimbursement Claims' };
const bankTime = value => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const dateNow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function Notice({ error }) { return error ? <p className="auth-error" role="alert">{error}</p> : null; }
function Status({ value }) { return <Badge variant={['APPROVED', 'PAID'].includes(value) ? 'success' : ['REJECTED', 'WITHDRAWN'].includes(value) ? 'danger' : 'warning'}>{value}</Badge>; }
function groupBy(rows, key) { return rows.reduce((groups, row) => { (groups[key(row)] ||= []).push(row); return groups; }, {}); }

export function EmployeeServicesPage() {
  const { section } = useParams();
  const Component = { payslips: Payslips, leave: Leave, policies: Policies, calendar: Calendar, workplace: Workplace, time: Time, expenses: Expenses }[section];
  return <div className="page"><header className="page-header"><h1>{labels[section]}</h1><p>Employee self-service · your bank account</p></header>{Component ? <Component /> : <EmptyState title="Page not found" />}</div>;
}

function Payslips() {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const { data, isLoading, error: queryError } = useQuery({ queryKey: ['me', 'payslips'], queryFn: employeeApi.payslips });
  const { data: book } = useQuery({ queryKey: ['my-service-book', user?.employeeId], queryFn: () => masterDataApi.serviceBook(user.employeeId), enabled: !!user?.employeeId });
  const rows = data?.rows || [];
  return <><Notice error={error || queryError?.message} /><Card title="Finalized payroll"><p>Only approved or paid payroll runs appear here.</p>{isLoading ? <p>Loading payslips…</p> : rows.length ? <div className="ess-scroll"><table className="table"><thead><tr><th>Period</th><th>Status</th><th>Gross</th><th>Deductions</th><th>Net pay</th><th>PDF</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{new Date(row.year, row.month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</td><td><Status value={row.status} /></td><td>{fmt.money(row.grossEarnings)}</td><td>{fmt.money(row.totalDeductions)}</td><td><strong>{fmt.money(row.netPay)}</strong></td><td><Button size="sm" variant="secondary" onClick={() => employeeApi.downloadPayslip(row.id).catch(e => setError(e.message))}>Download</Button></td></tr>)}</tbody></table></div> : <EmptyState title="No finalized payslips yet" description="Your payslips appear once payroll is approved." />}</Card><ServiceBookPayslips payslips={book?.payslips || []} /></>;
}

function Leave() {
  const client = useQueryClient(); const [error, setError] = useState('');
  const [form, setForm] = useState({ leaveTypeId: '', fromDate: '', toDate: '', reason: '' });
  const { data: types } = useQuery({ queryKey: ['me', 'leave-types'], queryFn: employeeApi.leaveTypes });
  const { data: balances, error: balanceError } = useQuery({ queryKey: ['me', 'leave-balances'], queryFn: () => employeeApi.leaveBalances() });
  const { data: applications, error: appsError } = useQuery({ queryKey: ['me', 'leave-applications'], queryFn: employeeApi.leaveApplications });
  const refresh = () => { client.invalidateQueries({ queryKey: ['me', 'leave-applications'] }); client.invalidateQueries({ queryKey: ['me', 'leave-balances'] }); client.invalidateQueries({ queryKey: ['me', 'calendar'] }); };
  const apply = useMutation({ mutationFn: employeeApi.applyLeave, onSuccess: () => { refresh(); setForm({ leaveTypeId: '', fromDate: '', toDate: '', reason: '' }); setError(''); }, onError: e => setError(e.message) });
  const cancel = useMutation({ mutationFn: employeeApi.cancelLeave, onSuccess: refresh, onError: e => setError(e.message) });
  return <><Notice error={error || balanceError?.message || appsError?.message} /><Card title="Request leave"><form onSubmit={e => { e.preventDefault(); apply.mutate(form); }} className="ess-form"><div className="field"><label className="field-label" htmlFor="my-leave-type">Leave type</label><select id="my-leave-type" className="input" required value={form.leaveTypeId} onChange={e => setForm({ ...form, leaveTypeId: e.target.value })}><option value="">Choose a type</option>{(types?.rows || []).map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select></div><Input id="my-leave-from" label="From" type="date" required value={form.fromDate} onChange={e => setForm({ ...form, fromDate: e.target.value })} /><Input id="my-leave-to" label="To" type="date" required value={form.toDate} onChange={e => setForm({ ...form, toDate: e.target.value })} /><Input id="my-leave-reason" label="Reason" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /><Button type="submit" loading={apply.isPending}>Submit request</Button></form></Card>
    <Card title="Balances"><div className="ess-scroll"><table className="table"><thead><tr><th>Leave type</th><th>Closing balance</th></tr></thead><tbody>{(balances?.rows || []).map(row => <tr key={row.id}><td>{row.LeaveType?.name}</td><td>{Number(row.closingBalance)} days</td></tr>)}</tbody></table></div>{!(balances?.rows || []).length && <EmptyState title="No balances recorded" />}</Card>
    <Card title="Requests"><div className="ess-scroll"><table className="table"><thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th></th></tr></thead><tbody>{(applications?.rows || []).map(row => <tr key={row.id}><td>{row.LeaveType?.name}</td><td>{fmt.date(row.fromDate)} – {fmt.date(row.toDate)}</td><td>{Number(row.days)}</td><td><Status value={row.status} /></td><td>{row.status === 'PENDING' && <Button size="sm" variant="secondary" loading={cancel.isPending} onClick={() => cancel.mutate(row.id)}>Withdraw</Button>}</td></tr>)}</tbody></table></div>{!(applications?.rows || []).length && <EmptyState title="No leave requests yet" />}</Card></>;
}

function Policies() {
  const client = useQueryClient(); const [accepted, setAccepted] = useState(false); const [error, setError] = useState('');
  const { data, error: queryError } = useQuery({ queryKey: ['me', 'policy'], queryFn: employeeApi.policy });
  const acknowledge = useMutation({ mutationFn: employeeApi.acknowledgePolicy, onSuccess: () => { setAccepted(false); client.invalidateQueries({ queryKey: ['me', 'policy'] }); }, onError: e => setError(e.message) });
  return <><Notice error={error || queryError?.message} /><Card title={data?.policy?.title || 'No policy published'}>{data?.policy ? <><p>Version {data.policy.version} · {data.acknowledged ? 'Acknowledged' : 'Awaiting your acknowledgement'}</p><div className="ess-policy-text">{data.policy.body}</div>{!data.acknowledged && <div className="ess-ack"><label><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /> I have read this policy</label><Button disabled={!accepted} loading={acknowledge.isPending} onClick={() => acknowledge.mutate(data.policy.version)}>Acknowledge policy</Button></div>}</> : <EmptyState title="No bank policy yet" description="Your bank will publish policies here." />}</Card><Card title="Acknowledgement history">{data?.history?.length ? data.history.map(row => <p key={row.id}>{row.EmployeePolicy?.title} · version {row.EmployeePolicy?.version} · {fmt.dateTime(row.acknowledgedAt)}</p>) : <EmptyState title="No acknowledgements yet" />}</Card></>;
}

function Calendar() {
  const today = new Date(); const [period, setPeriod] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const { data, error } = useQuery({ queryKey: ['me', 'calendar', period.year, period.month], queryFn: () => employeeApi.calendar(period.year, period.month) });
  const first = new Date(period.year, period.month - 1, 1).getDay(); const days = new Date(period.year, period.month, 0).getDate();
  const move = delta => { const date = new Date(period.year, period.month - 1 + delta, 1); setPeriod({ year: date.getFullYear(), month: date.getMonth() + 1 }); };
  const monthName = new Date(period.year, period.month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  return <><Notice error={error?.message} /><Card title={monthName} actions={<div className="row-actions"><Button variant="secondary" size="sm" onClick={() => move(-1)}>Previous</Button><Button variant="secondary" size="sm" onClick={() => move(1)}>Next</Button></div>}><div className="ess-calendar-grid">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <strong key={day}>{day}</strong>)}{Array.from({ length: first }, (_, i) => <span key={`blank-${i}`} />)}{Array.from({ length: days }, (_, i) => { const day = i + 1; const date = `${period.year}-${String(period.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const holiday = (data?.holidays || []).find(row => row.date === date); const leaves = (data?.leave || []).filter(row => row.fromDate <= date && row.toDate >= date); const entry = (data?.time || []).find(row => row.localDate === date); const weekend = new Date(period.year, period.month - 1, day).getDay() % 6 === 0; return <div key={date} className={`ess-calendar-day${weekend ? ' is-weekend' : ''}`}><strong>{day}</strong>{holiday && <span>{holiday.name}</span>}{leaves.map(row => <span key={row.id}>{row.LeaveType?.name} · {row.status}</span>)}{entry && <span>Checked in</span>}</div>; })}</div></Card></>;
}

function Workplace() {
  const { data, error } = useQuery({ queryKey: ['me', 'workplace'], queryFn: employeeApi.workplace });
  const branches = groupBy(data?.rows || [], row => row.branchName || 'Unassigned branch');
  return <>
    <Notice error={error?.message} />
    <p>Bank → branch → department → role. This directory shows work identity only.</p>
    {Object.entries(branches).map(([branch, people]) => <Card key={branch} title={`${branch} · ${people.length}`}>
      <div className="ess-directory">
        {Object.entries(groupBy(people, row => row.department || 'Unassigned department')).map(([department, staff]) => <details key={department} open>
          <summary>{department} · {staff.length}</summary>
          {Object.entries(groupBy(staff, row => row.designation || row.postName || 'Unassigned role')).map(([role, members]) => <div key={role} className="ess-role-group">
            <h4>{role} · {members.length}</h4>
            <div className="ess-scroll"><table className="table"><thead><tr><th>Employee</th><th>Code</th></tr></thead><tbody>{members.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.empCode}</td></tr>)}</tbody></table></div>
          </div>)}
        </details>)}
      </div>
    </Card>)}
    {!Object.keys(branches).length && <EmptyState title="No employees listed" />}
  </>;
}

function Time() {
  const client = useQueryClient(); const [error, setError] = useState(''); const today = new Date();
  const [period, setPeriod] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const key = ['me', 'time', period.year, period.month];
  const { data, error: queryError } = useQuery({ queryKey: key, queryFn: () => employeeApi.time(period.year, period.month) });
  const refresh = () => { client.invalidateQueries({ queryKey: ['me', 'time'] }); client.invalidateQueries({ queryKey: ['me', 'calendar'] }); };
  const checkIn = useMutation({ mutationFn: employeeApi.checkIn, onSuccess: refresh, onError: e => setError(e.message) });
  const checkOut = useMutation({ mutationFn: employeeApi.checkOut, onSuccess: refresh, onError: e => setError(e.message) });
  return <><Notice error={error || queryError?.message} /><Card title="Record attendance"><p>Times are recorded by the server in India Standard Time. HR reconciles monthly loss-of-pay separately.</p><div className="row-actions"><Button loading={checkIn.isPending} onClick={() => checkIn.mutate()}>Check in</Button><Button variant="secondary" loading={checkOut.isPending} onClick={() => checkOut.mutate()}>Check out</Button></div></Card><Card title="My time entries" actions={<input aria-label="Month" className="input" type="month" value={`${period.year}-${String(period.month).padStart(2, '0')}`} onChange={e => { if (e.target.value) { const [year, month] = e.target.value.split('-').map(Number); setPeriod({ year, month }); } }} />}><div className="ess-scroll"><table className="table"><thead><tr><th>Date</th><th>Check-in</th><th>Check-out</th><th>Correction</th></tr></thead><tbody>{(data?.rows || []).map(row => <tr key={row.id}><td>{fmt.date(row.localDate)}</td><td>{bankTime(row.checkInAt)}</td><td>{row.checkOutAt ? bankTime(row.checkOutAt) : 'Open'}</td><td>{row.correctionReason || '—'}</td></tr>)}</tbody></table></div>{!(data?.rows || []).length && <EmptyState title="No entries this month" />}</Card></>;
}

function Expenses() {
  const client = useQueryClient(); const [error, setError] = useState(''); const [file, setFile] = useState(null);
  const [form, setForm] = useState({ expenseDate: dateNow(), category: '', purpose: '', amount: '' });
  const { data, error: queryError } = useQuery({ queryKey: ['me', 'expenses'], queryFn: employeeApi.expenses });
  const submit = useMutation({ mutationFn: employeeApi.submitExpense, onSuccess: () => { client.invalidateQueries({ queryKey: ['me', 'expenses'] }); setForm({ expenseDate: dateNow(), category: '', purpose: '', amount: '' }); setFile(null); setError(''); }, onError: e => setError(e.message) });
  const withdraw = useMutation({ mutationFn: employeeApi.withdrawExpense, onSuccess: () => client.invalidateQueries({ queryKey: ['me', 'expenses'] }), onError: e => setError(e.message) });
  const send = async e => { e.preventDefault(); try { assertUploadable(file); if (!Number.isSafeInteger(Number(form.amount)) || Number(form.amount) <= 0) throw new Error('Enter a positive whole-rupee amount.'); submit.mutate({ ...form, amount: Number(form.amount), receiptDataUrl: await readFileAsDataUrl(file) }); } catch (err) { setError(err.message); } };
  return <><Notice error={error || queryError?.message} /><Card title="Submit a claim"><p>Claims are approved and paid separately from payroll. Attach a PDF or image receipt (up to 5 MB).</p><form onSubmit={send} className="ess-form"><Input id="expense-date" label="Expense date" type="date" required value={form.expenseDate} onChange={e => setForm({ ...form, expenseDate: e.target.value })} /><Input id="expense-category" label="Category" required value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /><Input id="expense-purpose" label="Business purpose" required value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} /><Input id="expense-amount" label="Amount (₹, whole rupees)" type="number" min="1" step="1" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /><Input id="expense-receipt" label="Receipt" type="file" accept={ACCEPTED_UPLOAD_TYPES} required onChange={e => setFile(e.target.files?.[0] || null)} /><Button type="submit" loading={submit.isPending}>Submit claim</Button></form></Card><Card title="My claims"><div className="ess-scroll"><table className="table"><thead><tr><th>Expense date</th><th>Purpose</th><th>Amount</th><th>Status</th><th>Receipt</th><th></th></tr></thead><tbody>{(data?.rows || []).map(row => <tr key={row.id}><td>{fmt.date(row.expenseDate)}</td><td>{row.purpose}</td><td>{fmt.money(row.amount)}</td><td><Status value={row.status} />{row.decisionReason && <small> · {row.decisionReason}</small>}{row.paymentReference && <small> · Paid {fmt.date(row.paidAt)} · {row.paymentReference}</small>}</td><td><Button size="sm" variant="secondary" onClick={() => employeeApi.openExpenseReceipt(row.id).catch(e => setError(e.message))}>Open</Button></td><td>{['SUBMITTED', 'PREPARED'].includes(row.status) && <Button size="sm" variant="secondary" loading={withdraw.isPending} onClick={() => withdraw.mutate(row.id)}>Withdraw</Button>}</td></tr>)}</tbody></table></div>{!(data?.rows || []).length && <EmptyState title="No claims yet" />}</Card></>;
}
