import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { masterDataApi, platformApi, downloadFile } from '../../api/client';
import { readFileAsText } from '../../lib/files';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

/* Bulk employee creation from a CSV (routes/serviceBook.js POST
   /employees/bulk-import). Posts and pay scales are referenced by CODE. */
export function BulkImportPage() {
  const navigate = useNavigate();
  const { isSuperAdmin, user } = useAuth();
  const toast = useToast();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);

  const { data: orgs } = useQuery({
    queryKey: ['bulk-import-orgs'],
    queryFn: () => platformApi.organizations({ limit: 500 }),
    enabled: isSuperAdmin,
  });

  const importMutation = useMutation({
    mutationFn: () => masterDataApi.bulkImport({
      csv,
      organizationId: isSuperAdmin ? Number(organizationId) : undefined,
    }),
    onSuccess: (res) => {
      const summary = res?.summary || {};
      setResults({ rows: res?.data || [], summary });
      setError('');
      toast.add(`Import finished — ${summary.created || 0} created, ${summary.failed || 0} failed.`, summary.failed ? 'info' : 'success');
    },
    onError: (err) => setError(err.message || 'Import failed.'),
  });

  const onFile = async (file) => {
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      setCsv(text);
      setFileName(file.name);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const downloadTemplate = async () => {
    try {
      await downloadFile(masterDataApi.bulkTemplateUrl);
    } catch (err) {
      toast.add(err.message || 'Download failed.', 'error');
    }
  };

  const columns = [
    { field: 'row', label: 'Row', mono: true, align: 'right' },
    { field: 'empCode', label: 'Employee Code', mono: true },
    { field: 'status', label: 'Result', render: (r) => <Badge variant={r.status === 'created' ? 'success' : 'danger'}>{r.status}</Badge> },
    { field: 'message', label: 'Detail', render: (r) => r.message || '—' },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Bulk Import Employees</h1>
            <p>Create many employees at once from a CSV. Posts and pay scales are referenced by their codes.</p>
          </div>
          <div className="page-header-actions">
            <Button variant="secondary" onClick={() => navigate('/employees')}>Back</Button>
          </div>
        </div>
      </header>

      <Card title="1 · Get the template">
        <p>
          Download the template, fill in one row per employee, then upload it. Required columns are
          <span className="mono"> empCode</span>, <span className="mono">name</span>, <span className="mono">doj</span> and
          <span className="mono"> postCode</span>. PAN, Aadhaar, bank details and other extras are added afterwards
          on each employee's own record.
        </p>
        <div className="card-actions">
          <Button variant="secondary" onClick={downloadTemplate}>Download CSV template</Button>
        </div>
      </Card>

      <Card title="2 · Upload the filled CSV">
        {isSuperAdmin && (
          <div className="field">
            <label className="field-label" htmlFor="bi-org">Organisation <span className="field-required">*</span></label>
            <select id="bi-org" className="input" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
              <option value="">Select…</option>
              {(orgs?.organizations || orgs?.rows || []).map((o) => <option key={o.id} value={o.id}>{o.code} — {o.name}</option>)}
            </select>
          </div>
        )}

        <div className="field">
          <label className="field-label" htmlFor="bi-file">CSV file</label>
          <input id="bi-file" className="input" type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
          {fileName && <p className="field-hint">Loaded {fileName}</p>}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="bi-text">…or paste the CSV</label>
          <textarea
            id="bi-text"
            className="input mono"
            rows={8}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder="empCode,name,doj,postCode&#10;E101,Jane Doe,2015-06-01,SG_JR_CLERK"
          />
        </div>

        {error && <div className="auth-error" role="alert">{error}</div>}

        <div className="card-actions">
          <Button
            loading={importMutation.isPending}
            disabled={!csv.trim() || (isSuperAdmin && !organizationId)}
            onClick={() => { setError(''); setResults(null); importMutation.mutate(); }}
          >
            Import Employees
          </Button>
        </div>
      </Card>

      {results && (
        <Card title={`Results — ${results.summary.created || 0} created, ${results.summary.failed || 0} failed of ${results.summary.total || 0}`} noPadding>
          <Table columns={columns} data={results.rows} keyField="row" emptyMessage="No rows processed." />
        </Card>
      )}
    </div>
  );
}
