import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { platformApi } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Stepper } from '../../components/ui/Stepper';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

const STEPS = [
  { key: 'identity', label: 'Identity' },
  { key: 'contact', label: 'Contact' },
  { key: 'domain', label: 'Domain' },
  { key: 'licence', label: 'Licence' },
  { key: 'admin', label: 'Org Admin' },
  { key: 'review', label: 'Review' },
];

const BANK_CLASSES = ['SPECIAL_GRADE', 'CLASS_I', 'CLASS_II', 'CLASS_III', 'CLASS_IV', 'CLASS_V'];
const PLANS = ['TRIAL', 'STANDARD', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM'];
const PLAN_PRESETS = {
  TRIAL: { months: 1, maxUsers: 5, maxEmployees: 50 },
  STANDARD: { months: 12, maxUsers: 25, maxEmployees: 500 },
  PROFESSIONAL: { months: 12, maxUsers: 100, maxEmployees: 2000 },
  ENTERPRISE: { months: 12, maxUsers: '', maxEmployees: '' },
  CUSTOM: { months: 12, maxUsers: '', maxEmployees: '' },
};

function addMonths(dateStr, months) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function NewOrganisationPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '', code: '', bankClass: '', regulator: '',
    address: '', contactEmail: '', contactPhone: '', website: '',
    customDomain: '',
    licensePlan: 'STANDARD', licenseStartsAt: new Date().toISOString().slice(0, 10),
    licenseExpiresAt: '', maxUsers: 25, maxEmployees: 500,
    adminName: '', adminEmail: '',
  });
  const [error, setError] = useState('');
  const cnameTarget = window.location.hostname;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const onboard = useMutation({
    mutationFn: async () => {
      const org = await platformApi.createOrganization(form);
      if (form.adminEmail && org?.id) {
        try {
          await platformApi.createOrgAdmin(org.id, { name: form.adminName, email: form.adminEmail });
        } catch (e) {
          return { org, adminError: e.message };
        }
      }
      return { org };
    },
    onSuccess: (res) => {
      if (res.adminError) toast.add(`Bank onboarded, but the Org Admin could not be created: ${res.adminError}`, 'error');
      else toast.add('Organisation onboarded.', 'success');
      navigate('/organisations');
    },
    onError: (err) => setError(err.message || 'Onboarding failed.'),
  });

  const applyPlan = (plan) => {
    const p = PLAN_PRESETS[plan];
    set({ licensePlan: plan, maxUsers: p.maxUsers, maxEmployees: p.maxEmployees, licenseExpiresAt: addMonths(form.licenseStartsAt, p.months) });
  };

  const canAdvance = () => {
    if (step === 0) return form.name && form.code && form.bankClass;
    return true;
  };

  const next = () => canAdvance() && setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="page">
      <header className="page-header">
        <h1>Onboard a Bank</h1>
        <p>Create an organisation, its licence, and its first Organisation Admin</p>
      </header>

      <Stepper steps={STEPS} current={step} onStepClick={setStep} />

      <Card>
        {error && <div className="auth-error" role="alert">{error}</div>}

        {step === 0 && (
          <div className="form-grid">
            <Input id="name" label="Bank Name" value={form.name} onChange={(e) => set({ name: e.target.value })} required />
            <Input id="code" label="Code" value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="e.g. UCB001" mono required />
            <div className="field">
              <label className="field-label" htmlFor="bankClass">Bank Class</label>
              <select id="bankClass" className="input" value={form.bankClass} onChange={(e) => set({ bankClass: e.target.value })} required>
                <option value="">Select a class…</option>
                {BANK_CLASSES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <Input id="short" label="Short Name" value={form.shortName || ''} onChange={(e) => set({ shortName: e.target.value })} />
            <Input id="reg" label="Regulator" value={form.regulator} onChange={(e) => set({ regulator: e.target.value })} placeholder="RBI / Registrar of Co-op Societies" />
          </div>
        )}

        {step === 1 && (
          <div className="form-grid">
            <Input id="addr" label="Address" value={form.address} onChange={(e) => set({ address: e.target.value })} />
            <Input id="cemail" label="Contact Email" type="email" value={form.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />
            <Input id="cphone" label="Contact Phone" value={form.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} />
            <Input id="web" label="Website" value={form.website} onChange={(e) => set({ website: e.target.value })} />
          </div>
        )}

        {step === 2 && (
          <>
            <p className="form-note">
              Optional. Give the bank its own web address — a subdomain they control. They point a DNS
              CNAME from it at this application, and their console is then served on that address
              instead of the shared <span className="mono">/o/{form.code || 'CODE'}</span> link.
            </p>
            <div className="form-grid">
              <Input id="domain" label="Custom Domain" value={form.customDomain || ''} onChange={(e) => set({ customDomain: e.target.value })} placeholder="hrms.yourbank.in" mono />
            </div>
            {form.customDomain && (
              <div className="domain-record">
                <div className="domain-record-title">DNS record for the client to create</div>
                <dl className="domain-record-grid">
                  <div><dt>Type</dt><dd className="mono">CNAME</dd></div>
                  <div><dt>Name</dt><dd className="mono">{form.customDomain}</dd></div>
                  <div><dt>Value</dt><dd className="mono">{cnameTarget}</dd></div>
                </dl>
                <p className="domain-record-note">
                  DNS can take up to 24 hours to propagate. You can confirm the connection from the
                  bank's page once it's onboarded.
                </p>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <div className="field">
              <label className="field-label" htmlFor="plan">Licence Plan</label>
              <select id="plan" className="input" value={form.licensePlan} onChange={(e) => applyPlan(e.target.value)}>
                {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-grid">
              <Input id="vf" label="Valid From" type="date" value={form.licenseStartsAt} onChange={(e) => set({ licenseStartsAt: e.target.value })} />
              <Input id="vu" label="Valid Until" type="date" value={form.licenseExpiresAt} onChange={(e) => set({ licenseExpiresAt: e.target.value })} />
              <Input id="mu" label="Max Active Users" type="number" value={form.maxUsers} onChange={(e) => set({ maxUsers: e.target.value })} mono />
              <Input id="me" label="Max Active Employees" type="number" value={form.maxEmployees} onChange={(e) => set({ maxEmployees: e.target.value })} mono />
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <p className="form-note">Optionally create the bank's first Organisation Admin now. A temporary password is generated and can be shared securely.</p>
            <div className="form-grid">
              <Input id="an" label="Admin Name" value={form.adminName} onChange={(e) => set({ adminName: e.target.value })} />
              <Input id="ae" label="Admin Email" type="email" value={form.adminEmail} onChange={(e) => set({ adminEmail: e.target.value })} />
            </div>
          </>
        )}

        {step === 5 && (
          <div className="review-list">
            <ReviewRow label="Bank Name" value={form.name} />
            <ReviewRow label="Code" value={form.code} />
            <ReviewRow label="Bank Class" value={form.bankClass?.replace(/_/g, ' ')} />
            <ReviewRow label="Regulator" value={form.regulator} />
            <ReviewRow label="Contact" value={[form.contactEmail, form.contactPhone].filter(Boolean).join(' · ')} />
            <ReviewRow label="Custom Domain" value={form.customDomain} />
            <ReviewRow label="Plan" value={form.licensePlan} />
            <ReviewRow label="Valid From / Until" value={`${form.licenseStartsAt} → ${form.licenseExpiresAt}`} />
            <ReviewRow label="Max Users / Employees" value={`${form.maxUsers || '∞'} / ${form.maxEmployees || '∞'}`} />
            <ReviewRow label="Org Admin" value={form.adminEmail} />
          </div>
        )}

        <div className="card-actions stepper-actions">
          <Button variant="secondary" onClick={() => navigate('/organisations')}>Cancel</Button>
          {step > 0 && <Button variant="secondary" onClick={back}>Back</Button>}
          {step < STEPS.length - 1 ? (
            <Button onClick={next} disabled={!canAdvance()}>Next</Button>
          ) : (
            <Button loading={onboard.isPending} onClick={() => { setError(''); onboard.mutate(); }}>
              Onboard Bank
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
