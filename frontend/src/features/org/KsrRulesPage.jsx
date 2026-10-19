import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { masterDataApi, fmt } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const RULE_TYPES = ['INCREMENT', 'PROMOTION', 'HIGHER_GRADE', 'PAY_REVISION', 'LEAVE', 'PENSION', 'SETTLEMENT', 'GENERAL'];

export function KsrRulesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [ruleType, setRuleType] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ ruleType: 'INCREMENT', title: '', part: '', chapter: '', ruleNumber: '', conditions: '' });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['ksr-rules', { ruleType }],
    queryFn: () => masterDataApi.ksrRules({ ruleType, limit: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: (payload) => masterDataApi.createKsrRule(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ksr-rules'] });
      toast.add('KSR rule added.', 'success');
      setModalOpen(false);
      setForm({ ruleType: 'INCREMENT', title: '', part: '', chapter: '', ruleNumber: '', conditions: '' });
    },
    onError: (err) => setError(err.message || 'Could not add rule.'),
  });

  const columns = [
    { field: 'ruleNumber', label: 'Rule No.', mono: true },
    { field: 'title', label: 'Title' },
    { field: 'part', label: 'Part', mono: true },
    { field: 'chapter', label: 'Chapter', mono: true },
    { field: 'ruleType', label: 'Type', render: (r) => <Badge variant="info">{r.ruleType?.replace(/_/g, ' ')}</Badge> },
    { field: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'ACTIVE' ? 'success' : 'default'}>{r.status}</Badge> },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>KSR Rules</h1>
        <p>Kerala Service Rules referenced by increment and fixation policies</p>
      </header>

      <Card noPadding>
        <div className="table-toolbar">
          <select className="input table-search" value={ruleType} onChange={(e) => setRuleType(e.target.value)} aria-label="Filter by rule type">
            <option value="">All rule types</option>
            {RULE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
          <Button onClick={() => setModalOpen(true)}>Add Rule</Button>
        </div>
        <Table columns={columns} data={data?.rows || []} keyField="id" loading={isLoading} emptyMessage="No KSR rules recorded." />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add KSR Rule"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={createMutation.isPending} onClick={() => { setError(''); createMutation.mutate(form); }}>Add Rule</Button>
          </>
        }
      >
        <form noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="field">
            <label className="field-label" htmlFor="kr-type">Rule Type</label>
            <select id="kr-type" className="input" value={form.ruleType} onChange={(e) => setForm({ ...form, ruleType: e.target.value })}>
              {RULE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <Input id="kr-title" label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <div className="form-grid">
            <Input id="kr-part" label="Part" value={form.part} onChange={(e) => setForm({ ...form, part: e.target.value })} mono />
            <Input id="kr-chap" label="Chapter" value={form.chapter} onChange={(e) => setForm({ ...form, chapter: e.target.value })} mono />
            <Input id="kr-num" label="Rule Number" value={form.ruleNumber} onChange={(e) => setForm({ ...form, ruleNumber: e.target.value })} mono />
          </div>
          <Input id="kr-cond" label="Conditions" value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} />
        </form>
      </Modal>
    </div>
  );
}
