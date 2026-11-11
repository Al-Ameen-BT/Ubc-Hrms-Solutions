import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { masterDataApi, fmt } from '../../api/client';
import { compensationApi } from '../../api/compensation';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';

export function CompensationPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ effectiveDate: '', postCode: '', stageNo: '', amount: '', reason: '' });
  const [error, setError] = useState('');
  const { data: book, isLoading } = useQuery({ queryKey: ['service-book', id], queryFn: () => masterDataApi.serviceBook(id) });
  const { data: adoption } = useQuery({ queryKey: ['catalogue-adoptions'], queryFn: compensationApi.adoptions });
  const { data: history } = useQuery({ queryKey: ['compensation', id], queryFn: () => compensationApi.assignments(id) });
  const employee = book?.employee;
  const adopted = adoption?.history?.find(row => row.status === 'APPROVED' && (!form.effectiveDate || row.effectiveDate <= form.effectiveDate));
  const catalogue = adopted?.BankRuleCatalogue;
  const post = catalogue?.posts?.find(row => row.code === form.postCode);
  const stageAmount = post?.stages?.[Number(form.stageNo) - 1];
  const currentPay = book?.effectiveCompensation?.basicPay ?? Number(employee?.currentBasicPay || 0);
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['compensation', id] }); queryClient.invalidateQueries({ queryKey: ['service-book', id] }); };
  const proposal = useMutation({ mutationFn: compensationApi.proposeAssignment, onSuccess: () => { refresh(); setError(''); toast.add('Salary change sent for approval.', 'success'); }, onError: e => setError(e.message) });
  const decision = useMutation({ mutationFn: ({ rowId, action }) => compensationApi.decideAssignment(rowId, action), onSuccess: () => { refresh(); setError(''); toast.add('Salary decision recorded.', 'success'); }, onError: e => setError(e.message) });
  if (isLoading) return <div className="page"><p>Loading salary…</p></div>;
  if (!employee) return <div className="page"><p>Employee not found.</p></div>;
  return <div className="page">
    <header className="page-header"><Link to={`/employees/${id}`}>← {employee.name}</Link><h1>Salary assignment</h1><p>Approved government stages and direct-pay salaries take effect on the chosen date. Past approved payslips stay frozen.</p></header>
    {error && <div className="auth-error" role="alert">{error}</div>}
    <Card title="Effective pay"><p><strong>{fmt.money(currentPay)}</strong> · {book?.effectiveCompensation?.source || 'Legacy'} {book?.effectiveCompensation?.orderNumber && `· ${book.effectiveCompensation.orderNumber}`}</p></Card>
    {['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'PAYROLL_OFFICER'].includes(user?.role) && <Card title="Prepare salary change">
      {!adopted && <p>Approve a bank-class adoption first.</p>}
      <div className="form-grid">
        <Input id="salary-date" label="Effective date" type="date" value={form.effectiveDate} onChange={e => setForm({ ...form, effectiveDate: e.target.value })} />
        {employee.directPay ? <Input id="salary-amount" label="Monthly gross salary (₹)" type="number" step="1" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /> : <>
          <div className="field"><label className="field-label" htmlFor="salary-post">Government post</label><select id="salary-post" className="input" value={form.postCode} onChange={e => setForm({ ...form, postCode: e.target.value, stageNo: '' })}><option value="">Choose post</option>{catalogue?.posts?.map(row => <option key={row.code} value={row.code}>{row.name}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor="salary-stage">Stage</label><select id="salary-stage" className="input" value={form.stageNo} onChange={e => setForm({ ...form, stageNo: e.target.value })}><option value="">Choose stage</option>{post?.stages?.map((amount, index) => <option key={index} value={index + 1}>Stage {index + 1} · {fmt.money(amount)}</option>)}</select></div>
        </>}
        <Input id="salary-reason" label="Reason" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
      </div>
      <p className="form-note">Revision: {catalogue?.name || 'Not adopted'} · {catalogue?.orderNumber || 'No order'} · Proposed pay: {fmt.money(employee.directPay ? Number(form.amount) : stageAmount || 0)} · Change: {fmt.money((employee.directPay ? Number(form.amount) : stageAmount || 0) - currentPay)}</p>
      <div className="card-actions"><Button disabled={!adopted || !form.effectiveDate || !form.reason.trim() || !(employee.directPay ? Number(form.amount) > 0 : stageAmount)} loading={proposal.isPending} onClick={() => proposal.mutate({ employeeId: Number(id), catalogueId: employee.directPay ? null : adopted.catalogueId, postCode: employee.directPay ? null : form.postCode, stageNo: employee.directPay ? null : Number(form.stageNo), amount: employee.directPay ? Number(form.amount) : undefined, effectiveDate: form.effectiveDate, reason: form.reason })}>Send for approval</Button></div>
    </Card>}
    <Card title="Assignment history">{history?.rows?.length ? <div className="table-wrap"><table className="table"><thead><tr><th className="table-th">Effective</th><th className="table-th">Post / stage</th><th className="table-th">Pay</th><th className="table-th">Status</th><th className="table-th">Decision</th></tr></thead><tbody>{history.rows.map(row => <tr key={row.id} className="table-row"><td className="table-td mono">{row.effectiveDate}</td><td className="table-td">{row.postCode ? `${row.postCode} · stage ${row.stageNo}` : 'Direct pay'}</td><td className="table-td mono">{fmt.money(row.amount)}</td><td className="table-td"><Badge variant={row.status === 'APPROVED' ? 'success' : 'default'}>{row.status}</Badge></td><td className="table-td">{row.status === 'PENDING' && user?.role === 'APPROVING_AUTHORITY' && <div className="row-actions"><Button size="sm" loading={decision.isPending} onClick={() => decision.mutate({ rowId: row.id, action: 'APPROVED' })}>Approve</Button><Button size="sm" variant="secondary" onClick={() => decision.mutate({ rowId: row.id, action: 'REJECTED' })}>Reject</Button></div>}</td></tr>)}</tbody></table></div> : <p>No assignments yet.</p>}</Card>
  </div>;
}
