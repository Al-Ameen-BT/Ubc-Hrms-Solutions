import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orgApi } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_OPTIONS = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));

function Select({ id, label, value, onChange, options, hint, emptyLabel = 'Select…' }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{emptyLabel}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

/* Organisation-wide payroll rates and limits (routes/orgSettings.js
   GET/PUT /org/settings/payroll, backed by models/orgPayrollSetting.js).
   These feed services/payslip.js — a rate revision here is a settings
   change, not a code change. */
export function PayrollSettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ['org-payroll-settings'], queryFn: orgApi.payrollSettings });

  useEffect(() => { if (data) setForm({ ...data }); }, [data]);

  const save = useMutation({
    mutationFn: (payload) => orgApi.updatePayrollSettings(payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['org-payroll-settings'] }); toast.add('Payroll settings saved.', 'success'); },
    onError: (err) => toast.add(err.message || 'Save failed.', 'error'),
  });

  if (isLoading || !form) return <div className="page"><p>Loading…</p></div>;

  const f = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Payroll Settings</h1>
            <p>Rates and limits used when computing every payslip for this organisation.</p>
          </div>
          <div className="page-header-actions">
            <Button loading={save.isPending} onClick={() => save.mutate(form)}>Save Settings</Button>
          </div>
        </div>
      </header>

      <Card title="Allowances &amp; Statutory Rates">
        <div className="form-grid">
          <Input id="ps-da" label="Dearness Allowance %" type="number" step="0.001" value={form.daPercent ?? ''} onChange={f('daPercent')} mono />
          <Select
            id="ps-hratype"
            label="HRA Calculation Basis"
            value={form.hraType || 'PERCENT'}
            onChange={(v) => setForm((s) => ({ ...s, hraType: v }))}
            options={[
              { value: 'PERCENT', label: 'Percentage of Basic Pay' },
              { value: 'FIXED', label: 'Fixed Amount' },
            ]}
          />
          {form.hraType === 'FIXED' ? (
            <Input id="ps-hrafixed" label="Fixed HRA Amount (₹)" type="number" step="0.01" value={form.hraFixedAmount ?? ''} onChange={f('hraFixedAmount')} mono />
          ) : (
            <Input id="ps-hra" label="House Rent Allowance %" type="number" step="0.001" value={form.hraPercent ?? ''} onChange={f('hraPercent')} mono />
          )}
          <Input id="ps-hramax" label="HRA Ceiling / Max Limit (₹)" type="number" step="0.01" value={form.hraMaxAmount ?? ''} onChange={f('hraMaxAmount')} mono hint="Optional maximum cap applied to HRA (0 or blank for no cap)." />
          <Input id="ps-cca" label="City Compensatory Allowance" type="number" step="0.01" value={form.ccaAmount ?? ''} onChange={f('ccaAmount')} mono hint="0 disables it." />
          <Input id="ps-conv" label="Conveyance Allowance" type="number" step="0.01" value={form.conveyanceAmount ?? ''} onChange={f('conveyanceAmount')} mono hint="0 disables it." />
          <Input id="ps-retire" label="Retirement Age (years)" type="number" value={form.retirementAge ?? ''} onChange={f('retirementAge')} mono hint="45–75. Used to derive each employee's retirement date." />
        </div>
      </Card>

      <Card title="Provident Fund">
        <div className="form-grid">
          <Input id="ps-pfe" label="PF Employee %" type="number" step="0.001" value={form.pfEmployeePercent ?? ''} onChange={f('pfEmployeePercent')} mono />
          <Input id="ps-pfr" label="PF Employer %" type="number" step="0.001" value={form.pfEmployerPercent ?? ''} onChange={f('pfEmployerPercent')} mono />
          <Select id="ps-pfb" label="PF Calculation Base" value={form.pfCalculationBase} onChange={(v) => setForm((s) => ({ ...s, pfCalculationBase: v }))}
            options={[{ value: 'BASIC', label: 'Basic only' }, { value: 'BASIC_PLUS_DA', label: 'Basic + DA' }]} />
        </div>
      </Card>

      <Card title="Group Savings Linked Insurance &amp; Professional Tax">
        <div className="form-grid">
          <Input id="ps-gsli" label="GSLI Amount" type="number" step="0.01" value={form.gsliAmount ?? ''} onChange={f('gsliAmount')} mono />
          <Input id="ps-gslicut" label="GSLI Eligibility Cutoff" type="date" value={(form.gsliCutoffDate || '').slice(0, 10)} onChange={f('gsliCutoffDate')} hint="Only employees who joined before this date are eligible." />
          <Select id="ps-ptsch" label="Professional Tax Schedule" value={form.ptSchedule} onChange={(v) => setForm((s) => ({ ...s, ptSchedule: v }))}
            options={[{ value: 'MONTHLY', label: 'Monthly' }, { value: 'HALF_YEARLY', label: 'Half-yearly' }]} />
          <Select id="ps-ptm1" label="PT Month 1" value={form.ptMonth1} onChange={(v) => setForm((s) => ({ ...s, ptMonth1: v }))} options={MONTH_OPTIONS} />
          <Select id="ps-ptm2" label="PT Month 2" value={form.ptMonth2} onChange={(v) => setForm((s) => ({ ...s, ptMonth2: v }))} options={MONTH_OPTIONS} />
        </div>
      </Card>

      <Card title="Employee Overdraft">
        <div className="form-grid">
          <Input id="ps-odmult" label="Eligibility Multiplier" type="number" step="0.01" value={form.odMultiplier ?? ''} onChange={f('odMultiplier')} mono hint="× (Basic + DA)." />
          <Input id="ps-odmax" label="Maximum Amount" type="number" step="0.01" value={form.odMaxAmount ?? ''} onChange={f('odMaxAmount')} mono />
          <Input id="ps-odmonths" label="Maximum Repayment Months" type="number" value={form.odMaxRepayMonths ?? ''} onChange={f('odMaxRepayMonths')} mono />
          <Input id="ps-odrate" label="Interest % p.a." type="number" step="0.001" value={form.odInterestRatePercent ?? ''} onChange={f('odInterestRatePercent')} mono hint="Applies to new overdrafts only." />
        </div>
      </Card>

      <Card title="Festival Advance, Medical Allowance &amp; Stagnation">
        <div className="form-grid">
          <Input id="ps-fa" label="Festival Advance Repayment Months" type="number" value={form.festivalAdvanceRepayMonths ?? ''} onChange={f('festivalAdvanceRepayMonths')} mono />
          <Input id="ps-medamt" label="Medical Allowance Amount" type="number" step="0.01" value={form.medicalAllowanceAmount ?? ''} onChange={f('medicalAllowanceAmount')} mono />
          <Select id="ps-medmonth" label="Medical Allowance Month" value={form.medicalAllowanceMonth} onChange={(v) => setForm((s) => ({ ...s, medicalAllowanceMonth: v }))} options={MONTH_OPTIONS} />
          <Input id="ps-stagy" label="Stagnation Years" type="number" value={form.stagnationYears ?? ''} onChange={f('stagnationYears')} mono hint="No-promotion years before an extra increment." />
          <Input id="ps-stags" label="Stagnation Extra Stages" type="number" value={form.stagnationExtraStages ?? ''} onChange={f('stagnationExtraStages')} mono />
        </div>
      </Card>

      <Card title="Bonus">
        <div className="form-grid">
          <Select id="ps-bmonth" label="Bonus Month" value={form.bonusMonth} onChange={(v) => setForm((s) => ({ ...s, bonusMonth: v }))} options={MONTH_OPTIONS} />
          <Select id="ps-bresult" label="Declared Result" value={form.bonusResult ?? ''} onChange={(v) => setForm((s) => ({ ...s, bonusResult: v }))}
            emptyLabel="Not declared" options={[{ value: 'PROFIT', label: 'Profit' }, { value: 'LOSS', label: 'Loss' }]}
            hint="Bonus is only paid once a result is declared." />
          <Input id="ps-bprof" label="Profit: % of Basic" type="number" step="0.001" value={form.bonusProfitPercent ?? ''} onChange={f('bonusProfitPercent')} mono />
          <Input id="ps-bprofmax" label="Profit: Maximum Bonus" type="number" step="0.01" value={form.bonusProfitMaxAmount ?? ''} onChange={f('bonusProfitMaxAmount')} mono />
          <Input id="ps-bloss" label="Loss: % of Basic" type="number" step="0.001" value={form.bonusLossPercent ?? ''} onChange={f('bonusLossPercent')} mono />
          <Input id="ps-blossmax" label="Loss: Maximum Bonus" type="number" step="0.01" value={form.bonusLossMaxAmount ?? ''} onChange={f('bonusLossMaxAmount')} mono />
        </div>
      </Card>

      <Card title="Vehicle Loan &amp; Year-End">
        <div className="form-grid">
          <Input id="ps-vlrate" label="Vehicle Loan Interest % p.a." type="number" step="0.001" value={form.vehicleLoanInterestRatePercent ?? ''} onChange={f('vehicleLoanInterestRatePercent')} mono hint="Applies to new loans only." />
          <Select id="ps-yeartype" label="Year Type" value={form.yearType} onChange={(v) => setForm((s) => ({ ...s, yearType: v }))}
            options={[{ value: 'CALENDAR', label: 'Calendar (Jan–Dec)' }, { value: 'FINANCIAL', label: 'Financial (Apr–Mar)' }]} />
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={!!form.vehicleLoanAllowMultiple} onChange={(e) => setForm((s) => ({ ...s, vehicleLoanAllowMultiple: e.target.checked }))} />
          <span>Allow employees to hold more than one Vehicle Loan at a time</span>
        </label>
      </Card>

      <div className="card-actions">
        <Button loading={save.isPending} onClick={() => save.mutate(form)}>Save Settings</Button>
      </div>
    </div>
  );
}
