import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { payrollApi, fmt } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { StatLedger } from '../../components/ui/StatLedger';
import { useNavigate } from 'react-router-dom';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function statusVariant(status) {
  if (status === 'PAID') return 'success';
  if (status === 'APPROVED') return 'info';
  if (status === 'REJECTED') return 'danger';
  return 'warning';
}

export function PayrollPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const orgId = user?.organizationId;

  const { data, isLoading } = useQuery({
    queryKey: ['payroll-runs', orgId],
    queryFn: () => payrollApi.runs(orgId),
    enabled: !!orgId,
  });

  const rows = data?.rows || [];
  const paidNet = rows.filter((r) => r.status === 'PAID').reduce((s, r) => s + Number(r.totalNetPay || 0), 0);

  const columns = [
    { field: 'month', label: 'Period', mono: true, render: (row) => `${MONTHS[(row.month || 1) - 1]} ${row.year}` },
    { field: 'status', label: 'Status', render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
    { field: 'employeeCount', label: 'Employees', mono: true, align: 'right' },
    { field: 'totalGrossEarnings', label: 'Gross', mono: true, align: 'right', render: (row) => fmt.money(row.totalGrossEarnings) },
    { field: 'totalDeductions', label: 'Deductions', mono: true, align: 'right', render: (row) => fmt.money(row.totalDeductions) },
    { field: 'totalNetPay', label: 'Net Pay', mono: true, align: 'right', render: (row) => fmt.money(row.totalNetPay) },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Payroll</h1>
        <p>Process and track monthly payroll runs</p>
      </header>

      <div className="stat-grid">
        <StatLedger label="Total Runs" value={rows.length} />
        <StatLedger label="Paid Net Pay" value={fmt.money(paidNet)} />
        <StatLedger label="Awaiting Action" value={rows.filter((r) => ['PROCESSED', 'APPROVED'].includes(r.status)).length} redInk />
      </div>

      <Card noPadding>
        <div className="table-toolbar">
          <div />
          <Button onClick={() => navigate('/payroll/new')}>New Payroll Run</Button>
        </div>
        <Table
          columns={columns}
          data={rows}
          keyField="id"
          loading={isLoading}
          onRowClick={(row) => navigate(`/payroll/${row.id}`)}
          emptyMessage="No payroll runs yet."
        />
      </Card>
    </div>
  );
}
