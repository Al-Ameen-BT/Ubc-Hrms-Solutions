import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leaveApi } from '../../api/extended';
import { masterDataApi, fmt } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import { EmptyState } from '../../components/ui/EmptyState';

export function LeavePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('applications'); // 'applications' | 'types' | 'settings'

  const [typeModal, setTypeModal] = useState(false);
  const [accrualType, setAccrualType] = useState(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [typeForm, setTypeForm] = useState({
    code: '',
    name: '',
    accrualMethod: 'FIXED_ANNUAL',
    annualDays: '',
    carryForward: true,
    paidPercent: 100,
    includeHolidays: true,
    isLop: false,
  });
  const [applyForm, setApplyForm] = useState({ leaveTypeId: '', fromDate: '', toDate: '', reason: '' });
  const [calcPreview, setCalcPreview] = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [accrualForm, setAccrualForm] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
  const [error, setError] = useState('');
  const [statusTarget, setStatusTarget] = useState(null);
  const [actionError, setActionError] = useState('');

  // Settings form state
  const [settingsForm, setSettingsForm] = useState({
    sandwichRuleEnabled: true,
    excludeHolidaysCasualLeave: true,
    excludeHolidaysLop: true,
    countSundaysAsHolidays: true,
    weekendPolicy: 'SUNDAY_ONLY',
    remarks: '',
  });

  const { data: types, isLoading: typesLoading } = useQuery({ queryKey: ['leave-types'], queryFn: () => leaveApi.types() });
  const { data: employees } = useQuery({ queryKey: ['employees-lite'], queryFn: () => masterDataApi.employees({ limit: 500 }) });

  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ['leave-settings'],
    queryFn: () => leaveApi.getSettings(),
  });

  useEffect(() => {
    if (settingsData?.data || settingsData?.row) {
      const s = settingsData.data || settingsData.row;
      setSettingsForm({
        sandwichRuleEnabled: s.sandwichRuleEnabled !== false,
        excludeHolidaysCasualLeave: s.excludeHolidaysCasualLeave !== false,
        excludeHolidaysLop: s.excludeHolidaysLop !== false,
        countSundaysAsHolidays: s.countSundaysAsHolidays !== false,
        weekendPolicy: s.weekendPolicy || 'SUNDAY_ONLY',
        remarks: s.remarks || '',
      });
    }
  }, [settingsData]);

  // Live calculation preview when filing leave
  useEffect(() => {
    if (applyForm.leaveTypeId && applyForm.fromDate && applyForm.toDate && applyForm.fromDate <= applyForm.toDate) {
      setCalcLoading(true);
      leaveApi.calculate({
        leaveTypeId: applyForm.leaveTypeId,
        fromDate: applyForm.fromDate,
        toDate: applyForm.toDate,
      })
        .then((res) => {
          setCalcPreview(res.data || res);
          setCalcLoading(false);
        })
        .catch(() => {
          setCalcPreview(null);
          setCalcLoading(false);
        });
    } else {
      setCalcPreview(null);
    }
  }, [applyForm.leaveTypeId, applyForm.fromDate, applyForm.toDate]);

  const { data: balances } = useQuery({
    queryKey: ['leave-balances', employeeId],
    queryFn: () => leaveApi.employeeBalances(employeeId),
    enabled: !!employeeId,
  });

  const { data: applications, isLoading: appsLoading } = useQuery({
    queryKey: ['leave-applications', employeeId],
    queryFn: () => leaveApi.employeeApplications(employeeId),
    enabled: !!employeeId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['leave-types'] });
    queryClient.invalidateQueries({ queryKey: ['leave-applications', employeeId] });
    queryClient.invalidateQueries({ queryKey: ['leave-balances', employeeId] });
    queryClient.invalidateQueries({ queryKey: ['leave-settings'] });
  };

  const seedMutation = useMutation({
    mutationFn: () => leaveApi.seedDefaults(),
    onSuccess: () => { invalidate(); toast.add('Default leave types seeded.', 'success'); },
    onError: (err) => toast.add(err.message || 'Seeding failed.', 'error'),
  });

  const createTypeMutation = useMutation({
    mutationFn: (payload) => leaveApi.createType(payload),
    onSuccess: () => { invalidate(); setTypeModal(false); toast.add('Leave type created.', 'success'); },
    onError: (err) => setError(err.message || 'Could not create leave type.'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => leaveApi.setTypeStatus(id, status),
    onSuccess: (_, vars) => {
      invalidate();
      toast.add(`Leave type ${vars.status === 'ACTIVE' ? 'activated' : 'deactivated'}.`, 'success');
      setStatusTarget(null);
    },
    onError: (err) => setActionError(err.message || 'Could not change status.'),
  });

  const updateTypeMutation = useMutation({
    mutationFn: ({ id, ...data }) => leaveApi.updateType(id, data),
    onSuccess: () => { invalidate(); toast.add('Leave type policy updated.', 'success'); },
    onError: (err) => toast.add(err.message || 'Update failed.', 'error'),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (payload) => leaveApi.updateSettings(payload),
    onSuccess: () => {
      invalidate();
      toast.add('Leave calculation settings saved successfully.', 'success');
    },
    onError: (err) => toast.add(err.message || 'Failed to save settings.', 'error'),
  });

  const accrueMutation = useMutation({
    mutationFn: ({ id, year, month }) => leaveApi.accrue(id, { year, month }),
    onSuccess: (res) => { invalidate(); setAccrualType(null); toast.add(`Accrued for ${res.employeesCredited} employee(s).`, 'success'); },
    onError: (err) => toast.add(err.message || 'Accrual failed.', 'error'),
  });

  const applyMutation = useMutation({
    mutationFn: (payload) => leaveApi.applyForEmployee(employeeId, payload),
    onSuccess: () => { invalidate(); setApplyOpen(false); toast.add('Leave application filed.', 'success'); },
    onError: (err) => setError(err.message || 'Could not file application.'),
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, decision }) => leaveApi.decideApplication(id, { decision }),
    onSuccess: () => { invalidate(); toast.add('Decision recorded.', 'success'); },
    onError: (err) => toast.add(err.message || 'Decision refused.', 'error'),
  });

  const typeRows = types?.rows || [];
  const employeeRows = employees?.rows || [];

  const typeColumns = [
    { field: 'code', label: 'Code', mono: true },
    { field: 'name', label: 'Leave Type' },
    { field: 'accrualMethod', label: 'Accrual', render: (r) => r.accrualMethod?.replace(/_/g, ' ') },
    { field: 'annualDays', label: 'Days / Year', mono: true, align: 'right', render: (r) => Number(r.annualDays) },
    {
      field: 'includeHolidays',
      label: 'Holiday Policy',
      render: (r) => (
        <Badge variant={r.includeHolidays ? 'info' : 'default'}>
          {r.includeHolidays ? 'Includes Holidays' : 'Working Days Only'}
        </Badge>
      ),
    },
    { field: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'ACTIVE' ? 'success' : 'default'}>{r.status}</Badge> },
    {
      field: 'actions', label: '', sortable: false,
      render: (r) => (
        <div className="row-actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => updateTypeMutation.mutate({ id: r.id, includeHolidays: !r.includeHolidays })}
            title={r.includeHolidays ? 'Switch to working days only' : 'Switch to count holidays under sandwich rule'}
          >
            {r.includeHolidays ? 'Exclude Holidays' : 'Include Holidays'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAccrualType(r)}>Accrue</Button>
          <Button
            variant="secondary" size="sm"
            onClick={() => {
              setActionError('');
              setStatusTarget(r);
            }}
          >
            {r.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ];

  const balanceColumns = [
    { field: 'leaveType', label: 'Leave Type', render: (r) => r.LeaveType?.name || '—' },
    { field: 'openingBalance', label: 'Opening', mono: true, align: 'right', render: (r) => Number(r.openingBalance) },
    { field: 'accrued', label: 'Accrued', mono: true, align: 'right', render: (r) => Number(r.accrued) },
    { field: 'availed', label: 'Availed', mono: true, align: 'right', render: (r) => Number(r.availed) },
    { field: 'closingBalance', label: 'Closing', mono: true, align: 'right', render: (r) => Number(r.closingBalance) },
  ];

  const appColumns = [
    { field: 'LeaveType', label: 'Type', render: (r) => r.LeaveType?.name || '—' },
    { field: 'fromDate', label: 'From', mono: true, render: (r) => fmt.date(r.fromDate) },
    { field: 'toDate', label: 'To', mono: true, render: (r) => fmt.date(r.toDate) },
    { field: 'days', label: 'Days Deducted', mono: true, align: 'right' },
    { field: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'APPROVED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'warning'}>{r.status}</Badge> },
    {
      field: 'actions', label: '', sortable: false,
      render: (r) => (r.status === 'PENDING' ? (
        <div className="row-actions">
          <Button size="sm" onClick={() => decideMutation.mutate({ id: r.id, decision: 'APPROVED' })}>Approve</Button>
          <Button size="sm" variant="secondary" onClick={() => decideMutation.mutate({ id: r.id, decision: 'REJECTED' })}>Reject</Button>
        </div>
      ) : null),
    },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Leave</h1>
        <p>Leave types, calculations, balances, applications, and custom policies</p>
      </header>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <Button
          variant={activeTab === 'applications' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('applications')}
        >
          Employee Leave & Balances
        </Button>
        <Button
          variant={activeTab === 'types' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('types')}
        >
          Leave Types ({typeRows.length})
        </Button>
        <Button
          variant={activeTab === 'settings' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ Leave Settings
        </Button>
      </div>

      {/* TAB 1: EMPLOYEE LEAVE & APPLICATIONS */}
      {activeTab === 'applications' && (
        <Card title="Employee Leave">
          <div className="field">
            <label className="field-label" htmlFor="lv-emp">Employee</label>
            <select id="lv-emp" className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select an employee…</option>
              {employeeRows.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.empCode}</option>)}
            </select>
          </div>

          {!employeeId ? (
            <EmptyState title="Select an employee" description="Their leave balances and applications will appear here." />
          ) : (
            <>
              <div className="card-actions" style={{ marginBottom: '1rem' }}>
                <Button onClick={() => { setError(''); setCalcPreview(null); setApplyOpen(true); }}>File Leave</Button>
              </div>
              <h3 className="form-section-title">Balances</h3>
              <Table columns={balanceColumns} data={balances?.rows || []} keyField="id" emptyMessage="No balances yet — run accrual on a leave type." />
              <h3 className="form-section-title" style={{ marginTop: '1.5rem' }}>Applications</h3>
              <Table columns={appColumns} data={applications?.rows || []} keyField="id" loading={appsLoading} emptyMessage="No applications for this employee." />
            </>
          )}
        </Card>
      )}

      {/* TAB 2: LEAVE TYPES */}
      {activeTab === 'types' && (
        <Card title="Leave Types" noPadding>
          <div className="table-toolbar">
            <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
              Common holidays within leave duration are counted as leave taken for Earned Leave and Half Pay Leave (Sandwich Rule).
            </div>
            <div className="row-actions">
              <Button variant="secondary" loading={seedMutation.isPending} onClick={() => seedMutation.mutate()}>Seed Defaults</Button>
              <Button onClick={() => {
                setTypeForm({
                  code: '',
                  name: '',
                  accrualMethod: 'FIXED_ANNUAL',
                  annualDays: '',
                  carryForward: true,
                  paidPercent: 100,
                  includeHolidays: true,
                  isLop: false,
                });
                setTypeModal(true);
              }}>Add Leave Type</Button>
            </div>
          </div>
          <Table columns={typeColumns} data={typeRows} keyField="id" loading={typesLoading} emptyMessage="No leave types configured. Seed the KSR-style defaults to begin." />
        </Card>
      )}

      {/* TAB 3: LEAVE CALCULATION SETTINGS */}
      {activeTab === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card title="Leave Calculation & Sandwich Rule Settings">
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '0.5rem',
              padding: '1rem',
              marginBottom: '1.5rem',
              fontSize: '0.875rem',
              color: '#334155',
              lineHeight: 1.5,
            }}>
              <strong>Policy Overview:</strong> For leaves other than Casual Leave (CL) and Loss of Pay (LOP), any common organization holidays or weekly offs that fall inside the applied leave period are marked and counted as leave days taken (Sandwich Rule). Casual Leave and LOP exclude common holidays so only working days are deducted.
            </div>

            <form onSubmit={(e) => { e.preventDefault(); updateSettingsMutation.mutate(settingsForm); }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    style={{ marginTop: '0.25rem', width: '1.1rem', height: '1.1rem' }}
                    checked={settingsForm.sandwichRuleEnabled}
                    onChange={(e) => setSettingsForm({ ...settingsForm, sandwichRuleEnabled: e.target.checked })}
                  />
                  <div>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>Enable Sandwich Rule (Calendar Days Counting)</div>
                    <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                      When enabled, common holidays and weekly offs falling inside the applied range count as leave taken for types marked with "Includes Holidays" (Earned Leave, Half Pay Leave, Maternity Leave).
                    </div>
                  </div>
                </label>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }} />

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    style={{ marginTop: '0.25rem', width: '1.1rem', height: '1.1rem' }}
                    checked={settingsForm.excludeHolidaysCasualLeave}
                    onChange={(e) => setSettingsForm({ ...settingsForm, excludeHolidaysCasualLeave: e.target.checked })}
                  />
                  <div>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>Casual Leave (CL) Holiday Exemption</div>
                    <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                      Common holidays and weekly offs within a Casual Leave request are excluded from deduction (only working days deducted).
                    </div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    style={{ marginTop: '0.25rem', width: '1.1rem', height: '1.1rem' }}
                    checked={settingsForm.excludeHolidaysLop}
                    onChange={(e) => setSettingsForm({ ...settingsForm, excludeHolidaysLop: e.target.checked })}
                  />
                  <div>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>Loss of Pay (LOP) Holiday Exemption</div>
                    <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                      Common holidays and weekly offs within an unpaid Loss of Pay period are excluded from deduction.
                    </div>
                  </div>
                </label>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }} />

                <div className="form-grid">
                  <div className="field">
                    <label className="field-label" htmlFor="set-weekend-policy">Weekend / Weekly Off Schedule</label>
                    <select
                      id="set-weekend-policy"
                      className="input"
                      value={settingsForm.weekendPolicy}
                      onChange={(e) => setSettingsForm({ ...settingsForm, weekendPolicy: e.target.value })}
                    >
                      <option value="SUNDAY_ONLY">Sundays Only</option>
                      <option value="SATURDAY_SUNDAY">Saturdays and Sundays</option>
                      <option value="SECOND_FOURTH_SATURDAY_SUNDAY">2nd & 4th Saturdays and all Sundays (Bank Standard)</option>
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="set-count-sundays">Weekly Off Treatment</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', cursor: 'pointer' }}>
                      <input
                        id="set-count-sundays"
                        type="checkbox"
                        checked={settingsForm.countSundaysAsHolidays}
                        onChange={(e) => setSettingsForm({ ...settingsForm, countSundaysAsHolidays: e.target.checked })}
                      />
                      <span style={{ fontSize: '0.875rem', color: '#334155' }}>Treat Weekly Offs as Non-Working Days</span>
                    </label>
                  </div>
                </div>

                <Input
                  id="set-remarks"
                  label="Policy Remarks & Notes"
                  value={settingsForm.remarks}
                  onChange={(e) => setSettingsForm({ ...settingsForm, remarks: e.target.value })}
                  placeholder="e.g. As per Kerala Service Rules (KSR) & Bank Bipartite Settlement"
                />

                <div style={{ marginTop: '0.5rem' }}>
                  <Button loading={updateSettingsMutation.isPending} type="submit">
                    Save Leave Settings
                  </Button>
                </div>
              </div>
            </form>
          </Card>

          <Card title="Per-Leave-Type Holiday Calculation Policy">
            <div style={{ marginBottom: '1rem', fontSize: '0.875rem', color: '#64748b' }}>
              Quickly toggle whether intervening common holidays count towards leave days taken for each leave type:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {typeRows.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    background: '#f8fafc',
                    borderRadius: '0.375rem',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>
                      {t.name} <code style={{ marginLeft: '0.5rem', color: '#475569' }}>[{t.code}]</code>
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                      {t.includeHolidays
                        ? 'Includes intervening common holidays and weekly offs in leave taken count'
                        : 'Excludes common holidays and weekly offs (deducts working days only)'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Badge variant={t.includeHolidays ? 'info' : 'default'}>
                      {t.includeHolidays ? 'Includes Holidays' : 'Working Days Only'}
                    </Badge>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => updateTypeMutation.mutate({ id: t.id, includeHolidays: !t.includeHolidays })}
                    >
                      {t.includeHolidays ? 'Exclude Holidays' : 'Include Holidays'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* MODAL: ADD LEAVE TYPE */}
      <Modal
        open={typeModal}
        onClose={() => setTypeModal(false)}
        title="Add Leave Type"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTypeModal(false)}>Cancel</Button>
            <Button loading={createTypeMutation.isPending} onClick={() => { setError(''); createTypeMutation.mutate(typeForm); }}>Create</Button>
          </>
        }
      >
        <form noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="form-grid">
            <Input id="lt-code" label="Code" value={typeForm.code} onChange={(e) => {
              const code = e.target.value.toUpperCase();
              const isCl = code === 'CL';
              const isLop = code === 'LOP';
              setTypeForm({
                ...typeForm,
                code,
                includeHolidays: !isCl && !isLop,
                isLop,
              });
            }} mono required />
            <Input id="lt-name" label="Name" value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} required />
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="lt-method">Accrual Method</label>
              <select id="lt-method" className="input" value={typeForm.accrualMethod} onChange={(e) => setTypeForm({ ...typeForm, accrualMethod: e.target.value })}>
                <option value="FIXED_ANNUAL">Fixed Annual</option>
                <option value="ACCRUAL_PER_MONTH">Accrual Per Month</option>
                <option value="NONE">None (not balance-tracked)</option>
              </select>
            </div>
            <Input id="lt-days" label="Annual Days" type="number" value={typeForm.annualDays} onChange={(e) => setTypeForm({ ...typeForm, annualDays: e.target.value })} mono />
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={typeForm.includeHolidays}
                onChange={(e) => setTypeForm({ ...typeForm, includeHolidays: e.target.checked })}
              />
              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1e293b' }}>
                Count Common Holidays as Leave Taken (Sandwich Rule)
              </span>
            </label>
            <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '1.5rem', marginTop: '-0.25rem' }}>
              Standard for Earned Leave and Half Pay Leave. Uncheck for Casual Leave and Loss of Pay.
            </span>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.25rem' }}>
              <input
                type="checkbox"
                checked={typeForm.isLop}
                onChange={(e) => setTypeForm({ ...typeForm, isLop: e.target.checked })}
              />
              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1e293b' }}>
                Loss of Pay (LOP) Leave Type
              </span>
            </label>
          </div>
        </form>
      </Modal>

      {/* MODAL: RUN ACCRUAL */}
      <Modal
        open={accrualType != null}
        onClose={() => setAccrualType(null)}
        title={`Run Accrual — ${accrualType?.name || ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAccrualType(null)}>Cancel</Button>
            <Button loading={accrueMutation.isPending} onClick={() => accrueMutation.mutate({ id: accrualType.id, ...accrualForm })}>Run Accrual</Button>
          </>
        }
      >
        <div className="form-grid">
          <Input id="ac-year" label="Year" type="number" value={accrualForm.year} onChange={(e) => setAccrualForm({ ...accrualForm, year: Number(e.target.value) })} mono />
          <Input id="ac-month" label="Month (1-12)" type="number" value={accrualForm.month} onChange={(e) => setAccrualForm({ ...accrualForm, month: Number(e.target.value) })} mono />
        </div>
        <p className="form-note">Credits this month's accrual (or the full annual entitlement for fixed-annual types) to every eligible employee.</p>
      </Modal>

      {/* MODAL: FILE LEAVE (WITH LIVE CALCULATION BREAKDOWN) */}
      <Modal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        title="File Leave"
        footer={
          <>
            <Button variant="secondary" onClick={() => setApplyOpen(false)}>Cancel</Button>
            <Button
              loading={applyMutation.isPending}
              disabled={calcPreview && calcPreview.days < 1}
              onClick={() => { setError(''); applyMutation.mutate(applyForm); }}
            >
              Submit Application
            </Button>
          </>
        }
      >
        <form noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="field">
            <label className="field-label" htmlFor="alv-type">Leave Type</label>
            <select
              id="alv-type"
              className="input"
              value={applyForm.leaveTypeId}
              onChange={(e) => setApplyForm({ ...applyForm, leaveTypeId: e.target.value })}
              required
            >
              <option value="">Select…</option>
              {typeRows.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.includeHolidays ? 'Includes Holidays' : 'Working Days Only'})
                </option>
              ))}
            </select>
          </div>
          <div className="form-grid">
            <Input id="alv-from" label="From" type="date" value={applyForm.fromDate} onChange={(e) => setApplyForm({ ...applyForm, fromDate: e.target.value })} required />
            <Input id="alv-to" label="To" type="date" value={applyForm.toDate} onChange={(e) => setApplyForm({ ...applyForm, toDate: e.target.value })} required />
          </div>

          {/* Live Calculation Preview Breakdown */}
          {calcLoading && (
            <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '0.375rem', fontSize: '0.875rem', color: '#64748b' }}>
              Calculating leave duration...
            </div>
          )}

          {calcPreview && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              background: calcPreview.days < 1 ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${calcPreview.days < 1 ? '#fecaca' : '#bbf7d0'}`,
              borderRadius: '0.5rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>Leave Calculation Summary</span>
                <Badge variant={calcPreview.includeHolidays ? 'info' : 'default'}>
                  {calcPreview.policyName}
                </Badge>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', fontSize: '0.8125rem', color: '#475569', marginBottom: '0.5rem' }}>
                <div>Total Calendar Days: <strong>{calcPreview.calendarDays}</strong></div>
                <div>Working Days: <strong>{calcPreview.workingDays}</strong></div>
                <div>Common Holidays: <strong>{calcPreview.holidaysDetected?.length || 0}</strong></div>
                <div>Weekly Offs: <strong>{calcPreview.weekendsDetected?.length || 0}</strong></div>
              </div>

              {calcPreview.holidaysDetected?.length > 0 && (
                <div style={{ fontSize: '0.8125rem', color: '#0369a1', marginBottom: '0.5rem' }}>
                  Holidays inside range: {calcPreview.holidaysDetected.map((h) => `${h.name} (${h.date})`).join(', ')}
                </div>
              )}

              <div style={{
                borderTop: '1px solid rgba(0,0,0,0.06)',
                paddingTop: '0.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ fontSize: '0.875rem', color: '#334155' }}>
                  {calcPreview.policyNotice}
                </span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Days Deducted</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: calcPreview.days < 1 ? '#dc2626' : '#16a34a' }}>
                    {calcPreview.days} day(s)
                  </span>
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: '1rem' }}>
            <Input id="alv-reason" label="Reason" value={applyForm.reason} onChange={(e) => setApplyForm({ ...applyForm, reason: e.target.value })} />
          </div>
        </form>
      </Modal>

      {/* MODAL: CONFIRM DEACTIVATION */}
      <ConfirmationModal
        open={statusTarget != null}
        onClose={() => setStatusTarget(null)}
        onConfirm={() => statusMutation.mutate({
          id: statusTarget.id,
          status: statusTarget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
        })}
        title={statusTarget?.status === 'ACTIVE' ? 'Deactivate Leave Type' : 'Activate Leave Type'}
        itemName={statusTarget?.name}
        details={{
          'Code': statusTarget?.code,
          'Accrual Method': statusTarget?.accrualMethod?.replace(/_/g, ' '),
          'Days Per Year': statusTarget?.annualDays,
          'Holiday Policy': statusTarget?.includeHolidays ? 'Includes Holidays' : 'Working Days Only',
          'Paid Percentage': `${statusTarget?.paidPercent ?? 100}%`,
        }}
        warningMessage={
          statusTarget?.status === 'ACTIVE'
            ? 'Deactivating this leave type will prevent employees and HR officers from filing new leave applications under this category.'
            : 'Activating this leave type will make it available for new leave applications and balance accruals.'
        }
        confirmLabel={statusTarget?.status === 'ACTIVE' ? 'Confirm Deactivation' : 'Confirm Activation'}
        confirmVariant={statusTarget?.status === 'ACTIVE' ? 'danger' : 'primary'}
        requireVerification={statusTarget?.status === 'ACTIVE'}
        verificationText="DEACTIVATE"
        verificationLabel={statusTarget?.status === 'ACTIVE' ? `Type "DEACTIVATE" to confirm deactivating ${statusTarget?.name}:` : ''}
        loading={statusMutation.isPending}
        error={actionError}
      />
    </div>
  );
}
