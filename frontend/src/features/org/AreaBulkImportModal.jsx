import React, { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { organizationAccessApi } from '../../api/organizationAccess';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';

export const AREA_IMPORT_CONFIG = {
  branches: {
    label: 'Head Office & Branches',
    singular: 'Branch',
    perm: 'branches.manage',
    templateName: 'branches.xlsx',
    cols: ['number', 'code', 'name', 'address', 'phone'],
    description: 'Bulk import organisation units and branch addresses from an Excel template.',
  },
  departments: {
    label: 'Departments',
    singular: 'Department',
    perm: 'departments.manage',
    templateName: 'departments.xlsx',
    cols: ['branchCode', 'code', 'name', 'displayOrder'],
    description: 'Bulk import departments associated with Head Office or individual branch units.',
  },
  positions: {
    label: 'Positions',
    singular: 'Position',
    perm: 'positions.manage',
    templateName: 'positions.xlsx',
    cols: ['branchCode', 'departmentCode', 'code', 'name', 'postCadreCode', 'capacity', 'reportsToCode', 'leadershipVisible'],
    description: 'Bulk import reporting positions, sanctioned capacities, and cadre links.',
  },
  staffing: {
    label: 'Staffing Assignments',
    singular: 'Assignment',
    perm: 'assignments.manage',
    templateName: 'staffing.xlsx',
    cols: ['empCode', 'branchCode', 'departmentCode', 'positionCode', 'effectiveFrom', 'effectiveTo'],
    description: 'Bulk assign unassigned employees to designated units, departments, and positions.',
  },
  responsibilities: {
    label: 'Responsibilities',
    singular: 'Responsibility',
    perm: 'assignments.manage',
    templateName: 'responsibilities.xlsx',
    cols: ['empCode', 'responsibility', 'scopeType', 'branchCode', 'effectiveFrom', 'effectiveTo'],
    description: 'Bulk assign designated branch and senior management responsibilities.',
  },
};

function formatColumnName(field) {
  if (field === 'code') return 'Code';
  if (field === 'empCode') return 'Emp Code';
  if (field === 'branchCode') return 'Branch Code';
  if (field === 'departmentCode') return 'Department Code';
  if (field === 'positionCode') return 'Position Code';
  if (field === 'reportsToCode') return 'Reports To';
  if (field === 'postCadreCode') return 'Post Cadre';
  if (field === 'leadershipVisible') return 'Leadership';
  return field.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

export function AreaBulkImportModal({
  open,
  onClose,
  entity = 'departments',
  headOffices = [],
  onSuccess,
}) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  const cfg = AREA_IMPORT_CONFIG[entity] || AREA_IMPORT_CONFIG.departments;
  const needsHeadOffice = entity === 'branches' && headOffices.length !== 1;

  const resetState = () => {
    setFile(null);
    setPreview(null);
    setError('');
    setIsDragOver(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    resetState();
    onClose?.();
  };

  const previewMutation = useMutation({
    mutationFn: (workbookFile) =>
      entity === 'branches'
        ? organizationAccessApi.previewBranchImport(workbookFile)
        : organizationAccessApi.previewStructureImport(entity, workbookFile),
    onSuccess: (data) => {
      setPreview(data);
      setError('');
    },
    onError: (err) => {
      setPreview(null);
      setError(err.message || 'Could not preview this workbook.');
    },
  });

  const applyMutation = useMutation({
    mutationFn: (payload) =>
      entity === 'branches'
        ? organizationAccessApi.applyBranchImport(payload)
        : organizationAccessApi.applyStructureImport(entity, payload),
    onSuccess: (created) => {
      const count = Array.isArray(created) ? created.length : preview?.rows?.length || 0;
      toast.add(`${cfg.label} imported successfully (${count} records).`, 'success');
      handleClose();
      onSuccess?.();
    },
    onError: (err) => {
      setError(`${err.message || 'Could not apply this import.'} Please check the reported conflicts and retry.`);
    },
  });

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    if (!/\.xlsx$/i.test(selectedFile.name || '')) {
      setError('Please choose a valid .xlsx Excel workbook.');
      return;
    }
    if (selectedFile.size > 2 * 1024 * 1024) {
      setError('File size must not exceed 2 MiB.');
      return;
    }
    setFile(selectedFile);
    setError('');
    setPreview(null);
    previewMutation.mutate(selectedFile);
  };

  const handleDownloadTemplate = async () => {
    try {
      if (entity === 'branches') {
        await organizationAccessApi.downloadBranchTemplate();
      } else {
        await organizationAccessApi.downloadStructureTemplate(entity);
      }
      toast.add(`Downloaded ${cfg.templateName}`, 'info');
    } catch (err) {
      setError(err.message || 'Could not download template.');
    }
  };

  const handleExportData = async () => {
    try {
      await organizationAccessApi.exportStructureData(entity);
      toast.add(`Exported current ${cfg.label} data.`, 'info');
    } catch (err) {
      setError(err.message || 'Could not export current data.');
    }
  };

  const isSigned = Boolean(preview?.previewSignature);
  const hasErrors = (preview?.errors?.length || 0) > 0;
  const canApply =
    file &&
    preview &&
    isSigned &&
    !hasErrors &&
    !needsHeadOffice &&
    !applyMutation.isPending &&
    !previewMutation.isPending;

  const applyPayload =
    entity === 'branches'
      ? { rows: preview?.rows, errors: preview?.errors, previewSignature: preview?.previewSignature }
      : preview;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Bulk Import ${cfg.label}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={applyMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canApply}
            loading={applyMutation.isPending}
            onClick={() => applyMutation.mutate(applyPayload)}
          >
            {preview?.rows?.length
              ? `Apply Import (${preview.rows.length} ${cfg.singular.toLowerCase()}${preview.rows.length === 1 ? '' : 's'})`
              : 'Apply Import'}
          </Button>
        </>
      }
    >
      <div className="area-import-modal-body">
        {/* Guidance and Template Download Bar */}
        <div className="area-import-toolbar">
          <div className="area-import-toolbar-info">
            <span>{cfg.description}</span>
          </div>
          <div className="area-import-toolbar-buttons">
            <Button size="sm" variant="secondary" onClick={handleDownloadTemplate}>
              Download Template (.xlsx)
            </Button>
            <Button size="sm" variant="ghost" onClick={handleExportData}>
              Export Existing (.xlsx)
            </Button>
          </div>
        </div>

        {needsHeadOffice && (
          <div className="org-structure-error" role="alert">
            Configure exactly one active Head Office before importing branches.
          </div>
        )}

        {error && (
          <div className="org-structure-error" role="alert">
            {error}
          </div>
        )}

        {/* Dropzone File Picker */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          style={{ display: 'none' }}
          onChange={(e) => handleFileSelect(e.target.files?.[0])}
        />

        {!file ? (
          <div
            className={`area-import-dropzone ${isDragOver ? 'is-dragover' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              handleFileSelect(e.dataTransfer.files?.[0]);
            }}
          >
            <div className="area-import-dropzone-icon" aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className="area-import-dropzone-text">
              <strong>Click to upload or drag and drop your completed workbook</strong>
              <span>Maximum 1,000 rows · .xlsx format up to 2 MiB</span>
            </div>
          </div>
        ) : (
          <div className="area-import-file-badge">
            <div className="area-import-file-info">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <div>
                <span className="area-import-file-name">{file.name}</span>
                <span className="area-import-file-size"> ({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                resetState();
                fileInputRef.current?.click();
              }}
              disabled={applyMutation.isPending}
            >
              Change File
            </Button>
          </div>
        )}

        {/* Loading Preview Indicator */}
        {previewMutation.isPending && (
          <p className="org-section-state">
            Inspecting and verifying workbook rows against existing records…
          </p>
        )}

        {/* Preview Output */}
        {preview && (
          <div className="area-import-preview-box">
            <div className="area-import-preview-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong>
                  {hasErrors ? 'Validation conflicts identified' : 'Workbook verified and ready'}
                </strong>
                <Badge variant={hasErrors ? 'danger' : 'success'} size="sm">
                  {preview.rows?.length || 0} Valid Rows
                </Badge>
                {hasErrors && (
                  <Badge variant="danger" size="sm">
                    {preview.errors.length} Errors
                  </Badge>
                )}
              </div>
              {isSigned && <Badge variant="success" size="sm">Signed by Server</Badge>}
            </div>

            {hasErrors && (
              <div className="org-import-errors">
                <h3>Errors found in workbook</h3>
                <ul>
                  {preview.errors.map((err, idx) => (
                    <li key={`${err.row}-${err.field}-${idx}`}>
                      Row {err.row} · {err.field}: {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.rows?.length > 0 && (
              <div className="area-import-preview-table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      {cfg.cols.map((col) => (
                        <th key={col}>{formatColumnName(col)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 10).map((row, rIdx) => (
                      <tr key={rIdx}>
                        {cfg.cols.map((col) => (
                          <td key={col}>{String(row[col] ?? '') || '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length > 10 && (
                  <p className="field-hint" style={{ padding: '8px 12px', margin: 0 }}>
                    Showing first 10 of {preview.rows.length} rows to be imported.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default AreaBulkImportModal;
