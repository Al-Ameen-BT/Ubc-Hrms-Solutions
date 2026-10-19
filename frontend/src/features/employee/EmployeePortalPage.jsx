import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { masterDataApi, fmt } from '../../api/client';
import { leaveApi } from '../../api/extended';
import { useAuth } from '../../auth/AuthContext';
import { Card } from '../../components/ui/Card';
import { StatLedger } from '../../components/ui/StatLedger';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';

export function EmployeePortalPage() {
  const { user } = useAuth();
  const employeeId = user?.employeeId;

  const { data: employee } = useQuery({
    queryKey: ['my-employee', employeeId],
    queryFn: () => masterDataApi.employee(employeeId),
    enabled: !!employeeId,
  });

  const { data: balances } = useQuery({
    queryKey: ['my-leave-balances', employeeId],
    queryFn: () => leaveApi.employeeBalances(employeeId),
    enabled: !!employeeId,
  });

  const { data: book } = useQuery({
    queryKey: ['my-service-book', employeeId],
    queryFn: () => masterDataApi.serviceBook(employeeId),
    enabled: !!employeeId,
  });

  if (!employeeId) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>My Dashboard</h1>
          <p>Your profile, service book, and leave balances</p>
        </header>
        <Card>
          <EmptyState
            title="No employee record linked"
            description="Your account is not linked to an employee record yet. Ask your HR administrator to link it."
          />
        </Card>
      </div>
    );
  }

  const totalLeave = (balances?.rows || []).reduce((sum, b) => sum + Number(b.closingBalance || 0), 0);
  const timeline = book?.timeline || [];

  return (
    <div className="page">
      <header className="page-header">
        <h1>{employee?.name || 'My Dashboard'}</h1>
        <p className="mono">{employee ? `${employee.empCode} · ${employee.designation || '—'}` : ''}</p>
      </header>

      <div className="stat-grid">
        <StatLedger label="Basic Pay" value={fmt.money(employee?.currentBasicPay)} />
        <StatLedger label="Leave Balance" value={`${totalLeave} day${totalLeave === 1 ? '' : 's'}`} />
        <StatLedger label="Date of Joining" value={fmt.date(employee?.doj)} />
        <StatLedger label="Retirement" value={fmt.date(book?.effectiveRetirementDate)} />
      </div>

      <Card title="Leave Balances" noPadding>
        <table className="table">
          <thead>
            <tr>
              <th className="table-th">Leave Type</th>
              <th className="table-th table-th-right">Opening</th>
              <th className="table-th table-th-right">Accrued</th>
              <th className="table-th table-th-right">Availed</th>
              <th className="table-th table-th-right">Closing</th>
            </tr>
          </thead>
          <tbody>
            {(balances?.rows || []).length ? balances.rows.map((b) => (
              <tr key={b.id} className="table-row">
                <td className="table-td">{b.LeaveType?.name || '—'}</td>
                <td className="table-td table-td-right mono">{Number(b.openingBalance)}</td>
                <td className="table-td table-td-right mono">{Number(b.accrued)}</td>
                <td className="table-td table-td-right mono">{Number(b.availed)}</td>
                <td className="table-td table-td-right mono">{Number(b.closingBalance)}</td>
              </tr>
            )) : (
              <tr><td colSpan={5}><EmptyState title="No leave balances yet" /></td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="My Service Book" noPadding>
        <table className="table">
          <thead>
            <tr>
              <th className="table-th">Date</th>
              <th className="table-th">Event</th>
              <th className="table-th table-th-right">Pay</th>
            </tr>
          </thead>
          <tbody>
            {timeline.length ? timeline.map((t) => (
              <tr key={t.id} className="table-row">
                <td className="table-td mono">{fmt.date(t.eventDate)}</td>
                <td className="table-td">{t.eventType?.replace(/_/g, ' ')}</td>
                <td className="table-td table-td-right mono">{t.PayHistoryEntry ? fmt.money(t.PayHistoryEntry.newBasicPay) : '—'}</td>
              </tr>
            )) : (
              <tr><td colSpan={3}><EmptyState title="No entries yet" description="Your service events appear here as they are posted." /></td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
