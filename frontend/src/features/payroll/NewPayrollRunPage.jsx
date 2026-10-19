import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { payrollApi, fmt } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Stepper } from '../../components/ui/Stepper';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';

const STEPS = [
  { key: 'period', label: 'Period' },
  { key: 'preview', label: 'Preview' },
  { key: 'process', label: 'Process' },
  { key: 'review', label: 'Review' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function NewPayrollRunPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const now = new Date();
  const [step, setStep] = useState(0);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: (payload) => payrollApi.createRun(orgId, payload),
    onSuccess: (data) => {
      toast.add('Payroll run created.', 'success');
      navigate(`/payroll/${data.id || data.run?.id || ''}`);
    },
    onError: (err) => setError(err.message || 'Could not create payroll run.'),
  });

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="page">
      <header className="page-header">
        <h1>New Payroll Run</h1>
        <p>Process the monthly payroll for {MONTHS[month - 1]} {year}</p>
      </header>

      <Stepper steps={STEPS} current={step} onStepClick={setStep} />

      <Card>
        {error && <div className="auth-error" role="alert">{error}</div>}

        {step === 0 && (
          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="month">Month</label>
              <select id="month" className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="year">Year</label>
              <select id="year" className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="counterfoil">
            <div className="counterfoil-header">
              <span className="counterfoil-serial mono">Payroll Preview</span>
              <span className="counterfoil-date mono">{MONTHS[month - 1]} {year}</span>
            </div>
            <p className="form-note">The engine will compute each active employee's pay for this period. Numbers are finalised when you process.</p>
            <div className="stat-grid">
              <div className="stat-ledger"><div className="stat-ledger-label">Employees Affected</div><div className="stat-ledger-value mono">—</div></div>
              <div className="stat-ledger"><div className="stat-ledger-label">Estimated Gross</div><div className="stat-ledger-value mono">{fmt.money(0)}</div></div>
              <div className="stat-ledger"><div className="stat-ledger-label">Estimated Net</div><div className="stat-ledger-value mono">{fmt.money(0)}</div></div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="process-panel">
            <p>Ready to process payroll for <strong>{MONTHS[month - 1]} {year}</strong>.</p>
            <Button loading={createMutation.isPending} onClick={() => { setError(''); createMutation.mutate({ month, year }); }}>
              Process Payroll
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="review-list">
            <div className="review-row"><span className="review-label">Period</span><span className="review-value">{MONTHS[month - 1]} {year}</span></div>
            <div className="review-row"><span className="review-label">Status</span><span className="review-value"><Badge variant="warning">Awaiting Processing</Badge></span></div>
          </div>
        )}

        <div className="card-actions stepper-actions">
          <Button variant="secondary" onClick={() => navigate('/payroll')}>Cancel</Button>
          {step > 0 && <Button variant="secondary" onClick={back}>Back</Button>}
          {step < STEPS.length - 1 && <Button onClick={next}>Next</Button>}
        </div>
      </Card>
    </div>
  );
}
