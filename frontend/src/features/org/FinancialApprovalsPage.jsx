import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { compensationApi } from '../../api/compensation';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

export function FinancialApprovalsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const client = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['financial-changes'], queryFn: compensationApi.financialChanges });
  const decision = useMutation({ mutationFn: ({ id, action }) => compensationApi.decideFinancialChange(id, action), onSuccess: () => { client.invalidateQueries({ queryKey: ['financial-changes'] }); client.invalidateQueries({ queryKey: ['org-payroll-settings'] }); toast.add('Financial decision recorded.', 'success'); }, onError: e => toast.add(e.message, 'error') });
  return <div className="page"><header className="page-header"><h1>Financial changes</h1><p>Review bank payroll settings and employee allowance changes before they take financial effect.</p></header>
    {isLoading && <p>Loading proposals…</p>}{error && <div className="auth-error" role="alert">{error.message}</div>}
    <Card title="Proposal history">{data?.rows?.length ? <div className="table-wrap"><table className="table"><thead><tr><th className="table-th">Effective</th><th className="table-th">Target</th><th className="table-th">Change</th><th className="table-th">Reason</th><th className="table-th">Status</th><th className="table-th">Decision</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.id} className="table-row"><td className="table-td mono">{row.effectiveDate}</td><td className="table-td">{row.targetType === 'EMPLOYEE' ? `Employee #${row.targetId}` : 'Bank settings'}</td><td className="table-td">{Object.entries(row.patch || {}).map(([key, value]) => `${key}: ${value ?? 'cleared'}`).join(' · ')}</td><td className="table-td">{row.reason}</td><td className="table-td"><Badge variant={row.status === 'APPROVED' ? 'success' : 'default'}>{row.status}</Badge></td><td className="table-td">{row.status === 'PENDING' && user?.role === 'APPROVING_AUTHORITY' && <div className="row-actions"><Button size="sm" loading={decision.isPending} onClick={() => decision.mutate({ id: row.id, action: 'APPROVED' })}>Approve</Button><Button size="sm" variant="secondary" onClick={() => decision.mutate({ id: row.id, action: 'REJECTED' })}>Reject</Button></div>}</td></tr>)}</tbody></table></div> : <p>No financial proposals yet.</p>}</Card>
  </div>;
}
