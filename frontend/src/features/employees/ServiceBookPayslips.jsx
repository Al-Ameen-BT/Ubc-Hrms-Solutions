import React from 'react';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { fmt } from '../../api/client';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EARNINGS = ['basic', 'da', 'hra', 'riskAllowance', 'otherAllowance', 'cca', 'conveyance', 'medicalAllowance', 'bonus'];
const DEDUCTIONS = ['pfEmployee', 'vpf', 'welfareFund', 'gsli', 'professionalTax', 'incomeTax', 'festivalAdvance', 'overdraft', 'recurringDeposit', 'lic', 'housingLoan', 'vehicleLoan'];
const label = (key) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

export function ServiceBookPayslips({ payslips = [] }) {
  return <Card title="Finalized Monthly Payslips">
    {payslips.length ? payslips.map(({ id, year, month, status, payslip }) => <details key={id}>
      <summary>{MONTHS[month]} {year} · {status} · Net pay {fmt.money(payslip.netPay)}</summary>
      <div className="stat-grid">
        <div><strong>Earnings</strong>{EARNINGS.filter((key) => payslip.earnings?.[key]).map((key) => <div key={key}>{payslip.directPay && key === 'basic' ? 'Bank-set Gross Salary' : label(key)}: {fmt.money(payslip.earnings[key])}</div>)}<div><strong>Gross: {fmt.money(payslip.earnings?.grossEarnings)}</strong></div></div>
        <div><strong>Deductions</strong>{DEDUCTIONS.filter((key) => payslip.deductions?.[key]).map((key) => <div key={key}>{label(key)}: {fmt.money(payslip.deductions[key])}</div>)}<div><strong>Total: {fmt.money(payslip.deductions?.totalDeductions)}</strong></div></div>
      </div>
    </details>) : <EmptyState title="No finalized payslips yet" description="Approved payroll runs appear here." />}
  </Card>;
}
