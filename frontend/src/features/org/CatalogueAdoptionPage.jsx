import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { compensationApi } from '../../api/compensation';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';

export function CatalogueAdoptionPage() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [catalogueId, setCatalogueId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [error, setError] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['catalogue-adoptions'], queryFn: compensationApi.adoptions });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['catalogue-adoptions'] });
  const proposal = useMutation({ mutationFn: compensationApi.proposeAdoption, onSuccess: () => { refresh(); setError(''); toast.add('Adoption sent for approval.', 'success'); }, onError: e => setError(e.message) });
  const decision = useMutation({ mutationFn: ({ id, action }) => compensationApi.decideAdoption(id, action), onSuccess: () => { refresh(); setError(''); toast.add('Adoption decision recorded.', 'success'); }, onError: e => setError(e.message) });
  const available = data?.available || [];
  const history = data?.history || [];
  const selected = available.find(row => String(row.id) === catalogueId);
  const current = history.find(row => row.status === 'APPROVED' && row.effectiveDate <= new Date().toISOString().slice(0, 10));
  const before = current?.BankRuleCatalogue;
  if (isLoading) return <div className="page"><p>Loading bank rules…</p></div>;
  return <div className="page">
    <header className="page-header"><h1>Bank Class Adoption</h1><p>Adopt a published government revision for this bank. Employees move to its stages only after their own salary assignment is approved.</p></header>
    {error && <div className="auth-error" role="alert">{error}</div>}
    <Card title="Current approved revision">
      {current ? <p><strong>{before?.name || `Revision #${current.catalogueId}`}</strong> · {before?.orderNumber || 'No order number'} · effective {current.effectiveDate}</p> : <p>No adopted revision yet. Payroll setup is pending.</p>}
    </Card>
    {user?.role === 'ORG_ADMIN' && <Card title="Prepare adoption">
      <div className="form-grid">
        <div className="field"><label className="field-label" htmlFor="adoption-revision">Published revision</label><select id="adoption-revision" className="input" value={catalogueId} onChange={e => setCatalogueId(e.target.value)}><option value="">Select revision</option>{available.map(row => <option key={row.id} value={row.id}>{row.name} · {row.orderNumber || 'No order'} · {row.effectiveDate}</option>)}</select></div>
        <Input id="adoption-date" label="Bank effective date" type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
      </div>
      {selected && <div className="form-note"><strong>Impact preview:</strong> {selected.posts?.length || 0} posts; {selected.posts?.map(p => `${p.name}: ${p.stages?.length || 0} stages (₹${p.stages?.[0]}–₹${p.stages?.at(-1)})`).join(' · ')}. {Object.keys(selected.payrollDefaults || {}).length} government payroll values.</div>}
      {before && selected && <p className="form-note">Current revision has {before.posts?.length || 0} posts and {Object.keys(before.payrollDefaults || {}).length} government payroll values. Existing employee assignments remain in force until separately moved.</p>}
      <div className="card-actions"><Button disabled={!selected || !effectiveDate} loading={proposal.isPending} onClick={() => proposal.mutate({ catalogueId: Number(catalogueId), effectiveDate })}>Send for approval</Button></div>
    </Card>}
    <Card title="Adoption history">
      {history.length ? <div className="table-wrap"><table className="table"><thead><tr><th className="table-th">Effective</th><th className="table-th">Revision</th><th className="table-th">Status</th><th className="table-th">Decision</th></tr></thead><tbody>{history.map(row => <tr key={row.id} className="table-row"><td className="table-td mono">{row.effectiveDate}</td><td className="table-td">{row.BankRuleCatalogue?.name || `#${row.catalogueId}`} · {row.BankRuleCatalogue?.orderNumber || 'No order'}</td><td className="table-td"><Badge variant={row.status === 'APPROVED' ? 'success' : 'default'}>{row.status}</Badge></td><td className="table-td">{row.status === 'PENDING' && user?.role === 'APPROVING_AUTHORITY' && <div className="row-actions"><Button size="sm" loading={decision.isPending} onClick={() => decision.mutate({ id: row.id, action: 'APPROVED' })}>Approve</Button><Button size="sm" variant="secondary" onClick={() => decision.mutate({ id: row.id, action: 'REJECTED' })}>Reject</Button></div>}</td></tr>)}</tbody></table></div> : <p>No proposals yet.</p>}
    </Card>
  </div>;
}
