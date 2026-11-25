import React, { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { masterDataApi, fmt } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import { useToast } from '../../components/ui/Toast';

export function EmployeesPage({ embedded = false }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { canPermission } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveError, setArchiveError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => masterDataApi.employees(),
  });

  const { data: posts } = useQuery({
    queryKey: ['post-cadres-lite'],
    queryFn: () => masterDataApi.postCadres(),
    enabled: canPermission('compensation.view', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'DEPARTMENT_HEAD']),
  });

  const postName = (id) => (posts?.rows || []).find((p) => String(p.id) === String(id))?.name || '—';
  const archiveMutation = useMutation({
    mutationFn: employee => masterDataApi.archiveEmployee(employee.id),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['employees'] }); setArchiveTarget(null); setArchiveError(''); toast.add('Employee and linked access archived. Historical records were retained.', 'success'); },
    onError: error => setArchiveError(error.message || 'Could not archive this employee.'),
  });

  const rows = useMemo(() => {
    const all = data?.rows || [];
    const q = search.trim().toLowerCase();
    const branchId = params.get('branchId');
    const departmentId = params.get('departmentId');
    const dojMonth = params.get('dojMonth');
    const confirmationMonth = params.get('confirmationMonth');
    return all.filter((e) => (
      (!q || `${e.name} ${e.empCode} ${e.department || ''} stage ${e.CurrentPayStage?.stageNo ?? e.currentStageId ?? ''}`.toLowerCase().includes(q))
      && (!branchId || String(e.branchId || '') === branchId)
      && (!departmentId || (departmentId === 'unassigned' ? !e.departmentId : String(e.departmentId || '') === departmentId))
      && (!dojMonth || String(e.doj || '').startsWith(dojMonth))
      && (!confirmationMonth || String(e.dateOfConfirmation || '').startsWith(confirmationMonth))
    ));
  }, [data, search, params]);

  const columns = [
    { field: 'empCode', label: 'Code', mono: true },
    { field: 'name', label: 'Name' },
    { field: 'postCadreId', label: 'Post', render: (row) => postName(row.postCadreId) },
    {
      field: 'salaryStage',
      label: 'Salary Stage',
      render: (row) => {
        if (row.directPay) return <Badge variant="secondary">Direct Pay</Badge>;
        const stageNo = row.CurrentPayStage?.stageNo;
        if (stageNo != null) return <Badge variant="primary">Stage {stageNo}</Badge>;
        if (row.currentStageId != null) return <Badge variant="primary">Stage #{row.currentStageId}</Badge>;
        return <span className="text-muted">—</span>;
      },
    },
    { field: 'department', label: 'Department', render: (row) => row.department || '—' },
    { field: 'currentBasicPay', label: 'Basic Pay', mono: true, align: 'right', render: (row) => fmt.money(row.currentBasicPay) },
    { field: 'status', label: 'Status', render: (row) => <Badge variant={row.status === 'ACTIVE' ? 'success' : 'default'}>{row.status}</Badge> },
    { field: 'doj', label: 'Date of Joining', mono: true, render: (row) => fmt.date(row.doj) },
    ...(canPermission('people.edit', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER']) ? [{ field: 'actions', label: '', sortable: false, render: row => row.status === 'ACTIVE' ? <Button size="sm" variant="danger" onClick={event => { event.stopPropagation(); setArchiveError(''); setArchiveTarget(row); }}>Archive</Button> : null }] : []),
  ];

  return (
    <div className={embedded ? 'people-view' : 'page'}>
      {!embedded && <header className="page-header">
        <h1>Employees</h1>
        <p>Manage employee records and service books</p>
      </header>}

      <Card noPadding>
        <div className="table-toolbar">
          <input
            type="search"
            placeholder="Search employees…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input table-search"
          />
          {canPermission('people.create', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER']) && <Button variant="secondary" onClick={() => navigate('/employees/import')}>Bulk Import</Button>}
          {canPermission('people.create', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER']) && <Button onClick={() => navigate('/employees/new')}>Add Employee</Button>}
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
      <ConfirmationModal
        open={archiveTarget != null}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => archiveMutation.mutate(archiveTarget)}
        title="Archive Employee"
        itemName={archiveTarget?.name}
        details={{ 'Employee code': archiveTarget?.empCode, 'Branch': archiveTarget?.branchName, 'Department': archiveTarget?.department }}
        warningMessage="This ends the employee's active organisation assignment, responsibilities, roles, and linked login access. Payroll, attendance, leave, service, approval, and audit history remain unchanged and available for reporting."
        confirmLabel="Confirm Archive"
        confirmVariant="danger"
        requireVerification={false}
        loading={archiveMutation.isPending}
        error={archiveError}
      />
    </div>
  );
}
