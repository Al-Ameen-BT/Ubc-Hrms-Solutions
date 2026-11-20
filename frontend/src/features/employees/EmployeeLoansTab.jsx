import React from 'react';
import { serviceBookApi } from '../../api/extended';
import { fmt } from '../../api/client';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../auth/AuthContext';
import { ResourceSection } from './ResourceSection';

/* Festival Advance, Overdraft, Recurring Deposit, LIC, Housing Loan and
   Vehicle Loan — the loan-style payroll components (routes/serviceBook.js).
   Each is a plain list with an add form; edit is only offered where the
   backend actually supports a change. */

const money = (v) => (v == null ? '—' : fmt.money(v));
const activeBadge = (active) => <Badge variant={active ? 'success' : 'default'}>{active ? 'Active' : 'Closed'}</Badge>;

export function EmployeeLoansTab({ employeeId }) {
  const { canPermission } = useAuth();
  const canRead = canPermission('compensation.view', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY']);
  const canCreate = canPermission('compensation.prepare', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'PAYROLL_OFFICER', 'ACCOUNTS_OFFICER']);
  const canRecord = canPermission('compensation.prepare', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER']);
  const canEdit = canPermission('compensation.prepare', ['ORG_ADMIN', 'HR_ADMIN']);
  if (!canRead) return <p>Loan access is not granted by your current assignments.</p>;
  return (
    <div className="stack">
      <ResourceSection
        title="Festival Advance"
        description="At most one unrepaid advance at a time; amount is capped at one month's Basic + DA."
        queryKey={['emp-fa', employeeId]}
        listFn={() => serviceBookApi.festivalAdvances(employeeId)}
        createFn={canCreate ? (data) => serviceBookApi.addFestivalAdvance(employeeId, data) : undefined}
        updateFn={canEdit ? (id, data) => serviceBookApi.updateFestivalAdvance(employeeId, id, data) : undefined}
        deleteFn={canEdit ? (id) => serviceBookApi.deleteFestivalAdvance(employeeId, id) : undefined}
        emptyMessage="No Festival Advance on record."
        addLabel="Record Advance"
        initial={{ amount: '', availedDate: '', repayMonths: '', remarks: '' }}
        fields={[
          { name: 'amount', label: 'Amount', type: 'number', required: true, mono: true },
          { name: 'availedDate', label: 'Availed On', type: 'date', required: true },
          { name: 'repayMonths', label: 'Repayment Months', type: 'number', mono: true, hint: 'Defaults to the organisation standard.' },
          { name: 'remarks', label: 'Remarks' },
        ]}
        updateFields={[
          { name: 'repayMonths', label: 'Repayment Months', type: 'number', mono: true, required: true, hint: 'Can only be shortened, never extended.' },
        ]}
        columns={[
          { field: 'availedDate', label: 'Availed', mono: true, render: (r) => fmt.date(r.availedDate) },
          { field: 'amount', label: 'Amount', mono: true, align: 'right', render: (r) => money(r.amount) },
          { field: 'repayMonths', label: 'Months', mono: true, align: 'right' },
          { field: 'monthlyInstallment', label: 'Monthly', mono: true, align: 'right', render: (r) => money(r.monthlyInstallment) },
          { field: 'balanceRemaining', label: 'Balance', mono: true, align: 'right', render: (r) => money(r.balanceRemaining) },
          { field: 'fullyRepaid', label: 'Status', render: (r) => activeBadge(!r.fullyRepaid) },
        ]}
      />

      <ResourceSection
        title="Employee Overdraft"
        description="One unrepaid overdraft at a time. HR records the total repayment and monthly payment."
        queryKey={['emp-od', employeeId]}
        listFn={() => serviceBookApi.overdrafts(employeeId)}
        createFn={canRecord ? (data) => serviceBookApi.addOverdraft(employeeId, data) : undefined}
        deleteFn={canEdit ? (id) => serviceBookApi.deleteOverdraft(employeeId, id) : undefined}
        emptyMessage="No Overdraft on record."
        addLabel="Record Overdraft"
        initial={{ amount: '', availedDate: '', repayMonths: '', totalRepaymentAmount: '', monthlyPayment: '', remarks: '' }}
        meta={(d) => (d?.eligibility ? (
          <p className="form-note">
            {d.eligibility.slab ? (
              <span>
                <strong>Slab Applied:</strong> {d.eligibility.slab.name} ({d.eligibility.multiplier}x Basic+DA{d.eligibility.slab.maxLimit ? `, Capped at ${money(d.eligibility.slab.maxLimit)}` : ''}). Eligible Overdraft Limit: <strong>{money(d.eligibility.eligibleLimit)}</strong>.
              </span>
            ) : (
              <span>Bank offer {money(d.eligibility.minimumOffer)} (Basic + DA) × {d.eligibility.multiplier || 15}.</span>
            )}
            {' '}Maximum repayment: {d.maxRepayMonths} months.
          </p>
        ) : null)}
        fields={[
          { name: 'amount', label: 'Amount', type: 'number', required: true, mono: true },
          { name: 'availedDate', label: 'Availed On', type: 'date', required: true },
          { name: 'repayMonths', label: 'Repayment Months', type: 'number', mono: true, hint: 'Capped by months remaining until retirement.' },
          { name: 'totalRepaymentAmount', label: 'Total Amount to Repay', type: 'number', required: true, mono: true },
          { name: 'monthlyPayment', label: 'Monthly Payment', type: 'number', required: true, mono: true },
          { name: 'remarks', label: 'Remarks' },
        ]}
        columns={[
          { field: 'availedDate', label: 'Availed', mono: true, render: (r) => fmt.date(r.availedDate) },
          { field: 'amount', label: 'Amount', mono: true, align: 'right', render: (r) => money(r.amount) },
          { field: 'totalRepayable', label: 'Total to Repay', mono: true, align: 'right', render: (r) => money(r.totalRepayable) },
          { field: 'monthlyInstallment', label: 'Monthly', mono: true, align: 'right', render: (r) => money(r.monthlyInstallment) },
          { field: 'balanceRemaining', label: 'Balance', mono: true, align: 'right', render: (r) => money(r.balanceRemaining) },
          { field: 'fullyRepaid', label: 'Status', render: (r) => activeBadge(!r.fullyRepaid) },
        ]}
      />

      <ResourceSection
        title="Recurring Deposit"
        description="Linked to an Overdraft. Its monthly amount follows the overdraft repayment schedule and is deducted once."
        queryKey={['emp-rd', employeeId]}
        listFn={() => serviceBookApi.recurringDeposits(employeeId)}
        createFn={canRecord ? (data) => serviceBookApi.addRecurringDeposit(employeeId, data) : undefined}
        updateFn={canEdit ? (id, data) => serviceBookApi.updateRecurringDeposit(employeeId, id, data) : undefined}
        deleteFn={canEdit ? (id) => serviceBookApi.deleteRecurringDeposit(employeeId, id) : undefined}
        emptyMessage="No Recurring Deposit on record."
        addLabel="Open Deposit"
        initial={{ startDate: '', overdraftId: '', remarks: '' }}
        fields={[
          { name: 'startDate', label: 'Start Date', type: 'date', required: true },
          { name: 'overdraftId', label: 'Overdraft ID', type: 'number', mono: true, hint: 'Leave blank to link the current open Overdraft.' },
          { name: 'remarks', label: 'Remarks' },
        ]}
        updateFields={[
          { name: 'status', label: 'Status', options: [{ value: 'ACTIVE', label: 'Active' }, { value: 'CLOSED', label: 'Closed' }] },
        ]}
        columns={[
          { field: 'startDate', label: 'Started', mono: true, render: (r) => fmt.date(r.startDate) },
          { field: 'monthlyAmount', label: 'Monthly', mono: true, align: 'right', render: (r) => money(r.monthlyAmount) },
          { field: 'status', label: 'Status', render: (r) => activeBadge(r.status === 'ACTIVE') },
        ]}
      />

      <ResourceSection
        title="LIC Policies"
        description="An employee may hold several LIC policies at once."
        queryKey={['emp-lic', employeeId]}
        listFn={() => serviceBookApi.licPolicies(employeeId)}
        createFn={canCreate ? (data) => serviceBookApi.addLicPolicy(employeeId, data) : undefined}
        updateFn={canEdit ? (id, data) => serviceBookApi.updateLicPolicy(employeeId, id, data) : undefined}
        deleteFn={canEdit ? (id) => serviceBookApi.deleteLicPolicy(employeeId, id) : undefined}
        emptyMessage="No LIC policy on record."
        addLabel="Add Policy"
        initial={{ policyNumber: '', openingDate: '', startedDate: '', deductionAmount: '', sumAssuredAmount: '', maturityDate: '', closureDate: '', remarks: '' }}
        fields={[
          { name: 'policyNumber', label: 'Policy Number', mono: true },
          { name: 'openingDate', label: 'Opening Date', type: 'date', required: true },
          { name: 'startedDate', label: 'Deduction Start', type: 'date', required: true },
          { name: 'deductionAmount', label: 'Monthly Deduction', type: 'number', required: true, mono: true },
          { name: 'sumAssuredAmount', label: 'Sum Assured', type: 'number', required: true, mono: true },
          { name: 'maturityDate', label: 'Maturity Date', type: 'date' },
          { name: 'closureDate', label: 'Closure Date', type: 'date' },
          { name: 'remarks', label: 'Remarks' },
        ]}
        updateFields={[
          { name: 'deductionAmount', label: 'Monthly Deduction', type: 'number', mono: true },
          { name: 'maturityDate', label: 'Maturity Date', type: 'date' },
          { name: 'closureDate', label: 'Closure Date', type: 'date' },
          { name: 'remarks', label: 'Remarks' },
        ]}
        columns={[
          { field: 'policyNumber', label: 'Policy No.', mono: true },
          { field: 'startedDate', label: 'Started', mono: true, render: (r) => fmt.date(r.startedDate) },
          { field: 'deductionAmount', label: 'Deduction', mono: true, align: 'right', render: (r) => money(r.deductionAmount) },
          { field: 'sumAssuredAmount', label: 'Sum Assured', mono: true, align: 'right', render: (r) => money(r.sumAssuredAmount) },
          { field: 'closureDate', label: 'Closed', mono: true, render: (r) => fmt.date(r.closureDate) },
          { field: 'active', label: 'Status', render: (r) => activeBadge(r.active) },
        ]}
      />

      <ResourceSection
        title="Housing Loans"
        description="HR records the loan amount, total amount to repay, and monthly payment."
        queryKey={['emp-housing', employeeId]}
        listFn={() => serviceBookApi.housingLoans(employeeId)}
        createFn={canRecord ? (data) => serviceBookApi.addHousingLoan(employeeId, data) : undefined}
        updateFn={canEdit ? (id, data) => serviceBookApi.updateHousingLoan(employeeId, id, data) : undefined}
        deleteFn={canEdit ? (id) => serviceBookApi.deleteHousingLoan(employeeId, id) : undefined}
        emptyMessage="No Housing Loan on record."
        addLabel="Add Loan"
        initial={{ totalLoanAmount: '', totalRepaymentAmount: '', monthlyPayment: '', emiStartDate: '', emiEndDate: '', remarks: '' }}
        fields={[
          { name: 'totalLoanAmount', label: 'Loan Amount', type: 'number', required: true, mono: true },
          { name: 'totalRepaymentAmount', label: 'Total Amount to Repay', type: 'number', required: true, mono: true },
          { name: 'monthlyPayment', label: 'Monthly Payment (EMI)', type: 'number', required: true, mono: true },
          { name: 'emiStartDate', label: 'EMI Start', type: 'date', required: true },
          { name: 'emiEndDate', label: 'EMI End', type: 'date', required: true },
          { name: 'remarks', label: 'Remarks' },
        ]}
        updateFields={[
          { name: 'closureDate', label: 'Closure Date', type: 'date' },
          { name: 'remarks', label: 'Remarks' },
        ]}
        columns={[
          { field: 'totalLoanAmount', label: 'Amount', mono: true, align: 'right', render: (r) => money(r.totalLoanAmount) },
          { field: 'totalRepayable', label: 'Total to Repay', mono: true, align: 'right', render: (r) => money(r.totalRepayable) },
          { field: 'emiAmount', label: 'EMI', mono: true, align: 'right', render: (r) => money(r.emiAmount) },
          { field: 'periodMonths', label: 'Months', mono: true, align: 'right' },
          { field: 'emiEndDate', label: 'Ends', mono: true, render: (r) => fmt.date(r.emiEndDate) },
          { field: 'active', label: 'Status', render: (r) => activeBadge(r.active) },
        ]}
      />

      <ResourceSection
        title="Vehicle Loans"
        description="Multiple loans only if the organisation has enabled it (Payroll Settings)."
        queryKey={['emp-vehicle', employeeId]}
        listFn={() => serviceBookApi.vehicleLoans(employeeId)}
        createFn={canRecord ? (data) => serviceBookApi.addVehicleLoan(employeeId, data) : undefined}
        updateFn={canEdit ? (id, data) => serviceBookApi.updateVehicleLoan(employeeId, id, data) : undefined}
        deleteFn={canEdit ? (id) => serviceBookApi.deleteVehicleLoan(employeeId, id) : undefined}
        emptyMessage="No Vehicle Loan on record."
        addLabel="Add Loan"
        initial={{ vehicleType: '', totalAmount: '', totalRepaymentAmount: '', monthlyPayment: '', startDate: '', endDate: '', remarks: '' }}
        meta={(d) => (d ? (
          <p className="form-note">
            Multiple loans {d.allowMultiple ? 'allowed' : 'not allowed'}.
          </p>
        ) : null)}
        fields={[
          { name: 'vehicleType', label: 'Vehicle Type' },
          { name: 'totalAmount', label: 'Loan Amount', type: 'number', required: true, mono: true },
          { name: 'startDate', label: 'Start Date', type: 'date', required: true },
          { name: 'endDate', label: 'End Date', type: 'date', required: true },
          { name: 'totalRepaymentAmount', label: 'Total Amount to Repay', type: 'number', required: true, mono: true },
          { name: 'monthlyPayment', label: 'Monthly Payment (EMI)', type: 'number', required: true, mono: true },
          { name: 'remarks', label: 'Remarks' },
        ]}
        updateFields={[
          { name: 'closureDate', label: 'Closure Date', type: 'date' },
          { name: 'remarks', label: 'Remarks' },
        ]}
        columns={[
          { field: 'vehicleType', label: 'Vehicle' },
          { field: 'totalAmount', label: 'Amount', mono: true, align: 'right', render: (r) => money(r.totalAmount) },
          { field: 'totalRepayable', label: 'Total to Repay', mono: true, align: 'right', render: (r) => money(r.totalRepayable) },
          { field: 'emiAmount', label: 'EMI', mono: true, align: 'right', render: (r) => money(r.emiAmount) },
          { field: 'periodMonths', label: 'Months', mono: true, align: 'right' },
          { field: 'endDate', label: 'Ends', mono: true, render: (r) => fmt.date(r.endDate) },
          { field: 'active', label: 'Status', render: (r) => activeBadge(r.active) },
        ]}
      />
    </div>
  );
}
