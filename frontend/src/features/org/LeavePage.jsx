import React, { useState } from 'react';
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
import { EmptyState } from '../../components/ui/EmptyState';

export function LeavePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [typeModal, setTypeModal] = useState(false);
  const [accrualType, setAccrualType] = useState(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [typeForm, setTypeForm] = useState({ code: '', name: '', accrualMethod: 'FIXED_ANNUAL', annualDays: '', carryForward: true, paidPercent: 100 });
  const [applyForm, setApplyForm] = useState({ leaveTypeId: '', fromDate: '', toDate: '', reason: '' });
  const [accrualForm, setAccrualForm] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
  const [error, setError] = useState('');

  const { data: types, isLoading: typesLoading } = useQuery({ queryKey: ['leave-types'], queryFn: () => leaveApi.types() });
  const { data: employees } = useQuery({ queryKey: ['employees-lite'], queryFn: () => masterDataApi.employees({ limit: 500 }) });

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
    onSuccess: () => { invalidate(); toast.add('Leave type updated.', 'success'); },
    onError: (err) => toast.add(err.message || 'Could not change status.', 'error'),
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
    { field: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'ACTIVE' ? 'success' : 'default'}>{r.status}</Badge> },
    {
      field: 'actions', label: '', sortable: false,
      render: (r) => (
        <div className="row-actions">
          <Button variant="secondary" size="sm" onClick={() => setAccrualType(r)}>Accrue</Button>
          <Button
            variant="secondary" size="sm"
            onClick={() => statusMutation.mutate({ id: r.id, status: r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}
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
    { field: 'days', label: 'Days', mono: true, align: 'right' },
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
        <p>Leave types, balances, and applications</p>
      </header>

      <Card title="Leave Types" noPadding>
        <div className="table-toolbar">
          <div />
          <div className="row-actions">
            <Button variant="secondary" loading={seedMutation.isPending} onClick={() => seedMutation.mutate()}>Seed Defaults</Button>
            <Button onClick={() => setTypeModal(true)}>Add Leave Type</Button>
          </div>
        </div>
        <Table columns={typeColumns} data={typeRows} keyField="id" loading={typesLoading} emptyMessage="No leave types configured. Seed the KSR-style defaults to begin." />
      </Card>

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
            <div className="card-actions">
              <Button onClick={() => { setError(''); setApplyOpen(true); }}>File Leave</Button>
            </div>
            <h3 className="form-section-title">Balances</h3>
            <Table columns={balanceColumns} data={balances?.rows || []} keyField="id" emptyMessage="No balances yet — run accrual on a leave type." />
            <h3 className="form-section-title">Applications</h3>
            <Table columns={appColumns} data={applications?.rows || []} keyField="id" loading={appsLoading} emptyMessage="No applications for this employee." />
          </>
        )}
      </Card>

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
            <Input id="lt-code" label="Code" value={typeForm.code} onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value.toUpperCase() })} mono required />
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
        </form>
      </Modal>

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

      <Modal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        title="File Leave"
        footer={
          <>
            <Button variant="secondary" onClick={() => setApplyOpen(false)}>Cancel</Button>
            <Button loading={applyMutation.isPending} onClick={() => { setError(''); applyMutation.mutate(applyForm); }}>Submit</Button>
          </>
        }
      >
        <form noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="field">
            <label className="field-label" htmlFor="alv-type">Leave Type</label>
            <select id="alv-type" className="input" value={applyForm.leaveTypeId} onChange={(e) => setApplyForm({ ...applyForm, leaveTypeId: e.target.value })} required>
              <option value="">Select…</option>
              {typeRows.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="form-grid">
            <Input id="alv-from" label="From" type="date" value={applyForm.fromDate} onChange={(e) => setApplyForm({ ...applyForm, fromDate: e.target.value })} required />
            <Input id="alv-to" label="To" type="date" value={applyForm.toDate} onChange={(e) => setApplyForm({ ...applyForm, toDate: e.target.value })} required />
          </div>
          <Input id="alv-reason" label="Reason" value={applyForm.reason} onChange={(e) => setApplyForm({ ...applyForm, reason: e.target.value })} />
        </form>
      </Modal>
    </div>
  );
}
