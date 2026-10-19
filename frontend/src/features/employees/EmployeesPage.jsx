import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { masterDataApi, fmt } from '../../api/client';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';

export function EmployeesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => masterDataApi.employees(),
  });

  const { data: posts } = useQuery({
    queryKey: ['post-cadres-lite'],
    queryFn: () => masterDataApi.postCadres(),
  });

  const postName = (id) => (posts?.rows || []).find((p) => String(p.id) === String(id))?.name || '—';

  const rows = useMemo(() => {
    const all = data?.rows || [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((e) =>
      `${e.name} ${e.empCode} ${e.department || ''}`.toLowerCase().includes(q)
    );
  }, [data, search]);

  const columns = [
    { field: 'empCode', label: 'Code', mono: true },
    { field: 'name', label: 'Name' },
    { field: 'postCadreId', label: 'Post', render: (row) => postName(row.postCadreId) },
    { field: 'department', label: 'Department', render: (row) => row.department || '—' },
    { field: 'currentBasicPay', label: 'Basic Pay', mono: true, align: 'right', render: (row) => fmt.money(row.currentBasicPay) },
    { field: 'status', label: 'Status', render: (row) => <Badge variant={row.status === 'ACTIVE' ? 'success' : 'default'}>{row.status}</Badge> },
    { field: 'doj', label: 'Date of Joining', mono: true, render: (row) => fmt.date(row.doj) },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Employees</h1>
        <p>Manage employee records and service books</p>
      </header>

      <Card noPadding>
        <div className="table-toolbar">
          <input
            type="search"
            placeholder="Search employees…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input table-search"
          />
          <Button variant="secondary" onClick={() => navigate('/employees/import')}>Bulk Import</Button>
          <Button onClick={() => navigate('/employees/new')}>Add Employee</Button>
        </div>
        <Table
          columns={columns}
          data={rows}
          keyField="id"
          loading={isLoading}
          onRowClick={(row) => navigate(`/employees/${row.id}`)}
          emptyMessage="No employees found."
        />
        <div className="table-pagination">
          <span className="mono">{rows.length} employee{rows.length === 1 ? '' : 's'}</span>
        </div>
      </Card>
    </div>
  );
}
