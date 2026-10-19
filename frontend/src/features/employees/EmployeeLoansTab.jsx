import React from 'react';
import { serviceBookApi } from '../../api/extended';
import { fmt } from '../../api/client';
import { Badge } from '../../components/ui/Badge';
import { ResourceSection } from './ResourceSection';

/* Festival Advance, Overdraft, Recurring Deposit, LIC, Housing Loan and
   Vehicle Loan — the loan-style payroll components (routes/serviceBook.js).
   Each is a plain list with an add form; edit is only offered where the
   backend actually supports a change. */

const money = (v) => (v == null ? '—' : fmt.money(v));
const activeBadge = (active) => <Badge variant={active ? 'success' : 'default'}>{active ? 'Active' : 'Closed'}</Badge>;

export function EmployeeLoansTab({ employeeId }) {
  return (
    <div className="stack">
      <ResourceSection
        title="Festival Advance"
        description="At most one unrepaid advance at a time; amount is capped at one month's Basic + DA."
        queryKey={['emp-fa', employeeId]}
        listFn={() => serviceBookApi.festivalAdvances(employeeId)}
        createFn={(data) => serviceBookApi.addFestivalAdvance(employeeId, data)}
        updateFn={(id, data) => serviceBookApi.updateFestivalAdvance(employeeId, id, data)}
        deleteFn={(id) => serviceBookApi.deleteFestivalAdvance(employeeId, id)}
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
        description="One unrepaid overdraft at a time. Interest is snapshotted at the organisation's rate on the day it is availed."
        queryKey={['emp-od', employeeId]}
        listFn={() => serviceBookApi.overdrafts(employeeId)}
        createFn={(data) => serviceBookApi.addOverdraft(employeeId, data)}
        deleteFn={(id) => serviceBookApi.deleteOverdraft(employeeId, id)}
        emptyMessage="No Overdraft on record."
        addLabel="Record Overdraft"
        initial={{ amount: '', availedDate: '', repayMonths: '', interestRatePercent: '', remarks: '' }}
        meta={(d) => (d?.eligibility ? (
          <p className="form-note">
            Eligibility ceiling {money(d.eligibility.ceiling)} (Basic + DA × {d.eligibility.basic ? 'multiplier' : 'rate'}).
            {' '}Maximum repayment {d.maxRepayMonths} months · current rate {d.currentInterestRatePercent}% p.a.
          </p>
        ) : null)}
        fields={[
          { name: 'amount', label: 'Amount', type: 'number', required: true, mono: true },
          { name: 'availedDate', label: 'Availed On', type: 'date', required: true },
          { name: 'repayMonths', label: 'Repayment Months', type: 'number', mono: true, hint: 'Capped by months remaining until retirement.' },
          { name: 'interestRatePercent', label: 'Interest % p.a.', type: 'number', mono: true, hint: "Leave blank to use the organisation's current rate." },
          { name: 'remarks', label: 'Remarks' },
        ]}
        columns={[
          { field: 'availedDate', label: 'Availed', mono: true, render: (r) => fmt.date(r.availedDate) },
          { field: 'amount', label: 'Amount', mono: true, align: 'right', render: (r) => money(r.amount) },
          { field: 'interestRatePercent', label: 'Rate %', mono: true, align: 'right' },
          { field: 'monthlyInstallment', label: 'Monthly', mono: true, align: 'right', render: (r) => money(r.monthlyInstallment) },
          { field: 'balanceRemaining', label: 'Balance', mono: true, align: 'right', render: (r) => money(r.balanceRemaining) },
          { field: 'fullyRepaid', label: 'Status', render: (r) => activeBadge(!r.fullyRepaid) },
        ]}
      />

      <ResourceSection
        title="Recurring Deposit"
        description="Opened as security against an Overdraft — one must exist first."
        queryKey={['emp-rd', employeeId]}
        listFn={() => serviceBookApi.recurringDeposits(employeeId)}
        createFn={(data) => serviceBookApi.addRecurringDeposit(employeeId, data)}
        updateFn={(id, data) => serviceBookApi.updateRecurringDeposit(employeeId, id, data)}
        deleteFn={(id) => serviceBookApi.deleteRecurringDeposit(employeeId, id)}
        emptyMessage="No Recurring Deposit on record."
        addLabel="Open Deposit"
        initial={{ monthlyAmount: '', startDate: '', overdraftId: '', remarks: '' }}
        fields={[
          { name: 'monthlyAmount', label: 'Monthly Amount', type: 'number', mono: true, hint: "Defaults to the linked Overdraft's instalment." },
          { name: 'startDate', label: 'Start Date', type: 'date', required: true },
          { name: 'overdraftId', label: 'Overdraft ID', type: 'number', mono: true, hint: 'Leave blank to link the current open Overdraft.' },
          { name: 'remarks', label: 'Remarks' },
        ]}
        updateFields={[
          { name: 'monthlyAmount', label: 'Monthly Amount', type: 'number', mono: true },
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
        createFn={(data) => serviceBookApi.addLicPolicy(employeeId, data)}
        updateFn={(id, data) => serviceBookApi.updateLicPolicy(employeeId, id, data)}
        deleteFn={(id) => serviceBookApi.deleteLicPolicy(employeeId, id)}
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
        description="EMI is computed from the recorded interest rate (reducing balance)."
        queryKey={['emp-housing', employeeId]}
        listFn={() => serviceBookApi.housingLoans(employeeId)}
        createFn={(data) => serviceBookApi.addHousingLoan(employeeId, data)}
        updateFn={(id, data) => serviceBookApi.updateHousingLoan(employeeId, id, data)}
        deleteFn={(id) => serviceBookApi.deleteHousingLoan(employeeId, id)}
        emptyMessage="No Housing Loan on record."
        addLabel="Add Loan"
        initial={{ totalLoanAmount: '', interestRatePercent: '', emiStartDate: '', emiEndDate: '', remarks: '' }}
        fields={[
          { name: 'totalLoanAmount', label: 'Loan Amount', type: 'number', required: true, mono: true },
          { name: 'interestRatePercent', label: 'Interest % p.a.', type: 'number', required: true, mono: true },
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
          { field: 'interestRatePercent', label: 'Rate %', mono: true, align: 'right' },
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
        createFn={(data) => serviceBookApi.addVehicleLoan(employeeId, data)}
        updateFn={(id, data) => serviceBookApi.updateVehicleLoan(employeeId, id, data)}
        deleteFn={(id) => serviceBookApi.deleteVehicleLoan(employeeId, id)}
        emptyMessage="No Vehicle Loan on record."
        addLabel="Add Loan"
        initial={{ vehicleType: '', totalAmount: '', startDate: '', endDate: '', interestRatePercent: '', emiAmount: '', remarks: '' }}
        meta={(d) => (d ? (
          <p className="form-note">
            Multiple loans {d.allowMultiple ? 'allowed' : 'not allowed'} · current rate {d.currentInterestRatePercent}% p.a.
          </p>
        ) : null)}
        fields={[
          { name: 'vehicleType', label: 'Vehicle Type' },
          { name: 'totalAmount', label: 'Loan Amount', type: 'number', required: true, mono: true },
          { name: 'startDate', label: 'Start Date', type: 'date', required: true },
          { name: 'endDate', label: 'End Date', type: 'date', required: true },
          { name: 'interestRatePercent', label: 'Interest % p.a.', type: 'number', mono: true, hint: "Leave blank for the organisation's rate; fill EMI below to use a fixed amount instead." },
          { name: 'emiAmount', label: 'Fixed EMI (optional)', type: 'number', mono: true },
          { name: 'remarks', label: 'Remarks' },
        ]}
        toPayload={(form) => {
          const p = { ...form };
          if (p.interestRatePercent === '') {
            if (p.emiAmount !== '' && p.emiAmount != null) p.interestRatePercent = null;
            else delete p.interestRatePercent;
          }
          return p;
        }}
        updateFields={[
          { name: 'closureDate', label: 'Closure Date', type: 'date' },
          { name: 'remarks', label: 'Remarks' },
        ]}
        columns={[
          { field: 'vehicleType', label: 'Vehicle' },
          { field: 'totalAmount', label: 'Amount', mono: true, align: 'right', render: (r) => money(r.totalAmount) },
          { field: 'emiAmount', label: 'EMI', mono: true, align: 'right', render: (r) => money(r.emiAmount) },
          { field: 'periodMonths', label: 'Months', mono: true, align: 'right' },
          { field: 'endDate', label: 'Ends', mono: true, render: (r) => fmt.date(r.endDate) },
          { field: 'active', label: 'Status', render: (r) => activeBadge(r.active) },
        ]}
      />
    </div>
  );
}
