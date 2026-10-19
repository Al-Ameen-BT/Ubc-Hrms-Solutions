import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { arrearsApi } from '../../api/extended';
import { openFile, fmt } from '../../api/client';
import { readFileAsDataUrl, assertUploadable, humanSize } from '../../lib/files';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

const NEXT_STATUS = { DRAFT: 'APPROVED', APPROVED: 'ACTIVE', ACTIVE: 'CLOSED' };

/* One DA revision: its metadata, attached GO scan, the per-employee arrears
   cases it produced, and the calculate/status workflow. */
export function DaRevisionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [docFile, setDocFile] = useState(null);

  const { data: revision, isLoading } = useQuery({
    queryKey: ['da-revision', id],
    queryFn: () => arrearsApi.revisionDetail(id),
  });

  const { data: cases } = useQuery({
    queryKey: ['da-revision-cases', id],
    queryFn: () => arrearsApi.casesForRevision(id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['da-revision', id] });
    queryClient.invalidateQueries({ queryKey: ['da-revision-cases', id] });
  };

  const advance = useMutation({
    mutationFn: (status) => arrearsApi.setRevisionStatus(id, status),
    onSuccess: () => { invalidate(); toast.add('Revision status updated.', 'success'); },
    onError: (err) => toast.add(err.message || 'Status change refused.', 'error'),
  });

  const calculate = useMutation({
    mutationFn: () => arrearsApi.calculate(id),
    onSuccess: (res) => { invalidate(); toast.add(`Calculated arrears for ${res.employeeCount} employee(s).`, 'success'); },
    onError: (err) => toast.add(err.message || 'Calculation failed.', 'error'),
  });

  const uploadDoc = useMutation({
    mutationFn: async () => {
      assertUploadable(docFile);
      const dataUrl = await readFileAsDataUrl(docFile);
      return arrearsApi.uploadRevisionDocument(id, { label: docFile.name, dataUrl });
    },
    onSuccess: () => { invalidate(); setDocFile(null); toast.add('Government Order scan uploaded.', 'success'); },
    onError: (err) => toast.add(err.message || 'Upload failed.', 'error'),
  });

  const removeDoc = useMutation({
    mutationFn: () => arrearsApi.deleteRevisionDocument(id),
    onSuccess: () => { invalidate(); toast.add('Scan removed.', 'success'); },
    onError: (err) => toast.add(err.message || 'Could not remove.', 'error'),
  });

  if (isLoading) return <div className="page"><p>Loading…</p></div>;
  if (!revision) return <div className="page"><p>DA revision not found.</p></div>;

  const r = revision;
  const doc = r.document;
  const statusVariant = r.status === 'ACTIVE' ? 'success' : r.status === 'DRAFT' ? 'warning' : r.status === 'CLOSED' ? 'info' : 'default';
  const rows = cases?.rows || [];
  const outstanding = rows.reduce((s, c) => s + Number(c.effectiveTotalAmount || 0), 0);

  const caseColumns = [
    { field: 'empCode', label: 'Code', mono: true },
    { field: 'employeeName', label: 'Employee' },
    { field: 'monthsCount', label: 'Months', mono: true, align: 'right' },
    { field: 'totalCalculatedAmount', label: 'Calculated', mono: true, align: 'right', render: (x) => fmt.money(x.totalCalculatedAmount) },
    { field: 'effectiveTotalAmount', label: 'Effective', mono: true, align: 'right', render: (x) => fmt.money(x.effectiveTotalAmount) },
    { field: 'paymentMode', label: 'Plan', render: (x) => (x.paymentMode === 'NONE' ? '—' : <Badge variant="info">{x.paymentMode.replace(/_/g, ' ')}</Badge>) },
    { field: 'status', label: 'Status', render: (x) => <Badge variant={x.status === 'FULLY_PAID' ? 'success' : x.status === 'CALCULATED' ? 'warning' : 'info'}>{x.status.replace(/_/g, ' ')}</Badge> },
    {
      field: 'actions', label: '', sortable: false,
      render: (x) => (
        <div className="row-actions">
          <Button variant="secondary" size="sm" onClick={() => navigate(`/arrears-cases/${x.id}`)}>Open</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1>{r.orderNumber || 'DA Revision'}</h1>
            <p className="mono">
              Effective {fmt.date(r.effectiveFrom)}{r.effectiveTo ? ` → ${fmt.date(r.effectiveTo)}` : ''} · Revised DA {Number(r.revisedDaPercent)}%
            </p>
          </div>
          <div className="page-header-actions">
            <Badge variant={statusVariant}>{r.status}</Badge>
            <Button variant="secondary" onClick={() => navigate('/arrears')}>Back</Button>
          </div>
        </div>
      </header>

      <div className="stat-grid">
        <div className="stat-ledger"><div className="stat-ledger-label">Previous DA</div><div className="stat-ledger-value mono">{Number(r.previousDaPercent)}%</div></div>
        <div className="stat-ledger"><div className="stat-ledger-label">Increase</div><div className="stat-ledger-value mono">+{Number(r.increasePercent)}%</div></div>
        <div className="stat-ledger"><div className="stat-ledger-label">Revised DA</div><div className="stat-ledger-value mono">{Number(r.revisedDaPercent)}%</div></div>
        <div className="stat-ledger"><div className="stat-ledger-label">Cases</div><div className="stat-ledger-value mono">{rows.length}</div></div>
        <div className="stat-ledger"><div className="stat-ledger-label">Outstanding</div><div className="stat-ledger-value mono red-ink">{fmt.money(outstanding)}</div></div>
      </div>

      <div className="stack">
        <Card title="Government Order Scan">
          {doc?.id ? (
            <div className="row-actions" style={{ justifyContent: 'space-between' }}>
              <span className="form-note">{doc.label || 'scan'} · {humanSize(doc.sizeBytes)} · {doc.mimeType}</span>
              <div className="row-actions">
                <Button variant="secondary" size="sm" onClick={() => openFile(arrearsApi.revisionDocumentFileUrl(id)).catch((e) => toast.add(e.message, 'error'))}>View</Button>
                <Button variant="secondary" size="sm" loading={removeDoc.isPending} onClick={() => { if (window.confirm('Remove this scan?')) removeDoc.mutate(); }}>Remove</Button>
              </div>
            </div>
          ) : (
            <div className="stack">
              <p className="form-note">Attach the scanned Government Order so the revision can be verified against it.</p>
              <div className="field">
                <label className="field-label" htmlFor="doc-file">File</label>
                <input id="doc-file" className="input" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
              </div>
              <div className="card-actions">
                <Button loading={uploadDoc.isPending} disabled={!docFile} onClick={() => uploadDoc.mutate()}>Upload Scan</Button>
              </div>
            </div>
          )}
        </Card>

        <Card title="Workflow" noPadding>
          <div className="table-toolbar">
            <span className="form-note">
              {r.status === 'DRAFT' ? 'Approve to lock the order, activate to make it payable, then calculate cases.'
                : r.status === 'APPROVED' ? 'Activate to make arrears payable, then calculate cases.'
                : r.status === 'ACTIVE' ? 'Calculate arrears for every eligible employee.'
                : 'Closed.'}
            </span>
            <div className="row-actions">
              {NEXT_STATUS[r.status] && (
                <Button size="sm" loading={advance.isPending} onClick={() => advance.mutate(NEXT_STATUS[r.status])}>
                  {NEXT_STATUS[r.status] === 'APPROVED' ? 'Approve' : NEXT_STATUS[r.status] === 'ACTIVE' ? 'Activate' : 'Close'}
                </Button>
              )}
              {r.status === 'ACTIVE' && (
                <Button size="sm" variant="secondary" loading={calculate.isPending} onClick={() => calculate.mutate()}>Calculate Arrears</Button>
              )}
            </div>
          </div>
        </Card>

        <Card title={`Arrears Cases (${rows.length})`} noPadding>
          <Table columns={caseColumns} data={rows} keyField="id" emptyMessage="No cases — calculate arrears to populate this." />
        </Card>
      </div>
    </div>
  );
}
