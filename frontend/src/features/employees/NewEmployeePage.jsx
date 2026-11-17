import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { masterDataApi } from '../../api/client';
import { compensationApi } from '../../api/compensation';
import { organizationAccessApi } from '../../api/organizationAccess';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Stepper } from '../../components/ui/Stepper';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { buildEmployeeCreatePayload, employeeOnboardingSteps, isPermissionAssignmentReady } from './employeeOnboarding.js';

const EMPTY = {
  empCode: '', name: '', dob: '', gender: 'MALE', category: 'GENERAL',
  panNumber: '', aadhaarNumber: '', personalEmail: '',
  doj: '', postCadreId: '', designation: '', department: '',
  directPay: false,
  currentPayScaleId: '', currentStageId: '', currentBasicPay: '',
  hraType: 'PERCENT', fixedHraAmount: '',
  riskAllowance: '', otherAllowance: '',
  bankName: '', bankAccountNumber: '', bankIfsc: '',
};

export function NewEmployeePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, canPermission } = useAuth();
  const permissionMode = user?.accessControlMode === 'PERMISSIONS';
  const steps = employeeOnboardingSteps(permissionMode);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [organizationAssignment, setOrganizationAssignment] = useState({ branchId: '', departmentId: '', positionId: '', effectiveFrom: '' });

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const canLegacyCompensationView = canPermission('compensation.view', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY']);
  const { data: posts } = useQuery({ queryKey: ['post-cadres-lite'], queryFn: () => masterDataApi.postCadres(), enabled: !permissionMode && canLegacyCompensationView });
  const { data: scales } = useQuery({ queryKey: ['pay-scales-lite'], queryFn: () => masterDataApi.payScales(), enabled: !permissionMode && canLegacyCompensationView });
  const { data: adoption } = useQuery({ queryKey: ['catalogue-adoptions'], queryFn: compensationApi.adoptions, enabled: !permissionMode && canLegacyCompensationView });
  const catalogueBank = !!adoption?.requiresCatalogueAdoption;
  const branchesQuery = useQuery({ queryKey: ['new-employee-branches'], queryFn: organizationAccessApi.onboardingBranches, enabled: permissionMode && canPermission('people.create', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER']) });
  const departmentsQuery = useQuery({ queryKey: ['new-employee-departments'], queryFn: organizationAccessApi.departments, enabled: permissionMode && !!organizationAssignment.branchId && canPermission('departments.view', ['ORG_ADMIN', 'HR_ADMIN']) });
  const positionsQuery = useQuery({
    queryKey: ['new-employee-position-options', organizationAssignment.branchId, organizationAssignment.departmentId],
    queryFn: () => organizationAccessApi.onboardingPositions(organizationAssignment.branchId, organizationAssignment.departmentId),
    enabled: permissionMode && !!organizationAssignment.branchId && canPermission('people.create', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER']),
  });
  const activeBranches = (branchesQuery.data?.rows || []).filter(row => row.status === 'ACTIVE');
  const activeDepartments = (departmentsQuery.data?.rows || []).filter(row => row.status === 'ACTIVE' && String(row.branchId) === String(organizationAssignment.branchId));
  const activePositions = (positionsQuery.data?.rows || []).filter(row => row.status === 'ACTIVE' && row.postCadreId != null && String(row.branchId) === String(organizationAssignment.branchId) && (!organizationAssignment.departmentId || String(row.departmentId) === String(organizationAssignment.departmentId)));

  const { data: stages } = useQuery({
    queryKey: ['pay-stages', form.currentPayScaleId],
    queryFn: () => masterDataApi.payScaleStages(form.currentPayScaleId),
    enabled: !permissionMode && canLegacyCompensationView && !!form.currentPayScaleId,
  });

  const createMutation = useMutation({
    mutationFn: (payload) => masterDataApi.createEmployee({ ...payload, organizationId: user?.organizationId }),
    onSuccess: (created) => {
      toast.add('Employee created.', 'success');
      navigate(catalogueBank ? `/employees/${created.id}/compensation` : '/people');
    },
    onError: (err) => setError(err.message || 'Could not create employee.'),
  });

  const canAdvance = () => {
    if (currentStep === 'identity') return form.name && form.empCode && form.dob && form.gender;
    if (currentStep === 'service') return form.doj && (permissionMode || form.postCadreId) && (!permissionMode || isPermissionAssignmentReady(organizationAssignment, activeBranches, activePositions));
    if (currentStep === 'pay') return permissionMode || catalogueBank || (form.directPay ? Number(form.currentBasicPay) > 0 : form.currentPayScaleId && form.currentStageId && form.currentBasicPay);
    if (currentStep === 'bank') return form.bankName && form.bankAccountNumber && form.bankIfsc;
    return true;
  };

  const currentStep = steps[step]?.key;
  const next = () => canAdvance() && setStep((s) => Math.min(s + 1, steps.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const scaleName = (id) => (scales?.rows || []).find((s) => String(s.id) === String(id))?.name || '—';
  const postName = (id) => (posts?.rows || []).find((p) => String(p.id) === String(id))?.name || '—';

  return (
    <div className="page">
      <header className="page-header">
        <h1>Add Employee</h1>
        <p>Create a new employee record and service book</p>
      </header>

      <Stepper steps={steps} current={step} onStepClick={setStep} />

      <Card>
        {error && <div className="auth-error" role="alert">{error}</div>}

        {currentStep === 'identity' && (
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
            <label className="checkbox-row">
              <input type="checkbox" checked={form.directPay} onChange={(e) => set({ directPay: e.target.checked, currentPayScaleId: '', currentStageId: '', currentBasicPay: '' })} />
              <span>Direct-pay staff (security, cleaning or other bank-set salary)</span>
            </label>
            <h3 className="form-section-title">Identity &amp; Contact</h3>
            <div className="form-grid">
              <Input id="pan" label="PAN" value={form.panNumber} onChange={(e) => set({ panNumber: e.target.value.toUpperCase() })} mono required />
              <Input id="aadhaar" label="Aadhaar" value={form.aadhaarNumber} onChange={(e) => set({ aadhaarNumber: e.target.value })} mono required />
              <Input id="pemail" label="Personal Email" type="email" value={form.personalEmail} onChange={(e) => set({ personalEmail: e.target.value })} required />
            </div>
            <p className="form-note">These fields are mandatory for this organisation and can be relaxed in Settings → Mandatory Fields.</p>
          </>
        )}

        {currentStep === 'service' && (
          <>
          <div className="form-grid">
            <Input id="doj" label="Date of Joining" type="date" value={form.doj} onChange={(e) => set({ doj: e.target.value })} required />
            {!permissionMode && <div className="field">
              <label className="field-label" htmlFor="post">Post &amp; Cadre</label>
              <select id="post" className="input" value={form.postCadreId} onChange={(e) => set({ postCadreId: e.target.value })}>
                <option value="">Select a post…</option>
                {(posts?.rows || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>}
            {!permissionMode && <Input id="desig" label="Designation" value={form.designation} onChange={(e) => set({ designation: e.target.value })} required />}
            {!permissionMode && <Input id="dept" label="Department" value={form.department} onChange={(e) => set({ department: e.target.value })} />}
          </div>
          {permissionMode && <section className="new-employee-structure" aria-labelledby="new-employee-structure-title">
            <h3 id="new-employee-structure-title">Organisation assignment</h3>
            <p className="form-note">Select the real branch, effective date, and active position. Department fills from the selected position when available.</p>
            {!canPermission('people.create', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER']) && <div className="auth-notice" role="status">Branch selection requires people.create access. Ask an organisation administrator to include that permission before creating this employee.</div>}
            {branchesQuery.error && <div className="auth-error" role="alert">{branchesQuery.error.message || 'Branches could not be loaded.'} Retry after checking your branch access.</div>}
            {departmentsQuery.error && <div className="auth-error" role="alert">{departmentsQuery.error.message || 'Departments could not be loaded.'} You can continue without a department.</div>}
            {positionsQuery.error && <div className="auth-error" role="alert">{positionsQuery.error.message || 'Positions could not be loaded.'} An active position with a post and cadre is required for onboarding. <Button size="sm" variant="secondary" onClick={() => positionsQuery.refetch()}>Retry positions</Button></div>}
            <div className="form-grid">
              <div className="field"><label className="field-label" htmlFor="new-employee-branch">Branch</label><select id="new-employee-branch" className="input" required value={organizationAssignment.branchId} disabled={branchesQuery.isLoading || !canPermission('people.create', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER'])} onChange={event => setOrganizationAssignment(value => ({ ...value, branchId: event.target.value, departmentId: '', positionId: '' }))}><option value="">Select branch</option>{activeBranches.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
              <Input id="new-employee-structure-date" label="Assignment effective date" type="date" required value={organizationAssignment.effectiveFrom} onChange={event => setOrganizationAssignment(value => ({ ...value, effectiveFrom: event.target.value }))} />
              <div className="field"><label className="field-label" htmlFor="new-employee-department">Department (optional)</label><select id="new-employee-department" className="input" value={organizationAssignment.departmentId} disabled={!organizationAssignment.branchId || !canPermission('departments.view', ['ORG_ADMIN', 'HR_ADMIN'])} onChange={event => setOrganizationAssignment(value => ({ ...value, departmentId: event.target.value, positionId: '' }))}><option value="">No department selected</option>{activeDepartments.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
              <div className="field"><label className="field-label" htmlFor="new-employee-position">Position</label><select id="new-employee-position" className="input" required value={organizationAssignment.positionId} disabled={!organizationAssignment.branchId || positionsQuery.isLoading || !canPermission('people.create', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER'])} onChange={event => { const position = activePositions.find(row => String(row.id) === event.target.value); setOrganizationAssignment(value => ({ ...value, positionId: event.target.value, ...(value.departmentId || !position?.departmentId ? {} : { departmentId: String(position.departmentId) }) })); }}><option value="">Select a position</option>{activePositions.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>{!positionsQuery.isLoading && !positionsQuery.error && organizationAssignment.branchId && !activePositions.length && <p className="field-hint">No active positions with a post and cadre are available for this branch and department.</p>}</div>
            </div>
          </section>}
          </>
        )}

        {currentStep === 'pay' && (
          <>
            {permissionMode ? <p className="form-note">Salary is assigned separately by an authorised compensation user after onboarding. This step does not collect salary amounts.</p> : catalogueBank ? <p className="form-note">Salary is assigned after creation from the adopted government stage, or as approved direct pay. A separate authority approves the assignment before payroll.</p> : <>
            <div className="form-grid">
              {form.directPay ? (
                <Input id="basic" label="Bank-set Monthly Gross Salary (₹)" type="number" value={form.currentBasicPay} onChange={(e) => set({ currentBasicPay: e.target.value })} mono required />
              ) : <>
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
                <Input id="fixedHra" label="Fixed HRA Amount (₹)" type="number" step="1" value={form.fixedHraAmount} onChange={(e) => set({ fixedHraAmount: e.target.value })} mono required />
              )}
              <Input id="risk" label="Risk Allowance (₹)" type="number" step="1" value={form.riskAllowance} onChange={(e) => set({ riskAllowance: e.target.value })} mono hint="Optional risk allowance for this employee." />
              </>}
            </div>
            <p className="form-note">{form.directPay ? 'This gross salary is set by the bank. Government pay stages and grade allowances do not apply; configured deductions still apply.' : 'HRA is subject to the organisation ceiling. Policies default from the organisation unless set per employee.'}</p>
            </>}
          </>
        )}

        {currentStep === 'bank' && (
          <div className="form-grid">
            <Input id="bankName" label="Bank Name" value={form.bankName} onChange={(e) => set({ bankName: e.target.value })} required />
            <Input id="bankAcc" label="Account Number" value={form.bankAccountNumber} onChange={(e) => set({ bankAccountNumber: e.target.value })} mono required />
            <Input id="ifsc" label="IFSC" value={form.bankIfsc} onChange={(e) => set({ bankIfsc: e.target.value.toUpperCase() })} mono required />
          </div>
        )}

        {currentStep === 'review' && (
          <div className="review-list">
            <ReviewRow label="Name" value={form.name} />
            <ReviewRow label="Code" value={form.empCode} />
            <ReviewRow label="Date of Birth" value={form.dob} />
            <ReviewRow label="Gender / Category" value={`${form.gender} / ${form.category}`} />
            <ReviewRow label="PAN / Aadhaar" value={`${form.panNumber} / ${form.aadhaarNumber}`} />
            <ReviewRow label="Personal Email" value={form.personalEmail} />
            <ReviewRow label="Date of Joining" value={form.doj} />
            {!permissionMode && <ReviewRow label="Post" value={postName(form.postCadreId)} />}
            {permissionMode ? <>
              <ReviewRow label="Branch" value={activeBranches.find(row => String(row.id) === String(organizationAssignment.branchId))?.name} />
              <ReviewRow label="Department" value={activeDepartments.find(row => String(row.id) === String(organizationAssignment.departmentId))?.name || 'No department selected'} />
              <ReviewRow label="Position" value={activePositions.find(row => String(row.id) === String(organizationAssignment.positionId))?.name || 'No position selected'} />
              <ReviewRow label="Assignment effective date" value={organizationAssignment.effectiveFrom} />
            </> : <>
              <ReviewRow label="Designation" value={form.designation} />
              <ReviewRow label="Department" value={form.department} />
            </>}
            {permissionMode || catalogueBank ? <ReviewRow label="Salary" value="Assigned separately after onboarding" /> : <>
              <ReviewRow label={form.directPay ? 'Bank-set Monthly Gross' : 'Basic Pay'} value={form.currentBasicPay} />
              {!form.directPay && <ReviewRow label="Pay Scale" value={scaleName(form.currentPayScaleId)} />}
              {!form.directPay && <ReviewRow label="HRA Basis" value={form.hraType === 'FIXED' ? `Fixed Amount (₹${Number(form.fixedHraAmount || 0).toLocaleString('en-IN')})` : 'Calculated from Basic Pay (%)'} />}
              {!form.directPay && Number(form.riskAllowance) > 0 && <ReviewRow label="Risk Allowance" value={`₹${Number(form.riskAllowance).toLocaleString('en-IN')}`} />}
            </>}
            {!permissionMode && <ReviewRow label="Bank" value={`${form.bankName} · ${form.bankAccountNumber} · ${form.bankIfsc}`} />}
          </div>
        )}

        <div className="card-actions stepper-actions">
          <Button variant="secondary" onClick={() => navigate('/people')}>Cancel</Button>
          {step > 0 && <Button variant="secondary" onClick={back}>Back</Button>}
          {step < steps.length - 1 ? (
            <Button onClick={next} disabled={!canAdvance()}>Next</Button>
          ) : (
            <Button loading={createMutation.isPending} disabled={!canAdvance()} onClick={() => { setError(''); createMutation.mutate(buildEmployeeCreatePayload(form, { permissionMode, catalogueBank, organizationAssignment })); }}>
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
