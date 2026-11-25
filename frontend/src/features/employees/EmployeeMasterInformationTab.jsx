import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { masterDataApi } from '../../api/client';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';

const OFFICE_FIELDS = [
  ['pensionNumber', 'Pension No'], ['ptNumber', 'PT No'], ['esicNumber', 'ESIC No'], ['lwfNumber', 'LWF No'],
  ['edliNumber', 'EDLI No'], ['vcNumber', 'VC No'], ['ppNumber', 'PP No'], ['dlNumber', 'DL No'],
  ['rcNumber', 'RC No'], ['giNumber', 'GI No'],
  ['pfApplicationNumber', 'PF Application No'], ['ptApplicationNumber', 'PT Application No'],
  ['esicApplicationNumber', 'ESIC Application No'], ['lwfApplicationNumber', 'LWF Application No'],
  ['vpfApplicationNumber', 'VPF Application No'], ['handicapRemark', 'Handicap Remark'],
  ['vpfDeclaredAmount', 'VPF Amount', 'number'], ['vpfDeclaredPercent', 'VPF Percentage', 'number'],
];
const SERVICE_FIELDS = [
  ['probationPeriodDays', 'Probation Period (Days)', 'number'], ['probationDate', 'Probation Date', 'date'],
  ['confirmationPeriodDays', 'Confirmation Period (Days)', 'number'], ['confirmationDate', 'Confirmation Date', 'date'],
  ['lastIncrementDate', 'Last Increment Date', 'date'], ['lastPromotionDate', 'Last Promotion Date', 'date'],
  ['lastTransferDate', 'Last Transfer Date', 'date'], ['seniorityDate', 'Seniority Date', 'date'],
  ['seniorityNumber', 'Seniority No'], ['retirementDate', 'Retirement Date', 'date'],
  ['resignationDate', 'Resignation Date', 'date'], ['resignationReason', 'Resignation Reason'],
  ['serviceLastDate', 'Service Last Date', 'date'], ['pfJoiningDate', 'PF Joining Date', 'date'],
  ['pensionJoiningDate', 'Pension Joining Date', 'date'], ['pfExitDate', 'PF Exit Date', 'date'],
  ['pensionExitDate', 'Pension Exit Date', 'date'],
];
const ADDRESS_FIELDS = [
  ['Address1', 'Address 1'], ['Address2', 'Address 2'], ['Address3', 'Address 3'], ['Landmark', 'Landmark'],
  ['Area', 'Area'], ['City', 'City'], ['Taluka', 'Taluka'], ['State', 'State'], ['Email', 'Email', 'email'],
  ['Website', 'Website', 'url'], ['FaxNumber', 'Fax No'], ['ContactNumber', 'Contact No'],
];
const ADDRESS_TYPES = [['residential', 'RESIDENTIAL', 'Residential'], ['permanent', 'PERMANENT', 'Permanent'], ['correspondence', 'CORRESPONDENCE', 'Correspondence']];

function flatten(data) {
  const result = { ...(data?.office || {}), ...(data?.service || {}) };
  for (const [prefix, type] of ADDRESS_TYPES) {
    const row = data?.contacts?.find(item => item.addressType === type) || {};
    for (const [suffix] of ADDRESS_FIELDS) result[`${prefix}${suffix}`] = row[suffix[0].toLowerCase() + suffix.slice(1)] ?? '';
  }
  return result;
}

function FieldGrid({ fields, values, onChange, disabled, prefix = '' }) {
  return <div className="form-grid">{fields.map(([key, label, type = 'text']) => {
    const fieldKey = `${prefix}${key}`;
    return <Input key={fieldKey} id={`master-${fieldKey}`} label={label} type={type} value={values[fieldKey] ?? ''} disabled={disabled} onChange={event => onChange(fieldKey, event.target.value)} />;
  })}</div>;
}

export function EmployeeMasterInformationTab({ employeeId, canEdit }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [values, setValues] = useState({});
  const [dirty, setDirty] = useState({});
  const [error, setError] = useState('');
  const query = useQuery({ queryKey: ['employee-master-information', employeeId], queryFn: () => masterDataApi.employeeMasterInformation(employeeId) });
  const initial = useMemo(() => flatten(query.data), [query.data]);
  useEffect(() => { setValues(initial); setDirty({}); }, [initial]);
  const update = useMutation({
    mutationFn: payload => masterDataApi.updateEmployeeMasterInformation(employeeId, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['employee-master-information', employeeId] }); toast.add('Employee master information updated.', 'success'); setDirty({}); setError(''); },
    onError: err => setError(err?.body?.errors?.join(' ') || err.message || 'Could not update employee master information.'),
  });
  const change = (key, value) => { setValues(current => ({ ...current, [key]: value })); setDirty(current => ({ ...current, [key]: true })); };
  if (query.isLoading) return <Card><p>Loading employee master information…</p></Card>;
  if (query.isError) return <EmptyState title="Could not load employee master information" description={query.error.message} />;
  const save = () => update.mutate(Object.fromEntries(Object.keys(dirty).map(key => [key, values[key]])));
  return <div className="stack">
    {error && <div className="auth-error" role="alert">{error}</div>}
    <Card title="Office information"><p className="form-note">Application numbers are references only. They do not activate a payroll deduction. Payment mode and CBS account references are controlled in Bank Accounts.</p><FieldGrid fields={OFFICE_FIELDS} values={values} onChange={change} disabled={!canEdit} /><div className="form-grid"><div className="field"><label className="field-label" htmlFor="master-selfHandicap">Self Handicap</label><select id="master-selfHandicap" className="input" disabled={!canEdit} value={String(values.selfHandicap ?? 'Masked')} onChange={event => change('selfHandicap', event.target.value)}><option value="Masked">Not disclosed</option><option value="false">No</option><option value="true">Yes</option></select></div><div className="field"><label className="field-label" htmlFor="master-familyHandicap">Family Handicap</label><select id="master-familyHandicap" className="input" disabled={!canEdit} value={String(values.familyHandicap ?? 'Masked')} onChange={event => change('familyHandicap', event.target.value)}><option value="Masked">Not disclosed</option><option value="false">No</option><option value="true">Yes</option></select></div></div></Card>
    <Card title="Service information"><FieldGrid fields={SERVICE_FIELDS} values={values} onChange={change} disabled={!canEdit} /></Card>
    {ADDRESS_TYPES.map(([prefix, , label]) => <Card key={prefix} title={`${label} address & contact`}><FieldGrid fields={ADDRESS_FIELDS} prefix={prefix} values={values} onChange={change} disabled={!canEdit} /></Card>)}
    {canEdit && <div className="form-actions"><Button variant="secondary" onClick={() => { setValues(initial); setDirty({}); }} disabled={!Object.keys(dirty).length}>Discard</Button><Button onClick={save} loading={update.isPending} disabled={!Object.keys(dirty).length}>Save Information</Button></div>}
  </div>;
}
