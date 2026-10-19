import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { masterDataApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Stepper } from '../../components/ui/Stepper';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

const STEPS = [
  { key: 'identity', label: 'Identity' },
  { key: 'service', label: 'Service' },
  { key: 'pay', label: 'Pay' },
  { key: 'bank', label: 'Bank' },
  { key: 'review', label: 'Review' },
];

const EMPTY = {
  empCode: '', name: '', dob: '', gender: 'MALE', category: 'GENERAL',
  panNumber: '', aadhaarNumber: '', personalEmail: '',
  doj: '', postCadreId: '', designation: '', department: '',
  currentPayScaleId: '', currentStageId: '', currentBasicPay: '',
  hraType: 'PERCENT', fixedHraAmount: '',
  riskAllowance: '', otherAllowance: '',
  bankName: '', bankAccountNumber: '', bankIfsc: '',
};

export function NewEmployeePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const { data: posts } = useQuery({ queryKey: ['post-cadres-lite'], queryFn: () => masterDataApi.postCadres() });
  const { data: scales } = useQuery({ queryKey: ['pay-scales-lite'], queryFn: () => masterDataApi.payScales() });

  const { data: stages } = useQuery({
    queryKey: ['pay-stages', form.currentPayScaleId],
    queryFn: () => masterDataApi.payScaleStages(form.currentPayScaleId),
    enabled: !!form.currentPayScaleId,
  });

  const createMutation = useMutation({
    mutationFn: (payload) => masterDataApi.createEmployee({ ...payload, organizationId: user?.organizationId }),
    onSuccess: () => {
      toast.add('Employee created.', 'success');
      navigate('/employees');
    },
    onError: (err) => setError(err.message || 'Could not create employee.'),
  });

  const canAdvance = () => {
    if (step === 0) return form.name && form.empCode && form.dob && form.gender;
    if (step === 1) return form.doj;
    if (step === 2) return form.currentPayScaleId && form.currentStageId && form.currentBasicPay;
    if (step === 3) return form.bankName && form.bankAccountNumber && form.bankIfsc;
    return true;
  };

  const next = () => canAdvance() && setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const scaleName = (id) => (scales?.rows || []).find((s) => String(s.id) === String(id))?.name || '—';
  const postName = (id) => (posts?.rows || []).find((p) => String(p.id) === String(id))?.name || '—';

  return (
    <div className="page">
      <header className="page-header">
        <h1>Add Employee</h1>
        <p>Create a new employee record and service book</p>
      </header>

      <Stepper steps={STEPS} current={step} onStepClick={setStep} />

      <Card>
        {error && <div className="auth-error" role="alert">{error}</div>}

        {step === 0 && (
          <>
            <div className="form-grid">
              <Input id="name" label="Full Name" value={form.name} onChange={(e) => set({ name: e.target.value })} required />
              <Input id="empCode" label="Employee Code" value={form.empCode} onChange={(e) => set({ empCode: e.target.value })} mono required />
              <Input id="dob" label="Date of Birth" type="date" value={form.dob} onChange={(e) => set({ dob: e.target.value })} required />
              <div className="field">
                <label className="field-label" htmlFor="gender">Gender</label>
                <select id="gender" className="input" value={form.gender} onChange={(e) => set({ gender: e.target.value })}>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="category">Category</label>
                <select id="category" className="input" value={form.category} onChange={(e) => set({ category: e.target.value })}>
                  <option value="GENERAL">General</option>
                  <option value="SC">SC</option>
                  <option value="ST">ST</option>
                  <option value="OBC">OBC</option>
                </select>
              </div>
            </div>
            <h3 className="form-section-title">Identity &amp; Contact</h3>
            <div className="form-grid">
              <Input id="pan" label="PAN" value={form.panNumber} onChange={(e) => set({ panNumber: e.target.value.toUpperCase() })} mono required />
              <Input id="aadhaar" label="Aadhaar" value={form.aadhaarNumber} onChange={(e) => set({ aadhaarNumber: e.target.value })} mono required />
              <Input id="pemail" label="Personal Email" type="email" value={form.personalEmail} onChange={(e) => set({ personalEmail: e.target.value })} required />
            </div>
            <p className="form-note">These fields are mandatory for this organisation and can be relaxed in Settings → Mandatory Fields.</p>
          </>
        )}

        {step === 1 && (
          <div className="form-grid">
            <Input id="doj" label="Date of Joining" type="date" value={form.doj} onChange={(e) => set({ doj: e.target.value })} required />
            <div className="field">
              <label className="field-label" htmlFor="post">Post &amp; Cadre</label>
              <select id="post" className="input" value={form.postCadreId} onChange={(e) => set({ postCadreId: e.target.value })}>
                <option value="">Select a post…</option>
                {(posts?.rows || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <Input id="desig" label="Designation" value={form.designation} onChange={(e) => set({ designation: e.target.value })} required />
            <Input id="dept" label="Department" value={form.department} onChange={(e) => set({ department: e.target.value })} />
          </div>
        )}

        {step === 2 && (
          <>
            <div className="form-grid">
              <div className="field">
                <label className="field-label" htmlFor="scale">Grade / Pay Scale</label>
                <select id="scale" className="input" value={form.currentPayScaleId} onChange={(e) => set({ currentPayScaleId: e.target.value, currentStageId: '' })} required>
                  <option value="">Select a pay scale…</option>
                  {(scales?.rows || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="stage">Stage</label>
                <select id="stage" className="input" value={form.currentStageId} onChange={(e) => {
                  const st = (stages?.rows || []).find((s) => String(s.id) === String(e.target.value));
                  set({ currentStageId: e.target.value, currentBasicPay: st ? st.amount : form.currentBasicPay });
                }} required disabled={!form.currentPayScaleId}>
                  <option value="">{form.currentPayScaleId ? 'Select a stage…' : 'Choose a scale first'}</option>
                  {(stages?.rows || []).map((s) => <option key={s.id} value={s.id}>Stage {s.stageNo} — ₹{Number(s.amount).toLocaleString('en-IN')}</option>)}
                </select>
              </div>
              <Input id="basic" label="Current Basic Pay (₹)" type="number" value={form.currentBasicPay} onChange={(e) => set({ currentBasicPay: e.target.value })} mono required />
              <div className="field">
                <label className="field-label" htmlFor="hraType">HRA Basis</label>
                <select id="hraType" className="input" value={form.hraType || 'PERCENT'} onChange={(e) => set({ hraType: e.target.value })}>
                  <option value="PERCENT">Calculated from Basic Pay (%)</option>
                  <option value="FIXED">Fixed Amount</option>
                </select>
              </div>
              {form.hraType === 'FIXED' && (
                <Input id="fixedHra" label="Fixed HRA Amount (₹)" type="number" step="0.01" value={form.fixedHraAmount} onChange={(e) => set({ fixedHraAmount: e.target.value })} mono required />
              )}
              <Input id="risk" label="Risk Allowance (₹)" type="number" step="0.01" value={form.riskAllowance} onChange={(e) => set({ riskAllowance: e.target.value })} mono hint="Optional risk allowance for this employee." />
            </div>
            <p className="form-note">HRA is subject to the organisation ceiling. Policies default from the organisation unless set per employee.</p>
          </>
        )}

        {step === 3 && (
          <div className="form-grid">
            <Input id="bankName" label="Bank Name" value={form.bankName} onChange={(e) => set({ bankName: e.target.value })} required />
            <Input id="bankAcc" label="Account Number" value={form.bankAccountNumber} onChange={(e) => set({ bankAccountNumber: e.target.value })} mono required />
            <Input id="ifsc" label="IFSC" value={form.bankIfsc} onChange={(e) => set({ bankIfsc: e.target.value.toUpperCase() })} mono required />
          </div>
        )}

        {step === 4 && (
          <div className="review-list">
            <ReviewRow label="Name" value={form.name} />
            <ReviewRow label="Code" value={form.empCode} />
            <ReviewRow label="Date of Birth" value={form.dob} />
            <ReviewRow label="Gender / Category" value={`${form.gender} / ${form.category}`} />
            <ReviewRow label="PAN / Aadhaar" value={`${form.panNumber} / ${form.aadhaarNumber}`} />
            <ReviewRow label="Personal Email" value={form.personalEmail} />
            <ReviewRow label="Date of Joining" value={form.doj} />
            <ReviewRow label="Post" value={postName(form.postCadreId)} />
            <ReviewRow label="Designation" value={form.designation} />
            <ReviewRow label="Department" value={form.department} />
            <ReviewRow label="Pay Scale" value={scaleName(form.currentPayScaleId)} />
            <ReviewRow label="Basic Pay" value={form.currentBasicPay} />
            <ReviewRow label="HRA Basis" value={form.hraType === 'FIXED' ? `Fixed Amount (₹${Number(form.fixedHraAmount || 0).toLocaleString('en-IN')})` : 'Calculated from Basic Pay (%)'} />
            {Number(form.riskAllowance) > 0 && <ReviewRow label="Risk Allowance" value={`₹${Number(form.riskAllowance).toLocaleString('en-IN')}`} />}
            <ReviewRow label="Bank" value={`${form.bankName} · ${form.bankAccountNumber} · ${form.bankIfsc}`} />
          </div>
        )}

        <div className="card-actions stepper-actions">
          <Button variant="secondary" onClick={() => navigate('/employees')}>Cancel</Button>
          {step > 0 && <Button variant="secondary" onClick={back}>Back</Button>}
          {step < STEPS.length - 1 ? (
            <Button onClick={next} disabled={!canAdvance()}>Next</Button>
          ) : (
            <Button loading={createMutation.isPending} onClick={() => { setError(''); createMutation.mutate(form); }}>
              Create Employee
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div className="review-row">
      <span className="review-label">{label}</span>
      <span className="review-value">{value || '—'}</span>
    </div>
  );
}
