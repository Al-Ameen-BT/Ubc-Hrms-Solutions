import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { arrearsApi } from '../../api/extended';
import { fmt } from '../../api/client';
import { canDecide } from '../../api/organizationAccess';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import './ArrearsPage.css';

const NEXT_STATUS = { DRAFT: 'APPROVED', APPROVED: 'ACTIVE', ACTIVE: 'CLOSED' };

const REV_STATUS_VARIANT = {
  DRAFT: 'warning',
  APPROVED: 'info',
  ACTIVE: 'success',
  CLOSED: 'default',
};

const INITIAL_FORM = {
  orderNumber: '',
  orderDate: '',
  effectiveFrom: '',
  effectiveTo: '',
  previousDaPercent: '',
  increasePercent: '',
  applicableServiceCategory: 'ALL',
  applicableEmployeeCategory: 'ALL',
  remarks: '',
};

export function ArrearsPage() {
  const navigate = useNavigate();
  const { user, canPermission } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState('');

  // Confirmation modal states
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [confirmAdvance, setConfirmAdvance] = useState(null); // { id, status, orderNumber }
  const [confirmCalculate, setConfirmCalculate] = useState(null); // { id, orderNumber }

  const canPrepare = canPermission('arrears.prepare', ['ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER']);
  const canApprove = canPermission('arrears.approve', ['ORG_ADMIN', 'APPROVING_AUTHORITY']);

  const { data: revisions, isLoading } = useQuery({
    queryKey: ['da-revisions'],
    queryFn: () => arrearsApi.revisions(),
  });

  const { data: cases, isLoading: casesLoading } = useQuery({
    queryKey: ['arrears-cases', selected],
    queryFn: () => arrearsApi.casesForRevision(selected),
    enabled: !!selected,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['da-revisions'] });
    if (selected) {
      queryClient.invalidateQueries({ queryKey: ['arrears-cases', selected] });
    }
  };

  const createMutation = useMutation({
    mutationFn: (payload) => arrearsApi.createRevision(payload),
    onSuccess: (res) => {
      invalidate();
      toast.add('DA revision created as draft.', 'success');
      setConfirmCreateOpen(false);
      setForm(INITIAL_FORM);
      setError('');
      if (res?.data?.id) {
        navigate(`/da-revisions/${res.data.id}`);
      }
    },
    onError: (err) => {
      setError(err.message || 'Could not create revision.');
      setConfirmCreateOpen(false);
    },
  });

  const advanceMutation = useMutation({
    mutationFn: ({ id, status }) => arrearsApi.setRevisionStatus(id, status),
    onSuccess: () => {
      invalidate();
      toast.add('Revision status updated.', 'success');
      setConfirmAdvance(null);
    },
    onError: (err) => {
      toast.add(err.message || 'Status change refused.', 'error');
      setConfirmAdvance(null);
    },
  });

  const calculateMutation = useMutation({
    mutationFn: (id) => arrearsApi.calculate(id),
    onSuccess: (res) => {
      invalidate();
      toast.add(`Calculated arrears for ${res.employeeCount} employee(s).`, 'success');
      setConfirmCalculate(null);
    },
    onError: (err) => {
      toast.add(err.message || 'Calculation failed.', 'error');
      setConfirmCalculate(null);
    },
  });

  const rows = revisions?.rows || [];
  const caseRows = cases?.rows || [];
  const selectedRevision = rows.find((r) => r.id === selected);

  const derivedRevisedDa =
    form.previousDaPercent !== '' && form.increasePercent !== '' &&
    Number.isFinite(Number(form.previousDaPercent)) && Number.isFinite(Number(form.increasePercent))
      ? Math.round((Number(form.previousDaPercent) + Number(form.increasePercent)) * 1000) / 1000
      : null;

  const handlePreCreate = (e) => {
    e.preventDefault();
    setError('');

    if (!form.orderNumber.trim()) {
      setError('Order Number is required.');
      return;
    }
    if (!form.orderDate) {
      setError('Order Date is required.');
      return;
    }
    if (!form.effectiveFrom) {
      setError('Effective From date is required.');
      return;
    }
    if (form.previousDaPercent === '' || isNaN(Number(form.previousDaPercent)) || Number(form.previousDaPercent) < 0) {
      setError('Previous DA % must be a valid positive number.');
      return;
    }
    if (form.increasePercent === '' || isNaN(Number(form.increasePercent)) || Number(form.increasePercent) <= 0) {
      setError('Increase % must be a valid positive number greater than 0.');
      return;
    }

    setConfirmCreateOpen(true);
  };

  const handleConfirmCreate = () => {
    createMutation.mutate({
      orderNumber: form.orderNumber.trim(),
      orderDate: form.orderDate,
      effectiveFrom: form.effectiveFrom,
      effectiveTo: form.effectiveTo || null,
      previousDaPercent: Number(form.previousDaPercent),
      increasePercent: Number(form.increasePercent),
      applicableServiceCategory: form.applicableServiceCategory,
      applicableEmployeeCategory: form.applicableEmployeeCategory.trim() || 'ALL',
      remarks: form.remarks.trim() || null,
    });
  };

  const revisionColumns = [
    {
      field: 'orderNumber',
      label: 'Order No.',
      render: (r) => (
        <Link to={`/da-revisions/${r.id}`} className="da-table-link">
          {r.orderNumber}
        </Link>
      ),
    },
    {
      field: 'orderDate',
      label: 'Order Date',
      mono: true,
      render: (r) => fmt.date(r.orderDate),
    },
    {
      field: 'effectiveFrom',
      label: 'Effective From',
      mono: true,
      render: (r) => fmt.date(r.effectiveFrom),
    },
    {
      field: 'previousDaPercent',
      label: 'Previous DA %',
      mono: true,
      align: 'right',
      render: (r) => `${Number(r.previousDaPercent)}%`,
    },
    {
      field: 'increasePercent',
      label: 'Increase %',
      mono: true,
      align: 'right',
      render: (r) => `${Number(r.increasePercent)}%`,
    },
    {
      field: 'revisedDaPercent',
      label: 'Revised DA %',
      mono: true,
      align: 'right',
      render: (r) => <strong>{Number(r.revisedDaPercent)}%</strong>,
    },
    {
      field: 'status',
      label: 'Status',
      render: (r) => (
        <Badge variant={REV_STATUS_VARIANT[r.status] || 'default'}>
          {r.status}
        </Badge>
      ),
    },
    {
      field: 'actions',
      label: '',
      sortable: false,
      render: (r) => (
        <div className="row-actions" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/da-revisions/${r.id}`)}
          >
            View
          </Button>
          <Button
            variant={selected === r.id ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setSelected(selected === r.id ? null : r.id)}
          >
            {selected === r.id ? 'Hide Cases' : 'Cases'}
          </Button>
          {canPrepare && ['APPROVED', 'ACTIVE'].includes(r.status) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmCalculate({ id: r.id, orderNumber: r.orderNumber })}
            >
              Calculate
            </Button>
          )}
          {NEXT_STATUS[r.status] && (() => {
            const to = NEXT_STATUS[r.status];
            const needsApprover = to === 'APPROVED';
            const allowed = needsApprover
              ? canApprove && canDecide(user, r, ['preparedBy'])
              : canPrepare;
            if (!allowed) return null;
            return (
              <Button
                size="sm"
                variant={to === 'APPROVED' ? 'primary' : 'secondary'}
                onClick={() => setConfirmAdvance({ id: r.id, status: to, orderNumber: r.orderNumber })}
              >
                {to === 'APPROVED' ? 'Approve' : to === 'ACTIVE' ? 'Activate' : 'Close'}
              </Button>
            );
          })()}
        </div>
      ),
    },
  ];

  const caseColumns = [
    { field: 'empCode', label: 'Code', mono: true },
    { field: 'employeeName', label: 'Employee' },
    { field: 'monthsCount', label: 'Months', mono: true, align: 'right' },
    { field: 'totalCalculatedAmount', label: 'Calculated', mono: true, align: 'right', render: (r) => fmt.money(r.totalCalculatedAmount) },
    { field: 'effectiveTotalAmount', label: 'Effective', mono: true, align: 'right', render: (r) => fmt.money(r.effectiveTotalAmount) },
    { field: 'paymentMode', label: 'Payment', render: (r) => <Badge variant="info">{r.paymentMode?.replace(/_/g, ' ')}</Badge> },
    { field: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'FULLY_PAID' ? 'success' : r.status === 'CALCULATED' ? 'warning' : 'info'}>{r.status?.replace(/_/g, ' ')}</Badge> },
  ];

  return (
    <div className="page da-arrears-page">
      <header className="page-header da-arrears-header">
        <div className="da-arrears-breadcrumb">DA Arrears</div>
        <h1 className="da-arrears-title">DA Arrears Management</h1>
        <p className="da-arrears-subtitle">
          Record a DA revision order, calculate the arrears it creates from its Effective From date, then decide how each employee is paid.
        </p>
      </header>

      {canPrepare && (
        <Card title="New DA Revision">
          <form onSubmit={handlePreCreate} noValidate>
            {error && (
              <div className="auth-error" role="alert" style={{ marginBottom: '1rem' }}>
                {error}
              </div>
            )}
            <div className="da-arrears-form-grid">
              {/* Row 1: 5 fields */}
              <Input
                id="dr-orderNumber"
                label="Order Number"
                placeholder="GO-DA-2026-XX"
                value={form.orderNumber}
                onChange={(e) => setForm({ ...form, orderNumber: e.target.value })}
                required
                mono
              />
              <Input
                id="dr-orderDate"
                label="Order Date"
                type="date"
                value={form.orderDate}
                onChange={(e) => setForm({ ...form, orderDate: e.target.value })}
                required
              />
              <Input
                id="dr-effectiveFrom"
                label="Effective From"
                type="date"
                value={form.effectiveFrom}
                onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                required
              />
              <Input
                id="dr-effectiveTo"
                label="Effective To"
                type="date"
                hint="Leave blank if still open-ended."
                value={form.effectiveTo}
                onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })}
              />
              <Input
                id="dr-previousDaPercent"
                label="Previous DA %"
                type="number"
                step="0.001"
                value={form.previousDaPercent}
                onChange={(e) => setForm({ ...form, previousDaPercent: e.target.value })}
                required
                mono
              />

              {/* Row 2: 3 fields (fills cols 1, 2, 3; cols 4 and 5 remain blank on desktop) */}
              <Input
                id="dr-increasePercent"
                label="Increase %"
                type="number"
                step="0.001"
                value={form.increasePercent}
                onChange={(e) => setForm({ ...form, increasePercent: e.target.value })}
                required
                mono
              />
              <div className="field">
                <label className="field-label" htmlFor="dr-applicableServiceCategory">
                  Applicable Service Category
                </label>
                <select
                  id="dr-applicableServiceCategory"
                  className="input"
                  value={form.applicableServiceCategory}
                  onChange={(e) => setForm({ ...form, applicableServiceCategory: e.target.value })}
                >
                  <option value="ALL">All</option>
                  <option value="REGULAR">Regular</option>
                  <option value="PART_TIME_CONTINGENT">Part-Time Contingent</option>
                </select>
              </div>
              <Input
                id="dr-applicableEmployeeCategory"
                label="Applicable Employee Category"
                hint="Match against an employee's Category field, or &quot;ALL&quot;."
                value={form.applicableEmployeeCategory}
                onChange={(e) => setForm({ ...form, applicableEmployeeCategory: e.target.value })}
              />

              {/* Empty place-holders to ensure Remarks starts on row 3 on desktop */}
              <div className="da-desktop-spacer" style={{ display: 'none' }} />
              <div className="da-desktop-spacer" style={{ display: 'none' }} />

              {/* Row 3: Remarks spans full width */}
              <div className="field da-col-span-full">
                <label className="field-label" htmlFor="dr-remarks">
                  Remarks
                </label>
                <textarea
                  id="dr-remarks"
                  className="input"
                  rows={2}
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              {/* Row 4: Left-aligned Create revision button */}
              <div className="da-col-span-full" style={{ marginTop: '0.25rem' }}>
                <Button
                  type="submit"
                  loading={createMutation.isPending}
                  className="da-create-btn"
                >
                  Create revision (Draft)
                </Button>
              </div>
            </div>
          </form>
        </Card>
      )}

      {/* Card 2: Revisions Table */}
      <Card title="Revisions" noPadding style={{ marginTop: '1.5rem' }}>
        <Table
          columns={revisionColumns}
          data={rows}
          keyField="id"
          loading={isLoading}
          emptyMessage="No DA revisions recorded yet."
        />
      </Card>

      {/* Optional Arrears Cases list when a revision is selected */}
      {selected && (
        <Card
          title={`Arrears Cases — ${selectedRevision ? selectedRevision.orderNumber : 'Selected Revision'}`}
          noPadding
          style={{ marginTop: '1.5rem' }}
          actions={
            canPrepare && ['APPROVED', 'ACTIVE'].includes(selectedRevision?.status) && (
              <Button
                size="sm"
                variant="secondary"
                loading={calculateMutation.isPending}
                onClick={() => setConfirmCalculate({ id: selected, orderNumber: selectedRevision?.orderNumber })}
              >
                Calculate Arrears
              </Button>
            )
          }
        >
          <Table
            columns={caseColumns}
            data={caseRows}
            keyField="id"
            loading={casesLoading}
            emptyMessage="No arrears cases calculated for this revision yet."
            onRowClick={(row) => navigate(`/arrears-cases/${row.id}`)}
          />
        </Card>
      )}

      {/* Double confirmation modal for creating revision */}
      <ConfirmationModal
        open={confirmCreateOpen}
        onClose={() => setConfirmCreateOpen(false)}
        onConfirm={handleConfirmCreate}
        title="Confirm New DA Revision"
        itemName={form.orderNumber}
        confirmLabel="Create Revision (Draft)"
        confirmVariant="primary"
        loading={createMutation.isPending}
        details={{
          'Order Number': form.orderNumber,
          'Order Date': form.orderDate,
          'Effective From': form.effectiveFrom,
          'Effective To': form.effectiveTo || 'Open-ended',
          'Previous DA %': `${form.previousDaPercent}%`,
          'Increase %': `${form.increasePercent}%`,
          'Revised DA %': derivedRevisedDa !== null ? `${derivedRevisedDa}%` : 'N/A',
          'Service Category': form.applicableServiceCategory,
          'Employee Category': form.applicableEmployeeCategory || 'ALL',
        }}
        warningMessage="This will record a new draft DA revision. Arrears calculation can be triggered once the order is approved and activated."
      />

      {/* Double confirmation modal for status changes */}
      <ConfirmationModal
        open={!!confirmAdvance}
        onClose={() => setConfirmAdvance(null)}
        onConfirm={() => advanceMutation.mutate({ id: confirmAdvance.id, status: confirmAdvance.status })}
        title={`Confirm DA Revision ${confirmAdvance?.status}`}
        itemName={confirmAdvance?.orderNumber}
        confirmLabel={`Mark as ${confirmAdvance?.status}`}
        confirmVariant={confirmAdvance?.status === 'APPROVED' ? 'primary' : 'warning'}
        loading={advanceMutation.isPending}
        warningMessage={`Are you sure you want to transition DA revision "${confirmAdvance?.orderNumber}" to ${confirmAdvance?.status}?`}
      />

      {/* Double confirmation modal for calculating arrears */}
      <ConfirmationModal
        open={!!confirmCalculate}
        onClose={() => setConfirmCalculate(null)}
        onConfirm={() => calculateMutation.mutate(confirmCalculate.id)}
        title="Confirm Arrears Calculation"
        itemName={confirmCalculate?.orderNumber}
        confirmLabel="Calculate Arrears"
        confirmVariant="primary"
        loading={calculateMutation.isPending}
        warningMessage={`This will calculate (or recalculate) Dearness Allowance arrears for every eligible employee under order "${confirmCalculate?.orderNumber}".`}
      />
    </div>
  );
}
