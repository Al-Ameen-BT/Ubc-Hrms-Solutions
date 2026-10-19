import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { platformApi, fmt } from '../../api/client';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';

export function OrganisationsPage() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['organisations'],
    queryFn: () => platformApi.organizations(),
  });

  const columns = [
    { field: 'name', label: 'Name' },
    { field: 'code', label: 'Code', mono: true },
    { field: 'bankClassLabel', label: 'Class', render: (row) => row.bankClassLabel || row.bankClass?.replace(/_/g, ' ') || '—' },
    {
      field: 'status',
      label: 'Status',
      render: (row) => <Badge variant={row.status === 'ACTIVE' ? 'success' : row.status === 'SUSPENDED' ? 'danger' : 'default'}>{row.status}</Badge>,
    },
    { field: 'license', label: 'Plan', render: (row) => row.license?.plan || '—' },
    {
      field: 'customDomain',
      label: 'Domain',
      mono: true,
      render: (row) => (row.customDomain ? (
        <span className="domain-cell">
          {row.customDomain}
          {!row.customDomainVerifiedAt && <span className="domain-cell-note">unverified</span>}
        </span>
      ) : '—'),
    },
    { field: 'licenseExpiresAt', label: 'Valid Until', mono: true, render: (row) => fmt.date(row.license?.expiresAt) },
    { field: 'usage', label: 'Users', mono: true, align: 'right', render: (row) => row.usage?.users ?? 0 },
    { field: 'employees', label: 'Employees', mono: true, align: 'right', render: (row) => row.usage?.employees ?? 0 },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Organisations</h1>
        <p>Onboard and manage banks</p>
      </header>

      <Card noPadding>
        <div className="table-toolbar">
          <div />
          <Button onClick={() => navigate('/organisations/new')}>Onboard Bank</Button>
        </div>
        <Table
          columns={columns}
          data={data?.rows || []}
          keyField="id"
          loading={isLoading}
          onRowClick={(row) => navigate(`/organisations/${row.id}`)}
          emptyMessage="No organisations yet."
        />
      </Card>
    </div>
  );
}
