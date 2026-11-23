import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orgApi } from '../../api/client';
import { compensationApi } from '../../api/compensation';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import { SettingsIcon, AlertTriangleIcon, CheckCircleIcon, RefreshCwIcon } from '../../components/ui/Icons';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_OPTIONS = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));

function Select({ id, label, value, onChange, options, hint, emptyLabel = 'Select…', disabled = false }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <select id={id} className="input" disabled={disabled} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{emptyLabel}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

const FIELD_LABELS = {
  daPercent: 'Dearness Allowance (DA %)',
  hraType: 'HRA Basis',
  hraPercent: 'HRA %',
  hraFixedAmount: 'Fixed HRA (₹)',
  hraMaxAmount: 'HRA Max Limit (₹)',
  ccaAmount: 'City Compensatory Allowance (₹)',
  conveyanceAmount: 'Conveyance Allowance (₹)',
  retirementAge: 'Retirement Age',
  pfEmployeePercent: 'PF Employee %',
  pfEmployerPercent: 'PF Employer %',
  pfCalculationBase: 'PF Calculation Base',
  gsliAmount: 'GSLI Amount (₹)',
  gsliCutoffDate: 'GSLI Cutoff Date',
  ptSchedule: 'PT Schedule',
  ptMonth1: 'PT Month 1',
  ptMonth2: 'PT Month 2',
  welfareFundRule: 'Welfare Fund Rule',
  welfareFundThreshold: 'Welfare Fund Threshold (Basic + DA ₹)',
  welfareFundAboveEmployee: 'Welfare Fund Above: Employee (₹)',
  welfareFundAboveEmployer: 'Welfare Fund Above: Employer (₹)',
  welfareFundBelowEmployee: 'Welfare Fund Below/At: Employee (₹)',
  welfareFundBelowEmployer: 'Welfare Fund Below/At: Employer (₹)',
  welfareFundBaseEmployee: 'Welfare Fund Flat Base: Employee (₹)',
  welfareFundBaseEmployer: 'Welfare Fund Flat Base: Employer (₹)',
  festivalAdvanceRepayMonths: 'Festival Advance Repay Months',
  medicalAllowanceAmount: 'Medical Allowance (₹)',
  medicalAllowanceMonth: 'Medical Allowance Month',
  stagnationYears: 'Stagnation Years',
  stagnationExtraStages: 'Stagnation Extra Stages',
  bonusMonth: 'Bonus Month',
  bonusResult: 'Bonus Result',
  yearType: 'Year Type',
  vehicleLoanAllowMultiple: 'Multiple Vehicle Loans Allowed',
};

export function PayrollSettingsPage() {
  const { canPermission } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [reason, setReason] = useState('');
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: '',
    itemName: '',
    details: {},
    warningMessage: '',
    confirmLabel: 'Confirm & Save',
    confirmVariant: 'primary',
    onConfirm: null,
  });

  const canView = canPermission('compensation.view', ['ORG_ADMIN']) || canPermission('settings.view', ['ORG_ADMIN']);
  const canEdit = canPermission('compensation.prepare', ['ORG_ADMIN']) || canPermission('settings.configure', ['ORG_ADMIN']);

  const {
    data,
    isLoading,
    error: loadError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['org-payroll-settings'],
    queryFn: orgApi.payrollSettings,
    enabled: canView,
    retry: 1,
  });

  const { data: adoptions } = useQuery({
    queryKey: ['catalogue-adoptions'],
    queryFn: compensationApi.adoptions,
    enabled: canView,
    retry: 1,
  });

  const adopted = adoptions?.history?.some((row) => row.status === 'APPROVED');

  useEffect(() => {
    if (data) setForm({ ...data });
  }, [data]);

  const save = useMutation({
    mutationFn: (payload) =>
      adopted
        ? compensationApi.proposeFinancialChange({ targetType: 'ORG_SETTINGS', patch: payload, effectiveDate, reason })
        : orgApi.updatePayrollSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-payroll-settings'] });
      queryClient.invalidateQueries({ queryKey: ['financial-changes'] });
      toast.add(adopted ? 'Payroll settings sent for approval.' : 'Payroll settings saved successfully.', 'success');
    },
    onError: (err) => toast.add(err.message || 'Save failed.', 'error'),
  });

  if (!canView) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>Payroll Settings</h1>
        </header>
        <Card title="Access Unavailable">
          <p className="text-muted">You do not have permission to view or manage organisation payroll settings.</p>
          <Link to="/" className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }}>
            Go to Dashboard
          </Link>
        </Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>Payroll Settings</h1>
        </header>
        <div className="auth-error" role="alert" style={{ marginBottom: '1rem' }}>
          <AlertTriangleIcon size={18} style={{ marginRight: '0.5rem', verticalAlign: '-3px' }} />
          <span>Failed to load payroll settings: {loadError.message}</span>
          <Button size="sm" variant="secondary" onClick={() => refetch()} style={{ marginLeft: '1rem' }}>
            <RefreshCwIcon size={14} style={{ marginRight: '0.35rem', verticalAlign: '-2px' }} />
            Retry loading
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading || !form) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>Payroll Settings</h1>
        </header>
        <Card>
          <p role="status" style={{ padding: '1rem 0' }}>Loading organisation payroll configuration…</p>
        </Card>
      </div>
    );
  }

  const f = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));
  const changed = () =>
    Object.fromEntries(
      Object.entries(form).filter(
        ([key, value]) => Object.hasOwn(data, key) && String(value ?? '') !== String(data[key] ?? '')
      )
    );

  const submitWithConfirmation = () => {
    const diff = changed();
    const diffKeys = Object.keys(diff);
    if (diffKeys.length === 0) {
      toast.add('No changes detected in payroll settings.', 'info');
      return;
    }

    const details = {};
    for (const key of diffKeys) {
      const label = FIELD_LABELS[key] || key;
      const oldVal = data?.[key] != null && data[key] !== '' ? String(data[key]) : 'None';
      const newVal = diff[key] != null && diff[key] !== '' ? String(diff[key]) : 'None';
      details[label] = `${oldVal} → ${newVal}`;
    }

    setConfirmModal({
      open: true,
      title: 'Confirm Payroll Variables Update',
      itemName: `${diffKeys.length} Setting(s) Modified`,
      details,
      warningMessage: adopted
        ? 'These changes will be submitted to the Approving Authority as a proposed financial modification.'
        : 'Updating these payroll variables will persist changes directly to the database and govern live payslip generation, statutory deduction calculations, and bank financial accounts.',
      confirmLabel: adopted ? 'Submit for Approval' : 'Confirm & Save to DB',
      confirmVariant: 'primary',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        save.mutate(adopted ? diff : form);
      },
    });
  };

  const handleSaveWelfareFund = () => {
    const welfareKeys = [
      'welfareFundRule',
      'welfareFundThreshold',
      'welfareFundAboveEmployee',
      'welfareFundAboveEmployer',
      'welfareFundBelowEmployee',
      'welfareFundBelowEmployer',
      'welfareFundBaseEmployee',
      'welfareFundBaseEmployer',
    ];
    const welfarePayload = Object.fromEntries(
      welfareKeys.map((k) => [k, form[k]])
    );
    const welfareChanged = Object.fromEntries(
      Object.entries(welfarePayload).filter(
        ([key, value]) => String(value ?? '') !== String(data?.[key] ?? '')
      )
    );

    const details = {
      'Rule Type': form.welfareFundRule === 'FLAT' ? 'Flat Standard Amount' : 'Salary Slabs (Basic + DA)',
      'Basic + DA Threshold': `₹${Number(form.welfareFundThreshold || 10000).toLocaleString()}`,
      'Above Threshold': `Employee: ₹${form.welfareFundAboveEmployee ?? 300} / Employer: ₹${form.welfareFundAboveEmployer ?? 250}`,
      'Below/At Threshold': `Employee: ₹${form.welfareFundBelowEmployee ?? 250} / Employer: ₹${form.welfareFundBelowEmployer ?? 200}`,
      'Flat Base Rate': `Employee: ₹${form.welfareFundBaseEmployee ?? 45} / Employer: ₹${form.welfareFundBaseEmployer ?? 45}`,
    };

    if (Object.keys(welfareChanged).length > 0) {
      details['Modified Fields'] = Object.keys(welfareChanged)
        .map((k) => `${FIELD_LABELS[k] || k}: ${data?.[k] ?? '—'} → ${welfareChanged[k]}`)
        .join(', ');
    }

    setConfirmModal({
      open: true,
      title: 'Confirm Statutory Welfare Fund Settings',
      itemName: 'Welfare Fund (Basic + DA Rules & Thresholds)',
      details,
      warningMessage: adopted
        ? 'Changes to statutory deductions will be submitted to the Approving Authority before taking effect on live payslips.'
        : 'Saving these statutory welfare fund values to the database ensures data integrity, compliance with Kerala co-operative norms, and accurate accounting ledger postings.',
      confirmLabel: adopted ? 'Submit for Approval' : 'Confirm & Save to DB',
      confirmVariant: 'primary',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        save.mutate(adopted ? welfarePayload : { ...form, ...welfarePayload });
      },
    });
  };

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Payroll Settings</h1>
            <p>
              Rates, deduction formulas, and limits used across this bank. Monetary amounts round to the nearest whole rupee; percentage rates retain precision.
            </p>
          </div>
          <div className="page-header-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {isFetching && <span className="text-muted" style={{ fontSize: '0.8125rem' }}>Refreshing…</span>}
            <Button
              loading={save.isPending}
              disabled={!canEdit || (adopted && (!effectiveDate || !reason.trim() || !Object.keys(changed()).length))}
              onClick={submitWithConfirmation}
            >
              {adopted ? 'Send for Approval' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </header>

      {!canEdit && (
        <div className="auth-notice" style={{ marginBottom: '1rem' }}>
          You have view-only access to payroll settings. Only an authorized administrator or payroll officer can update these rates.
        </div>
      )}

      {adopted && (
        <Card title="Financial Approval Details">
          <p className="form-note">
            This bank operates under published reference catalogue adoptions. Changes to payroll settings require an Approving Authority decision before taking effect.
          </p>
          <div className="form-grid">
            <Input
              id="payroll-effective-date"
              label="Effective Date"
              type="date"
              disabled={!canEdit}
              required
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
            <Input
              id="payroll-change-reason"
              label="Reason for Change"
              disabled={!canEdit}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Revised statutory DA order"
            />
          </div>
        </Card>
      )}

      <Card title="Allowances &amp; Statutory Rates">
        <div className="form-grid">
          <Input
            id="ps-da"
            label="Dearness Allowance %"
            type="number"
            step="0.001"
            disabled={!canEdit}
            value={form.daPercent ?? ''}
            onChange={f('daPercent')}
            mono
            hint="Active monthly rate for regular payroll. For retroactive Government Orders with arrears calculation, manage under DA Arrears."
          />
          <Select
            id="ps-hratype"
            label="HRA Calculation Basis"
            disabled={!canEdit}
            value={form.hraType || 'PERCENT'}
            onChange={(v) => setForm((s) => ({ ...s, hraType: v }))}
            options={[
              { value: 'PERCENT', label: 'Percentage of Basic Pay' },
              { value: 'FIXED', label: 'Fixed Amount' },
            ]}
          />
          {form.hraType === 'FIXED' ? (
            <Input id="ps-hrafixed" label="Fixed HRA Amount (₹)" type="number" step="1" disabled={!canEdit} value={form.hraFixedAmount ?? ''} onChange={f('hraFixedAmount')} mono />
          ) : (
            <Input id="ps-hra" label="House Rent Allowance %" type="number" step="0.001" disabled={!canEdit} value={form.hraPercent ?? ''} onChange={f('hraPercent')} mono />
          )}
          <Input id="ps-hramax" label="HRA Ceiling / Max Limit (₹)" type="number" step="1" disabled={!canEdit} value={form.hraMaxAmount ?? ''} onChange={f('hraMaxAmount')} mono hint="Optional maximum cap applied to HRA (0 or blank for no cap)." />
          <Input id="ps-cca" label="City Compensatory Allowance (₹)" type="number" step="1" disabled={!canEdit} value={form.ccaAmount ?? ''} onChange={f('ccaAmount')} mono hint="0 disables it." />
          <Input id="ps-conv" label="Conveyance Allowance (₹)" type="number" step="1" disabled={!canEdit} value={form.conveyanceAmount ?? ''} onChange={f('conveyanceAmount')} mono hint="0 disables it." />
          <Input id="ps-retire" label="Retirement Age (years)" type="number" disabled={!canEdit} value={form.retirementAge ?? ''} onChange={f('retirementAge')} mono hint="45–75. Used to derive each employee's retirement date." />
        </div>
      </Card>

      <Card title="Provident Fund">
        <div className="form-grid">
          <Input id="ps-pfe" label="PF Employee %" type="number" step="0.001" disabled={!canEdit} value={form.pfEmployeePercent ?? ''} onChange={f('pfEmployeePercent')} mono />
          <Input id="ps-pfr" label="PF Employer %" type="number" step="0.001" disabled={!canEdit} value={form.pfEmployerPercent ?? ''} onChange={f('pfEmployerPercent')} mono />
          <Select
            id="ps-pfb"
            label="PF Calculation Base"
            disabled={!canEdit}
            value={form.pfCalculationBase}
            onChange={(v) => setForm((s) => ({ ...s, pfCalculationBase: v }))}
            options={[
              { value: 'BASIC', label: 'Basic only' },
              { value: 'BASIC_PLUS_DA', label: 'Basic + DA' },
            ]}
          />
        </div>
      </Card>

      <Card title="Group Savings Linked Insurance &amp; Professional Tax">
        <div className="form-grid">
          <Input id="ps-gsli" label="GSLI Default Amount (₹)" type="number" step="1" disabled={!canEdit} value={form.gsliAmount ?? ''} onChange={f('gsliAmount')} mono />
          <Input id="ps-gslicut" label="GSLI Eligibility Cutoff" type="date" disabled={!canEdit} value={(form.gsliCutoffDate || '').slice(0, 10)} onChange={f('gsliCutoffDate')} hint="Only employees who joined before this date are eligible." />
          <Select
            id="ps-ptsch"
            label="Professional Tax Schedule"
            disabled={!canEdit}
            value={form.ptSchedule}
            onChange={(v) => setForm((s) => ({ ...s, ptSchedule: v }))}
            options={[
              { value: 'MONTHLY', label: 'Monthly' },
              { value: 'HALF_YEARLY', label: 'Half-yearly' },
            ]}
          />
          <Select id="ps-ptm1" label="PT Month 1" disabled={!canEdit} value={form.ptMonth1} onChange={(v) => setForm((s) => ({ ...s, ptMonth1: v }))} options={MONTH_OPTIONS} />
          <Select id="ps-ptm2" label="PT Month 2" disabled={!canEdit} value={form.ptMonth2} onChange={(v) => setForm((s) => ({ ...s, ptMonth2: v }))} options={MONTH_OPTIONS} />
        </div>
      </Card>

      <Card
        title="Welfare Fund (Statutory Deductions)"
        headerAction={
          <Button
            size="sm"
            disabled={!canEdit}
            loading={save.isPending}
            onClick={handleSaveWelfareFund}
          >
            Save Welfare Fund Settings
          </Button>
        }
      >
        <p className="form-note">
          Kerala statutory co-operative welfare fund rules. Standard deduction is ₹45 each for employee and employer. Slab rules apply based on Basic + DA (threshold ₹10,000).
        </p>
        <div className="form-grid">
          <Select
            id="ps-wfrule"
            label="Welfare Fund Rule"
            disabled={!canEdit}
            value={form.welfareFundRule || 'SLAB'}
            onChange={(v) => setForm((s) => ({ ...s, welfareFundRule: v }))}
            options={[
              { value: 'SLAB', label: 'Salary Slabs (Basic + DA)' },
              { value: 'FLAT', label: 'Flat Standard Amount' },
            ]}
          />
          <Input id="ps-wfthreshold" label="Slab Threshold (Basic + DA ₹)" type="number" step="1" disabled={!canEdit} value={form.welfareFundThreshold ?? 10000} onChange={f('welfareFundThreshold')} mono />
          <Input id="ps-wfabove-emp" label="Above Threshold: Employee (₹)" type="number" step="1" disabled={!canEdit} value={form.welfareFundAboveEmployee ?? 300} onChange={f('welfareFundAboveEmployee')} mono />
          <Input id="ps-wfabove-empr" label="Above Threshold: Employer (₹)" type="number" step="1" disabled={!canEdit} value={form.welfareFundAboveEmployer ?? 250} onChange={f('welfareFundAboveEmployer')} mono />
          <Input id="ps-wfbelow-emp" label="Below/At Threshold: Employee (₹)" type="number" step="1" disabled={!canEdit} value={form.welfareFundBelowEmployee ?? 250} onChange={f('welfareFundBelowEmployee')} mono />
          <Input id="ps-wfbelow-empr" label="Below/At Threshold: Employer (₹)" type="number" step="1" disabled={!canEdit} value={form.welfareFundBelowEmployer ?? 200} onChange={f('welfareFundBelowEmployer')} mono />
          <Input id="ps-wfbase-emp" label="Flat Base: Employee (₹)" type="number" step="1" disabled={!canEdit} value={form.welfareFundBaseEmployee ?? 45} onChange={f('welfareFundBaseEmployee')} mono />
          <Input id="ps-wfbase-empr" label="Flat Base: Employer (₹)" type="number" step="1" disabled={!canEdit} value={form.welfareFundBaseEmployer ?? 45} onChange={f('welfareFundBaseEmployer')} mono />
        </div>
      </Card>

      <Card title="Employee Overdraft &amp; Slabs">
        <p className="form-note">
          Employee Overdraft limits and repayment terms are governed by bank-configured salary slabs and tiers.
          {' '}<Link to="/deductions" style={{ fontWeight: 600 }}>Manage Overdraft Slabs &amp; Deduction Categories &rarr;</Link>
        </p>
      </Card>

      <Card title="Festival Advance — Recoverable Advance">
        <p className="form-note">
          Set the standard repayment window in months. Advances are recorded per employee under their Loans &amp; Advances tab; recoveries appear automatically as payroll deductions.
        </p>
        <div className="form-grid">
          <Input id="ps-fa" label="Festival Advance Repayment Months" type="number" disabled={!canEdit} value={form.festivalAdvanceRepayMonths ?? ''} onChange={f('festivalAdvanceRepayMonths')} mono />
        </div>
      </Card>

      <Card title="Medical Allowance — Annual Earning">
        <p className="form-note">
          Paid once per year in the selected month and included in gross salary. This is an allowance, not a recoverable advance.
        </p>
        <div className="form-grid">
          <Input id="ps-medamt" label="Medical Allowance Amount (₹)" type="number" step="1" disabled={!canEdit} value={form.medicalAllowanceAmount ?? ''} onChange={f('medicalAllowanceAmount')} mono />
          <Select id="ps-medmonth" label="Medical Allowance Month" disabled={!canEdit} value={form.medicalAllowanceMonth} onChange={(v) => setForm((s) => ({ ...s, medicalAllowanceMonth: v }))} options={MONTH_OPTIONS} />
        </div>
      </Card>

      <Card title="Stagnation — Pay Progression">
        <p className="form-note">
          Defines service duration and maximum extra increments after reaching the top of a pay scale without promotion. Apply an authorised higher-grade event through the Service Book.
        </p>
        <div className="form-grid">
          <Input id="ps-stagy" label="Stagnation Years" type="number" disabled={!canEdit} value={form.stagnationYears ?? ''} onChange={f('stagnationYears')} mono hint="Years without promotion before an extra increment." />
          <Input id="ps-stags" label="Stagnation Extra Stages" type="number" disabled={!canEdit} value={form.stagnationExtraStages ?? ''} onChange={f('stagnationExtraStages')} mono />
        </div>
      </Card>

      <Card title="Bonus">
        <div className="form-grid">
          <Select id="ps-bmonth" label="Bonus Month" disabled={!canEdit} value={form.bonusMonth} onChange={(v) => setForm((s) => ({ ...s, bonusMonth: v }))} options={MONTH_OPTIONS} />
          <Select
            id="ps-bresult"
            label="Declared Result"
            disabled={!canEdit}
            value={form.bonusResult ?? ''}
            onChange={(v) => setForm((s) => ({ ...s, bonusResult: v }))}
            emptyLabel="Not declared"
            options={[
              { value: 'PROFIT', label: 'Profit' },
              { value: 'LOSS', label: 'Loss' },
            ]}
            hint="Bonus is only paid once a statutory profit/loss result is declared."
          />
        </div>
      </Card>

      <Card title="Vehicle Loan &amp; Year-End">
        <div className="form-grid">
          <Select
            id="ps-yeartype"
            label="Year Type"
            disabled={!canEdit}
            value={form.yearType}
            onChange={(v) => setForm((s) => ({ ...s, yearType: v }))}
            options={[
              { value: 'CALENDAR', label: 'Calendar (Jan–Dec)' },
              { value: 'FINANCIAL', label: 'Financial (Apr–Mar)' },
            ]}
          />
        </div>
        <label className="checkbox-row" style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={!!form.vehicleLoanAllowMultiple}
            onChange={(e) => setForm((s) => ({ ...s, vehicleLoanAllowMultiple: e.target.checked }))}
          />
          <span>Allow employees to hold more than one Vehicle Loan concurrently</span>
        </label>
      </Card>

      <div className="card-actions" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          loading={save.isPending}
          disabled={!canEdit || (adopted && (!effectiveDate || !reason.trim() || !Object.keys(changed()).length))}
          onClick={submitWithConfirmation}
        >
          {adopted ? 'Send for Approval' : 'Save Settings'}
        </Button>
      </div>

      <ConfirmationModal
        open={confirmModal.open}
        onClose={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        itemName={confirmModal.itemName}
        details={confirmModal.details}
        warningMessage={confirmModal.warningMessage}
        confirmLabel={confirmModal.confirmLabel}
        confirmVariant={confirmModal.confirmVariant}
        loading={save.isPending}
      />
    </div>
  );
}
