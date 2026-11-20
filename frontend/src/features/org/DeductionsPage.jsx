import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deductionApi, overdraftSlabApi } from '../../api/extended';
import { fmt } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';

const CATEGORIES = [
  { value: 'ALL', label: 'All Categories' },
  { value: 'STATUTORY', label: 'Statutory' },
  { value: 'WELFARE', label: 'Welfare Fund' },
  { value: 'SOCIETY', label: 'Credit Society' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'LOAN', label: 'Loan / Recovery' },
  { value: 'VOLUNTARY', label: 'Voluntary' },
  { value: 'OTHER', label: 'Other' },
];

export function DeductionsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('deductions'); // 'deductions' | 'overdraft'

  // Deduction Types state
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    category: 'OTHER',
    calculationType: 'FLAT',
    percentageBase: 'BASIC',
    percentageValue: '',
    frequency: 'MONTHLY',
    amount: '',
    employerAmount: '',
    month: '',
    year: '',
    remarks: '',
  });
  const [error, setError] = useState('');
  const [statusTarget, setStatusTarget] = useState(null);
  const [actionError, setActionError] = useState('');

  // Overdraft Slabs state
  const [slabModalOpen, setSlabModalOpen] = useState(false);
  const [slabForm, setSlabForm] = useState({
    slabName: '',
    fromSalary: '0',
    toSalary: '',
    multiplier: '15',
    maxLimit: '',
    minLimit: '',
    maxTenureMonths: '84',
    remarks: '',
  });
  const [slabError, setSlabError] = useState('');
  const [slabStatusTarget, setSlabStatusTarget] = useState(null);
  const [slabActionError, setSlabActionError] = useState('');

  // Queries
  const { data: deductionsData, isLoading: loadingDeductions } = useQuery({
    queryKey: ['deduction-types'],
    queryFn: () => deductionApi.list(),
  });

  const { data: slabsData, isLoading: loadingSlabs } = useQuery({
    queryKey: ['overdraft-slabs'],
    queryFn: () => overdraftSlabApi.list(),
  });

  // Deduction mutations
  const createMutation = useMutation({
    mutationFn: (payload) => deductionApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deduction-types'] });
      toast.add('Deduction type created.', 'success');
      setModalOpen(false);
      setForm({
        name: '',
        category: 'OTHER',
        calculationType: 'FLAT',
        percentageBase: 'BASIC',
        percentageValue: '',
        frequency: 'MONTHLY',
        amount: '',
        employerAmount: '',
        month: '',
        year: '',
        remarks: '',
      });
    },
    onError: (err) => setError(err.message || 'Could not create deduction type.'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => deductionApi.setStatus(id, status),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['deduction-types'] });
      toast.add(`Deduction ${vars.status === 'ACTIVE' ? 'activated' : 'deactivated'}.`, 'success');
      setStatusTarget(null);
    },
    onError: (err) => setActionError(err.message || 'Could not change status.'),
  });

  // Slab mutations
  const createSlabMutation = useMutation({
    mutationFn: (payload) => overdraftSlabApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overdraft-slabs'] });
      toast.add('Overdraft slab created.', 'success');
      setSlabModalOpen(false);
      setSlabForm({
        slabName: '',
        fromSalary: '0',
        toSalary: '',
        multiplier: '15',
        maxLimit: '',
        minLimit: '',
        maxTenureMonths: '84',
        remarks: '',
      });
    },
    onError: (err) => setSlabError(err.message || 'Could not create overdraft slab.'),
  });

  const statusSlabMutation = useMutation({
    mutationFn: ({ id, status }) => overdraftSlabApi.setStatus(id, status),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['overdraft-slabs'] });
      toast.add(`Overdraft slab ${vars.status === 'ACTIVE' ? 'activated' : 'deactivated'}.`, 'success');
      setSlabStatusTarget(null);
    },
    onError: (err) => setSlabActionError(err.message || 'Could not change slab status.'),
  });

  const filteredDeductions = (deductionsData?.data || []).filter((d) => {
    if (selectedCategory === 'ALL') return true;
    return d.category === selectedCategory;
  });

  const categoryBadgeVariant = (cat) => {
    switch (cat) {
      case 'STATUTORY': return 'warning';
      case 'WELFARE': return 'success';
      case 'SOCIETY': return 'info';
      case 'INSURANCE': return 'primary';
      case 'LOAN': return 'danger';
      default: return 'default';
    }
  };

  const deductionColumns = [
    { field: 'name', label: 'Deduction Name' },
    {
      field: 'category',
      label: 'Category',
      render: (r) => <Badge variant={categoryBadgeVariant(r.category)}>{r.category}</Badge>,
    },
    {
      field: 'type',
      label: 'Type',
      render: (r) => (
        <span>
          {r.calculationType === 'PERCENTAGE'
            ? `${r.percentageValue}% of ${r.percentageBase?.replace(/_/g, ' ')}`
            : 'Flat Rupee'}
        </span>
      ),
    },
    {
      field: 'frequency',
      label: 'Frequency',
      render: (r) => <Badge variant="info">{r.frequency?.replace(/_/g, ' ')}</Badge>,
    },
    {
      field: 'amount',
      label: 'Employee (₹)',
      mono: true,
      align: 'right',
      render: (r) => (r.calculationType === 'PERCENTAGE' ? `${r.percentageValue}%` : fmt.money(r.amount)),
    },
    {
      field: 'employerAmount',
      label: 'Employer (₹)',
      mono: true,
      align: 'right',
      render: (r) => (r.employerAmount ? fmt.money(r.employerAmount) : '—'),
    },
    {
      field: 'month',
      label: 'Period',
      mono: true,
      render: (r) => (r.month ? `Month ${r.month}${r.year ? ` / ${r.year}` : ''}` : 'Every Month'),
    },
    {
      field: 'status',
      label: 'Status',
      render: (r) => <Badge variant={r.status === 'ACTIVE' ? 'success' : 'default'}>{r.status}</Badge>,
    },
    {
      field: 'actions',
      label: '',
      sortable: false,
      render: (r) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setActionError('');
            setStatusTarget(r);
          }}
        >
          {r.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        </Button>
      ),
    },
  ];

  const slabColumns = [
    { field: 'slabName', label: 'Slab / Tier Name' },
    {
      field: 'salaryRange',
      label: 'Salary Range (Basic + DA)',
      mono: true,
      render: (r) => (
        <span>
          {fmt.money(r.fromSalary)} – {r.toSalary ? fmt.money(r.toSalary) : 'Above'}
        </span>
      ),
    },
    {
      field: 'multiplier',
      label: 'Multiplier',
      mono: true,
      align: 'right',
      render: (r) => `${r.multiplier}x`,
    },
    {
      field: 'maxLimit',
      label: 'Max OD Limit (₹)',
      mono: true,
      align: 'right',
      render: (r) => (r.maxLimit ? fmt.money(r.maxLimit) : 'No Cap'),
    },
    {
      field: 'maxTenureMonths',
      label: 'Max Tenure',
      mono: true,
      align: 'center',
      render: (r) => `${r.maxTenureMonths || 84} mos`,
    },
    {
      field: 'status',
      label: 'Status',
      render: (r) => <Badge variant={r.status === 'ACTIVE' ? 'success' : 'default'}>{r.status}</Badge>,
    },
    {
      field: 'actions',
      label: '',
      sortable: false,
      render: (r) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setSlabActionError('');
            setSlabStatusTarget(r);
          }}
        >
          {r.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        </Button>
      ),
    },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Deductions &amp; Overdraft Slabs</h1>
        <p>Manage all deduction categories, variables, and strictly defined employee overdraft tiers</p>
      </header>

      {/* Welfare Fund Rules Overview Card */}
      <Card title="Welfare Fund Statutory Rules &amp; Slabs">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '0.5rem' }}>
          <div style={{ padding: '0.85rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.825rem', color: '#64748b', fontWeight: 600 }}>BASIC + DA &gt; ₹10,000</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
              Employee: ₹300 <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#64748b' }}>/ Employer: ₹250</span>
            </div>
          </div>
          <div style={{ padding: '0.85rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.825rem', color: '#64748b', fontWeight: 600 }}>BASIC + DA ≤ ₹10,000</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
              Employee: ₹250 <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#64748b' }}>/ Employer: ₹200</span>
            </div>
          </div>
          <div style={{ padding: '0.85rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.825rem', color: '#64748b', fontWeight: 600 }}>STANDARD BASE / FLAT RATE</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
              Employee: ₹45 <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#64748b' }}>/ Employer: ₹45</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <Button
          variant={activeTab === 'deductions' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('deductions')}
        >
          Deduction Categories ({deductionsData?.data?.length || 0})
        </Button>
        <Button
          variant={activeTab === 'overdraft' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('overdraft')}
        >
          Overdraft Slabs ({slabsData?.data?.length || 0})
        </Button>
      </div>

      {activeTab === 'deductions' ? (
        <Card noPadding>
          <div className="table-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <label htmlFor="cat-filter" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569' }}>Filter:</label>
              <select
                id="cat-filter"
                className="input"
                style={{ width: 'auto', padding: '0.35rem 0.75rem' }}
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <Button onClick={() => setModalOpen(true)}>Add Deduction Type</Button>
          </div>
          <Table
            columns={deductionColumns}
            data={filteredDeductions}
            keyField="id"
            loading={loadingDeductions}
            emptyMessage="No deduction types configured in this category."
          />
        </Card>
      ) : (
        <Card noPadding>
          <div className="table-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem' }}>
            <div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                Strict salary brackets defining overdraft multipliers, caps, and tenures.
              </p>
            </div>
            <Button onClick={() => setSlabModalOpen(true)}>Add Overdraft Slab</Button>
          </div>
          <Table
            columns={slabColumns}
            data={slabsData?.data || []}
            keyField="id"
            loading={loadingSlabs}
            emptyMessage="No overdraft slabs configured. Standard 15x Basic + DA applies by default."
          />
        </Card>
      )}

      {/* Add Deduction Type Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Deduction Type"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button
              loading={createMutation.isPending}
              onClick={() => {
                setError('');
                createMutation.mutate(form);
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <form noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <Input
            id="ded-name"
            label="Deduction Name"
            placeholder="e.g. Society Share, Staff Welfare Club"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="ded-cat">Category</label>
              <select
                id="ded-cat"
                className="input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="STATUTORY">Statutory</option>
                <option value="WELFARE">Welfare Fund</option>
                <option value="SOCIETY">Credit Society</option>
                <option value="INSURANCE">Insurance</option>
                <option value="LOAN">Loan / Recovery</option>
                <option value="VOLUNTARY">Voluntary</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="ded-calc">Calculation Type</label>
              <select
                id="ded-calc"
                className="input"
                value={form.calculationType}
                onChange={(e) => setForm({ ...form, calculationType: e.target.value })}
              >
                <option value="FLAT">Flat Rupee Amount</option>
                <option value="PERCENTAGE">Percentage of Salary</option>
              </select>
            </div>
          </div>

          {form.calculationType === 'PERCENTAGE' ? (
            <div className="form-grid">
              <div className="field">
                <label className="field-label" htmlFor="ded-pbase">Percentage Base</label>
                <select
                  id="ded-pbase"
                  className="input"
                  value={form.percentageBase}
                  onChange={(e) => setForm({ ...form, percentageBase: e.target.value })}
                >
                  <option value="BASIC">Basic Pay</option>
                  <option value="BASIC_PLUS_DA">Basic + DA</option>
                  <option value="GROSS">Gross Earnings</option>
                </select>
              </div>
              <Input
                id="ded-pval"
                label="Percentage (%)"
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                value={form.percentageValue}
                onChange={(e) => setForm({ ...form, percentageValue: e.target.value })}
                mono
                required
              />
            </div>
          ) : (
            <div className="form-grid">
              <Input
                id="ded-amt"
                label="Employee Deduction (₹)"
                type="number"
                step="1"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                mono
                required
              />
              <Input
                id="ded-empr"
                label="Employer Contribution (₹, optional)"
                type="number"
                step="1"
                min="0"
                value={form.employerAmount}
                onChange={(e) => setForm({ ...form, employerAmount: e.target.value })}
                mono
              />
            </div>
          )}

          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="ded-freq">Frequency</label>
              <select
                id="ded-freq"
                className="input"
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value })}
              >
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
                <option value="ONE_TIME">One Time</option>
              </select>
            </div>
            {form.frequency !== 'MONTHLY' && (
              <Input
                id="ded-month"
                label="Month (1-12)"
                type="number"
                min="1"
                max="12"
                value={form.month}
                onChange={(e) => setForm({ ...form, month: e.target.value })}
                mono
              />
            )}
            {form.frequency === 'ONE_TIME' && (
              <Input
                id="ded-year"
                label="Year"
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                mono
              />
            )}
          </div>
          <Input
            id="ded-remarks"
            label="Remarks"
            value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
          />
        </form>
      </Modal>

      {/* Add Overdraft Slab Modal */}
      <Modal
        open={slabModalOpen}
        onClose={() => setSlabModalOpen(false)}
        title="Add Overdraft Slab"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSlabModalOpen(false)}>Cancel</Button>
            <Button
              loading={createSlabMutation.isPending}
              onClick={() => {
                setSlabError('');
                createSlabMutation.mutate(slabForm);
              }}
            >
              Save Slab
            </Button>
          </>
        }
      >
        <form noValidate>
          {slabError && <div className="auth-error" role="alert">{slabError}</div>}
          <Input
            id="slab-name"
            label="Slab Name"
            placeholder="e.g. Tier 1 (Basic+DA up to ₹25,000)"
            value={slabForm.slabName}
            onChange={(e) => setSlabForm({ ...slabForm, slabName: e.target.value })}
            required
          />
          <div className="form-grid">
            <Input
              id="slab-from"
              label="From Salary (Basic + DA ₹)"
              type="number"
              step="1"
              min="0"
              value={slabForm.fromSalary}
              onChange={(e) => setSlabForm({ ...slabForm, fromSalary: e.target.value })}
              mono
              required
            />
            <Input
              id="slab-to"
              label="To Salary (Basic + DA ₹, blank = unbounded)"
              type="number"
              step="1"
              min="0"
              placeholder="No upper limit"
              value={slabForm.toSalary}
              onChange={(e) => setSlabForm({ ...slabForm, toSalary: e.target.value })}
              mono
            />
          </div>
          <div className="form-grid">
            <Input
              id="slab-mult"
              label="Overdraft Multiplier (x)"
              type="number"
              step="0.5"
              min="1"
              max="50"
              value={slabForm.multiplier}
              onChange={(e) => setSlabForm({ ...slabForm, multiplier: e.target.value })}
              mono
              required
            />
            <Input
              id="slab-max"
              label="Maximum OD Limit Cap (₹)"
              type="number"
              step="1000"
              placeholder="e.g. 500000 (blank = uncapped)"
              value={slabForm.maxLimit}
              onChange={(e) => setSlabForm({ ...slabForm, maxLimit: e.target.value })}
              mono
            />
          </div>
          <div className="form-grid">
            <Input
              id="slab-min"
              label="Minimum OD Limit (₹, optional)"
              type="number"
              step="1000"
              value={slabForm.minLimit}
              onChange={(e) => setSlabForm({ ...slabForm, minLimit: e.target.value })}
              mono
            />
            <Input
              id="slab-tenure"
              label="Max Repayment Tenure (Months)"
              type="number"
              min="1"
              max="240"
              value={slabForm.maxTenureMonths}
              onChange={(e) => setSlabForm({ ...slabForm, maxTenureMonths: e.target.value })}
              mono
              required
            />
          </div>
          <Input
            id="slab-remarks"
            label="Remarks"
            value={slabForm.remarks}
            onChange={(e) => setSlabForm({ ...slabForm, remarks: e.target.value })}
          />
        </form>
      </Modal>

      {/* Double Verification Modal for Deduction Deactivation */}
      <ConfirmationModal
        open={statusTarget != null}
        onClose={() => setStatusTarget(null)}
        onConfirm={() => statusMutation.mutate({
          id: statusTarget.id,
          status: statusTarget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
        })}
        title={statusTarget?.status === 'ACTIVE' ? 'Deactivate Deduction Type' : 'Activate Deduction Type'}
        itemName={statusTarget?.name}
        details={{
          'Category': statusTarget?.category,
          'Type': statusTarget?.calculationType === 'PERCENTAGE' ? `${statusTarget?.percentageValue}%` : fmt.money(statusTarget?.amount),
          'Scheduled Period': statusTarget?.month ? `Month ${statusTarget.month}${statusTarget.year ? ` / ${statusTarget.year}` : ''}` : 'All Months',
        }}
        warningMessage={
          statusTarget?.status === 'ACTIVE'
            ? 'Deactivating this deduction type will exclude it from upcoming monthly payroll runs across the organisation.'
            : 'Activating this deduction type will make it eligible for inclusion in upcoming payroll runs and live payslips.'
        }
        confirmLabel={statusTarget?.status === 'ACTIVE' ? 'Confirm Deactivation' : 'Confirm Activation'}
        confirmVariant={statusTarget?.status === 'ACTIVE' ? 'danger' : 'primary'}
        requireVerification={statusTarget?.status === 'ACTIVE'}
        verificationText="DEACTIVATE"
        verificationLabel={statusTarget?.status === 'ACTIVE' ? `Type "DEACTIVATE" to confirm deactivating ${statusTarget?.name}:` : ''}
        loading={statusMutation.isPending}
        error={actionError}
      />

      {/* Double Verification Modal for Overdraft Slab Deactivation */}
      <ConfirmationModal
        open={slabStatusTarget != null}
        onClose={() => setSlabStatusTarget(null)}
        onConfirm={() => statusSlabMutation.mutate({
          id: slabStatusTarget.id,
          status: slabStatusTarget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
        })}
        title={slabStatusTarget?.status === 'ACTIVE' ? 'Deactivate Overdraft Slab' : 'Activate Overdraft Slab'}
        itemName={slabStatusTarget?.slabName}
        details={{
          'Multiplier': `${slabStatusTarget?.multiplier}x`,
          'Max Cap': slabStatusTarget?.maxLimit ? fmt.money(slabStatusTarget.maxLimit) : 'No Cap',
          'Max Tenure': `${slabStatusTarget?.maxTenureMonths || 84} months`,
        }}
        warningMessage={
          slabStatusTarget?.status === 'ACTIVE'
            ? 'Deactivating this overdraft slab will remove it from active evaluation when issuing new employee overdrafts.'
            : 'Activating this overdraft slab will restore it to the active tier evaluation list for employee overdrafts.'
        }
        confirmLabel={slabStatusTarget?.status === 'ACTIVE' ? 'Confirm Deactivation' : 'Confirm Activation'}
        confirmVariant={slabStatusTarget?.status === 'ACTIVE' ? 'danger' : 'primary'}
        requireVerification={slabStatusTarget?.status === 'ACTIVE'}
        verificationText="DEACTIVATE"
        verificationLabel={slabStatusTarget?.status === 'ACTIVE' ? `Type "DEACTIVATE" to confirm deactivating ${slabStatusTarget?.slabName}:` : ''}
        loading={statusSlabMutation.isPending}
        error={slabActionError}
      />
    </div>
  );
}
export default DeductionsPage;
