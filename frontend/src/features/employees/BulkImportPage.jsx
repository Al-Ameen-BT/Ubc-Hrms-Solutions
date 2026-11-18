import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { masterDataApi, platformApi, downloadFile } from '../../api/client';
import { readFileAsText, readFileAsDataUrl } from '../../lib/files';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

/* Bulk employee import workspace supporting formatted Excel (.xlsx) and CSV templates,
   live bank reference codes, data structure guide, and line-by-line pre-import preview. */
export function BulkImportPage() {
  const navigate = useNavigate();
  const { isSuperAdmin, user } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'guide' | 'references'
  const [inputMode, setInputMode] = useState('file'); // 'file' | 'text'
  const [fileDataUrl, setFileDataUrl] = useState('');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [error, setError] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [results, setResults] = useState(null);

  // Super-admin bank list
  const { data: orgs } = useQuery({
    queryKey: ['bulk-import-orgs'],
    queryFn: () => platformApi.organizations({ limit: 500 }),
    enabled: isSuperAdmin,
  });

  // Effective organisation id
  const targetOrgId = isSuperAdmin ? organizationId : (user?.organizationId || '');

  // Live Bank Reference codes and structured field groups
  const { data: referenceData, isLoading: loadingRefs } = useQuery({
    queryKey: ['bulk-import-references', targetOrgId],
    queryFn: () => masterDataApi.bulkReferences(targetOrgId),
    enabled: !isSuperAdmin || Boolean(targetOrgId),
  });

  const fieldGroups = referenceData?.fieldGroups || [];
  const bankPosts = referenceData?.posts || [];
  const bankPayScales = referenceData?.scales || [];

  // Reset file/text state when org changes
  useEffect(() => {
    setPreviewData(null);
    setResults(null);
    setError('');
  }, [organizationId]);

  // Pre-import preview mutation
  const previewMutation = useMutation({
    mutationFn: (payload) => masterDataApi.bulkImportPreview(payload),
    onSuccess: (res) => {
      setPreviewData(res);
      setError('');
      const invalidCount = res?.summary?.invalid || 0;
      if (invalidCount > 0) {
        toast.add(`Validation found ${invalidCount} row(s) with errors. Review before importing.`, 'warning');
      } else {
        toast.add(`All ${res?.summary?.total || 0} rows validated successfully! Ready to import.`, 'success');
      }
    },
    onError: (err) => {
      setPreviewData(null);
      setError(err.message || 'Validation failed. Please verify the file structure.');
    },
  });

  // Bulk import execution mutation
  const importMutation = useMutation({
    mutationFn: (payload) => masterDataApi.bulkImport(payload),
    onSuccess: (res) => {
      const summary = res?.summary || {};
      setResults({ rows: res?.data || [], summary });
      setError('');
      toast.add(
        `Import finished: ${summary.created || 0} created, ${summary.failed || 0} failed.`,
        summary.failed ? 'warning' : 'success'
      );
    },
    onError: (err) => setError(err.message || 'Bulk import failed.'),
  });

  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    setResults(null);
    setFileName(file.name);

    try {
      const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.type.includes('spreadsheetml');
      if (isXlsx) {
        const dataUrl = await readFileAsDataUrl(file);
        setFileDataUrl(dataUrl);
        setCsv('');
        previewMutation.mutate({
          fileDataUrl: dataUrl,
          organizationId: isSuperAdmin ? Number(organizationId) : undefined,
        });
      } else {
        const text = await readFileAsText(file);
        setCsv(text);
        setFileDataUrl('');
        previewMutation.mutate({
          csv: text,
          organizationId: isSuperAdmin ? Number(organizationId) : undefined,
        });
      }
    } catch (err) {
      setError(err.message || 'Could not read the uploaded file.');
    }
  };

  const handleTextPreview = () => {
    if (!csv.trim()) return;
    setError('');
    setResults(null);
    previewMutation.mutate({
      csv,
      organizationId: isSuperAdmin ? Number(organizationId) : undefined,
    });
  };

  const runImport = () => {
    setError('');
    setResults(null);
    const payload = {
      organizationId: isSuperAdmin ? Number(organizationId) : undefined,
    };
    if (fileDataUrl) {
      payload.fileDataUrl = fileDataUrl;
    } else {
      payload.csv = csv;
    }
    importMutation.mutate(payload);
  };

  const downloadXlsxTemplate = async () => {
    try {
      const query = targetOrgId ? `?organizationId=${encodeURIComponent(targetOrgId)}` : '';
      await downloadFile(`${masterDataApi.bulkTemplateXlsxUrl}${query}`, 'Employee_Bulk_Import_Template.xlsx');
    } catch (err) {
      toast.add(err.message || 'Download failed.', 'error');
    }
  };

  const downloadCsvTemplate = async () => {
    try {
      await downloadFile(masterDataApi.bulkTemplateUrl, 'Employee_Bulk_Import_Template.csv');
    } catch (err) {
      toast.add(err.message || 'Download failed.', 'error');
    }
  };

  // Preview columns
  const previewColumns = [
    { field: 'row', label: 'Row', mono: true, align: 'right', width: '60px' },
    {
      field: 'valid',
      label: 'Status',
      width: '100px',
      render: (r) => (
        <Badge variant={r.valid ? 'success' : 'danger'}>
          {r.valid ? 'Ready' : 'Invalid'}
        </Badge>
      ),
    },
    { field: 'empCode', label: 'Emp Code', mono: true, width: '110px' },
    { field: 'name', label: 'Name', width: '160px' },
    { field: 'postCode', label: 'Post Code', mono: true, width: '120px' },
    { field: 'payScaleCode', label: 'Pay Scale', mono: true, width: '120px' },
    { field: 'currentBasicPay', label: 'Basic Pay', mono: true, align: 'right', width: '100px', render: (r) => r.currentBasicPay ? `₹${Number(r.currentBasicPay).toLocaleString('en-IN')}` : '—' },
    {
      field: 'errors',
      label: 'Issues / Notes',
      render: (r) => {
        if (!r.errors || r.errors.length === 0) {
          return <span style={{ color: 'var(--success)' }}>✓ Validated</span>;
        }
        return (
          <span style={{ color: 'var(--danger)', fontWeight: 500 }}>
            {r.errors.join('; ')}
          </span>
        );
      },
    },
  ];

  // Import results columns
  const resultColumns = [
    { field: 'row', label: 'Row', mono: true, align: 'right', width: '60px' },
    { field: 'empCode', label: 'Employee Code', mono: true, width: '120px' },
    {
      field: 'status',
      label: 'Result',
      width: '100px',
      render: (r) => (
        <Badge variant={r.status === 'created' ? 'success' : 'danger'}>
          {r.status === 'created' ? 'Created' : 'Failed'}
        </Badge>
      ),
    },
    { field: 'message', label: 'Detail', render: (r) => r.message || '—' },
  ];

  const hasData = Boolean(fileDataUrl || csv.trim());
  const canImport = hasData && (!isSuperAdmin || Boolean(organizationId)) && (!previewData || previewData.summary?.valid > 0);

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Bulk Import Employees</h1>
            <p>
              Import bank employees with formatted Excel (.xlsx) workbooks or CSV files.
              Pre-check records against active bank posts, pay scales, and validation rules before importing.
            </p>
          </div>
          <div className="page-header-actions">
            <Button variant="secondary" onClick={() => navigate('/people')}>Back to People</Button>
          </div>
        </div>
      </header>

      {/* Navigation tabs */}
      <div className="tabs">
        <button
          type="button"
          className={`tab ${activeTab === 'upload' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          Import & Preview
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'guide' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('guide')}
        >
          Data Structure Guide
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'references' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('references')}
        >
          Bank Reference Codes ({bankPosts.length} Posts, {bankPayScales.length} Scales)
        </button>
      </div>

      {isSuperAdmin && (
        <Card style={{ marginBottom: 'var(--space-4)' }}>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-label" htmlFor="bi-org">
              Target Organisation <span className="field-required">*</span>
            </label>
            <select
              id="bi-org"
              className="input"
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
            >
              <option value="">Select bank organisation…</option>
              {(orgs?.organizations || orgs?.rows || []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} — {o.name}
                </option>
              ))}
            </select>
            <p className="field-hint">
              Selecting an organisation tailors the downloaded template dropdowns and reference codes to this bank.
            </p>
          </div>
        </Card>
      )}

      {/* TAB 1: UPLOAD & PREVIEW */}
      {activeTab === 'upload' && (
        <>
          <Card title="Step 1 · Download Structured Template">
            <p style={{ margin: '0 0 var(--space-3)' }}>
              Download our arranged workbook template. It includes color-banded category headers, formatted text columns
              (to prevent Excel from altering dates or leading zeroes), built-in validation dropdowns for tax and employment
              types, and a second sheet containing your bank&apos;s active Post and Pay Scale codes.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <Button variant="primary" onClick={downloadXlsxTemplate}>
                Download Formatted Excel Template (.xlsx)
              </Button>
              <Button variant="secondary" onClick={downloadCsvTemplate}>
                Download CSV Template (.csv)
              </Button>
            </div>
          </Card>

          <Card title="Step 2 · Upload & Validate" style={{ marginTop: 'var(--space-4)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <button
                type="button"
                className={`tab ${inputMode === 'file' ? 'tab-active' : ''}`}
                style={{ padding: '4px 12px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                onClick={() => setInputMode('file')}
              >
                File Upload (.xlsx, .csv)
              </button>
              <button
                type="button"
                className={`tab ${inputMode === 'text' ? 'tab-active' : ''}`}
                style={{ padding: '4px 12px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                onClick={() => setInputMode('text')}
              >
                Paste CSV Text
              </button>
            </div>

            {inputMode === 'file' ? (
              <div className="field">
                <label className="field-label" htmlFor="bi-file">
                  Choose Excel (.xlsx) or CSV (.csv) file
                </label>
                <input
                  id="bi-file"
                  className="input"
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                {fileName && (
                  <p className="field-hint" style={{ marginTop: 'var(--space-2)', fontWeight: 500 }}>
                    Loaded file: <span className="mono">{fileName}</span>
                  </p>
                )}
              </div>
            ) : (
              <div className="field">
                <label className="field-label" htmlFor="bi-text">Paste CSV text below</label>
                <textarea
                  id="bi-text"
                  className="input mono"
                  rows={7}
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  placeholder="empCode,name,doj,postCode,payScaleCode,currentBasicPay&#10;E101,Jane Doe,2020-01-15,SG_JR_CLERK,SCALE_CLK,25000"
                />
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <Button
                    variant="secondary"
                    disabled={!csv.trim()}
                    loading={previewMutation.isPending}
                    onClick={handleTextPreview}
                  >
                    Validate CSV
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <div className="auth-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
                {error}
              </div>
            )}

            {/* PREVIEW SECTION */}
            {previewData && (
              <div style={{ marginTop: 'var(--space-5)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 'var(--text-base)' }}>Pre-Import Validation Preview</h3>
                    <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                      Total: {previewData.summary?.total || 0} rows |{' '}
                      <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                        {previewData.summary?.valid || 0} Ready to import
                      </span>
                      {previewData.summary?.invalid > 0 && (
                        <span style={{ color: 'var(--danger)', fontWeight: 600, marginLeft: '8px' }}>
                          · {previewData.summary?.invalid} Row(s) need correction
                        </span>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    loading={importMutation.isPending}
                    disabled={!canImport || (previewData.summary?.valid === 0)}
                    onClick={runImport}
                  >
                    Import {previewData.summary?.valid || 0} Valid Employee(s)
                  </Button>
                </div>

                <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                  <Table
                    columns={previewColumns}
                    data={previewData.data || []}
                    keyField="row"
                    emptyMessage="No rows in preview."
                  />
                </div>
              </div>
            )}

            {!previewData && hasData && (
              <div className="card-actions" style={{ marginTop: 'var(--space-4)' }}>
                <Button
                  loading={previewMutation.isPending || importMutation.isPending}
                  disabled={!canImport}
                  onClick={runImport}
                >
                  Import Employees Directly
                </Button>
              </div>
            )}
          </Card>

          {/* RESULTS SECTION */}
          {results && (
            <Card
              title={`Import Summary: ${results.summary.created || 0} created, ${results.summary.failed || 0} failed of ${results.summary.total || 0}`}
              noPadding
              style={{ marginTop: 'var(--space-4)' }}
            >
              <Table columns={resultColumns} data={results.rows} keyField="row" emptyMessage="No rows processed." />
            </Card>
          )}
        </>
      )}

      {/* TAB 2: DATA STRUCTURE GUIDE */}
      {activeTab === 'guide' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Card title="Arranged Employee Data Structure (5 Categories)">
            <p>
              The employee data in the Excel workbook is organized into 5 functional categories to make input clear and prevent
              formatting mistakes. Below is the detailed schema:
            </p>
          </Card>

          {fieldGroups.map((group) => (
            <Card key={group.code} title={group.name}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
                {group.fields.map((f) => (
                  <div
                    key={f.key}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: 'var(--space-3)',
                      background: 'var(--bg-card)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600 }}>{f.label}</span>
                      <Badge variant={f.required ? 'danger' : 'default'}>
                        {f.required ? 'Required' : 'Optional'}
                      </Badge>
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
                      Key: <code className="mono">{f.key}</code>
                    </div>
                    <p style={{ margin: '0 0 6px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                      {f.description}
                    </p>
                    {f.example && (
                      <div style={{ fontSize: 'var(--text-xs)' }}>
                        <span style={{ color: 'var(--text-tertiary)' }}>Example: </span>
                        <code className="mono" style={{ background: 'var(--bg-glass)', padding: '1px 4px', borderRadius: '3px' }}>
                          {f.example}
                        </code>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* TAB 3: BANK REFERENCE CODES */}
      {activeTab === 'references' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Card title="Active Post Cadres (Designations)">
            <p style={{ marginBottom: 'var(--space-3)' }}>
              Use the exact <span className="mono">Code</span> in the <span className="mono">postCode</span> column of your import sheet.
            </p>
            {bankPosts.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)' }}>No post cadres found for this bank.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--space-3)' }}>
                {bankPosts.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: 'var(--space-3)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <code className="mono" style={{ fontWeight: 700, color: 'var(--accent)' }}>{p.code}</code>
                      <Button
                        variant="ghost"
                        style={{ padding: '2px 6px', fontSize: '11px', minHeight: 'auto' }}
                        onClick={() => {
                          navigator.clipboard.writeText(p.code);
                          toast.add(`Copied ${p.code}`, 'info');
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                    <div style={{ marginTop: '4px', fontSize: 'var(--text-sm)', fontWeight: 500 }}>{p.name}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Active Pay Scales">
            <p style={{ marginBottom: 'var(--space-3)' }}>
              Use the exact <span className="mono">Code</span> in the <span className="mono">payScaleCode</span> column of your import sheet.
            </p>
            {bankPayScales.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)' }}>No pay scales found for this bank.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
                {bankPayScales.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: 'var(--space-3)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <code className="mono" style={{ fontWeight: 700, color: 'var(--accent)' }}>{s.code}</code>
                      <Button
                        variant="ghost"
                        style={{ padding: '2px 6px', fontSize: '11px', minHeight: 'auto' }}
                        onClick={() => {
                          navigator.clipboard.writeText(s.code);
                          toast.add(`Copied ${s.code}`, 'info');
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                    <div style={{ marginTop: '4px', fontSize: 'var(--text-sm)', fontWeight: 500 }}>{s.name}</div>
                    {s.scaleExpression && (
                      <div style={{ marginTop: '4px', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        {s.scaleExpression}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
