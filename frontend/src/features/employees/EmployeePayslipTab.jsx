import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { serviceBookApi } from '../../api/extended';
import { downloadFile, fmt } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* Live (estimated) payslip preview — routes/serviceBook.js GET /:id/payslip.
   Not a frozen run line; it recomputes from the employee's current salary,
   the organisation's payroll settings and today's active loans. */
export function EmployeePayslipTab({ employeeId, employeeName }) {
  const toast = useToast();
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const { data, isLoading } = useQuery({
    queryKey: ['emp-payslip', employeeId, month],
    queryFn: () => serviceBookApi.payslip(employeeId, month),
  });

  const download = async () => {
    try {
      await downloadFile(serviceBookApi.payslipPdfUrl(employeeId, month));
    } catch (err) {
      toast.add(err.message || 'Download failed.', 'error');
    }
  };

  const e = data?.earnings;
  const d = data?.deductions;

  const earningRows = e ? [
    ['Basic Pay', e.basic], ['Dearness Allowance', e.da], ['House Rent Allowance', e.hra],
    ['Risk Allowance', e.riskAllowance], ['Other Allowance', e.otherAllowance],
    ['City Compensatory Allowance', e.cca], ['Conveyance', e.conveyance],
    ['Medical Allowance', e.medicalAllowance], ['Bonus', e.bonus],
    ...(e.customAllowances || []).map((c) => [c.name || c.code || 'Allowance', c.amount]),
  ].filter(([, v]) => Number(v)) : [];

  const deductionRows = d ? [
    ['Provident Fund (employee)', d.pfEmployee], ['Voluntary PF', d.vpf],
    ['Welfare Fund', d.welfareFund], ['Group Savings Linked Insurance', d.gsli],
    ['Professional Tax', d.professionalTax], ['Income Tax', d.incomeTax],
    ['Festival Advance', d.festivalAdvance], ['Overdraft', d.overdraft],
    ['Recurring Deposit', d.recurringDeposit], ['LIC', d.lic],
    ['Housing Loan', d.housingLoan], ['Vehicle Loan', d.vehicleLoan],
  ].filter(([, v]) => Number(v)) : [];

  return (
    <div className="stack">
      <Card title="Estimated Payslip" noPadding>
        <div className="table-toolbar">
          <span className="form-note">Live estimate for {employeeName || 'this employee'} — recomputed from current salary and today's loans.</span>
          <div className="row-actions">
            <select className="input" aria-label="Month" value={month} onChange={(ev) => setMonth(Number(ev.target.value))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <Button variant="secondary" onClick={download}>Download PDF</Button>
          </div>
        </div>

        {isLoading ? (
          <p className="form-note" style={{ padding: '1rem' }}>Loading…</p>
        ) : !data ? (
          <EmptyState title="No payslip preview" description="Salary details are not set up for this employee yet." />
        ) : (
          <div className="payslip-grid">
            <div className="payslip-col">
              <h4 className="payslip-heading">Earnings</h4>
              {earningRows.length ? earningRows.map(([label, v]) => (
                <div className="payslip-row" key={label}><span>{label}</span><span className="mono">{fmt.money(v)}</span></div>
              )) : <p className="form-note">No earnings computed.</p>}
              <div className="payslip-row payslip-total"><span>Gross Earnings</span><span className="mono">{fmt.money(e.grossEarnings)}</span></div>
            </div>

            <div className="payslip-col">
              <h4 className="payslip-heading">Deductions</h4>
              {deductionRows.length ? deductionRows.map(([label, v]) => (
                <div className="payslip-row" key={label}><span>{label}</span><span className="mono">{fmt.money(v)}</span></div>
              )) : <p className="form-note">No deductions.</p>}
              <div className="payslip-row payslip-total"><span>Total Deductions</span><span className="mono">{fmt.money(d.totalDeductions)}</span></div>
            </div>
          </div>
        )}
      </Card>

      {data && (
        <>
          <div className="stat-grid">
            <div className="stat-ledger"><div className="stat-ledger-label">Net Pay</div><div className="stat-ledger-value mono">{fmt.money(data.netPay)}</div></div>
            <div className="stat-ledger"><div className="stat-ledger-label">Payable Days</div><div className="stat-ledger-value mono">{data.attendance?.payableDays ?? '—'}</div></div>
            <div className="stat-ledger"><div className="stat-ledger-label">LOP Days</div><div className="stat-ledger-value mono">{data.attendance?.lopDays ?? 0}</div></div>
            <div className="stat-ledger"><div className="stat-ledger-label">Paid Days</div><div className="stat-ledger-value mono">{data.attendance?.paidDays ?? '—'}</div></div>
            <div className="stat-ledger"><div className="stat-ledger-label">PF (Employer)</div><div className="stat-ledger-value mono">{fmt.money(data.deductions?.pfEmployer)}</div></div>
          </div>
          {data.note && <p className="form-note">{data.note}</p>}
        </>
      )}
    </div>
  );
}
