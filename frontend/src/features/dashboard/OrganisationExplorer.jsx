import React from 'react';
import { Badge } from '../../components/ui/Badge';

const MODES = [['tree', 'Tree'], ['branch', 'Branch View'], ['map', 'Workforce Map']];
const HEALTH_VARIANT = { HEALTHY: 'success', WATCH: 'default', NEEDS_ATTENTION: 'warning', CRITICAL: 'danger' };

function branchSummary(summary, branchId) { return (summary?.branches || []).find((row) => String(row.branchId) === String(branchId)); }

function DetailsPanel({ node, summary, onNavigate }) {
  if (!node) return <aside className="explorer-details-panel"><div className="command-empty"><strong>Select an organisation node</strong><span>Choose a branch, department, position or employee to inspect its current operational context.</span></div></aside>;
  const branch = branchSummary(summary, node.branchId || node.id) || {};
  return <aside className="explorer-details-panel" aria-label={`${node.name} details`}><header><span>{node.type || 'Organisation node'}</span><h3>{node.name}</h3>{node.code ? <p>{node.code}</p> : null}</header><dl><div><dt>Employees</dt><dd>{node.employees ?? branch.employees ?? '—'}</dd></div><div><dt>Vacancies</dt><dd>{node.vacancies ?? branch.vacancies ?? '—'}</dd></div><div><dt>Health</dt><dd>{node.health || branch.health ? <Badge variant={HEALTH_VARIANT[node.health || branch.health] || 'default'}>{String(node.health || branch.health).replace(/_/g, ' ')}</Badge> : 'Not available'}</dd></div></dl><div className="explorer-detail-actions">{node.type === 'employee' ? <button type="button" onClick={() => onNavigate(`/employees/${node.id}`)}>Open employee profile</button> : null}{(node.branchId || node.type === 'branch') ? <button type="button" onClick={() => onNavigate(`/branches/${node.branchId || node.id}`)}>Open branch dashboard</button> : null}<button type="button" onClick={() => onNavigate('/organisation-structure')}>Manage structure</button></div></aside>;
}

export function OrganisationExplorer({ summary = {}, mode = 'tree', onModeChange, selectedNode, onSelect, onNavigate, chart = {}, selectedBranchId, selectedDepartmentId, expandedPositionId, onExpandPosition, compact = false }) {
  const branches = chart.branches?.length ? chart.branches : (summary.branches || []).map((row) => ({ id: row.branchId, name: row.name, code: row.code, type: 'branch', ...row }));
  const departments = chart.departments || [];
  const positions = chart.positions || [];
  const employees = chart.employees || [];
  const choose = (type, row, context = {}) => onSelect?.({ type, ...row, ...context });

  return <section className={`command-surface organisation-explorer${compact ? ' organisation-explorer-compact' : ''}`} aria-labelledby={compact ? 'dashboard-explorer-title' : 'organisation-explorer-title'}>
    <header className="command-section-header"><div><h2 id={compact ? 'dashboard-explorer-title' : 'organisation-explorer-title'}>Organisation Explorer</h2><p>Current branches, departments, positions and employees.</p></div>{compact ? <button type="button" className="command-link" onClick={() => onNavigate('/organisation-explorer')}>Open full explorer</button> : <div className="explorer-mode-switch" aria-label="Explorer view">{MODES.map(([key, label]) => <button key={key} type="button" aria-pressed={mode === key} onClick={() => onModeChange?.(key)}>{label}</button>)}</div>}</header>
    {!branches.length ? <div className="command-empty"><strong>No organisation assignments are available</strong><span>Add branches and current employee assignments in Organisation Structure.</span></div> : <div className="explorer-layout">
      <div className="explorer-canvas">
        {mode === 'branch' || compact ? <div className="explorer-branch-grid">{branches.map((branch) => { const health = branchSummary(summary, branch.id) || branch; return <button type="button" key={branch.id} onClick={() => choose('branch', branch)}><span><strong>{branch.name}</strong><small>{branch.code}</small></span><Badge variant={HEALTH_VARIANT[health.health] || 'default'}>{String(health.health || 'Available').replace(/_/g, ' ')}</Badge><dl><div><dt>Employees</dt><dd>{health.employees ?? '—'}</dd></div><div><dt>Vacancies</dt><dd>{health.vacancies ?? '—'}</dd></div></dl></button>; })}</div> : null}
        {mode === 'map' ? <div className="explorer-workforce-map">{branches.map((branch) => { const health = branchSummary(summary, branch.id) || branch; const employeesCount = Number(health.employees || 0); const max = Math.max(...(summary.branches || []).map((row) => Number(row.employees || 0)), 1); return <button type="button" key={branch.id} onClick={() => choose('branch', branch)}><span>{branch.name}</span><i><b style={{ width: `${Math.max(4, Math.round((employeesCount / max) * 100))}%` }} /></i><strong>{employeesCount} employees</strong></button>; })}</div> : null}
        {mode === 'tree' ? <div className="explorer-tree explorer-mobile-list"><ul>{branches.map((branch) => <li key={branch.id}><button type="button" aria-expanded={String(selectedBranchId) === String(branch.id)} onClick={() => choose('branch', branch)}><span>{branch.name}</span><small>{branch.code}</small></button>{String(selectedBranchId) === String(branch.id) ? <ul>{departments.map((department) => <li key={department.id}><button type="button" aria-expanded={String(selectedDepartmentId) === String(department.id)} onClick={() => choose('department', department, { branchId: branch.id })}><span>{department.name}</span><small>{department.code}</small></button>{String(selectedDepartmentId) === String(department.id) ? <ul>{positions.map((position) => <li key={position.id}><button type="button" aria-expanded={String(expandedPositionId) === String(position.id)} onClick={() => { choose('position', position, { branchId: branch.id, departmentId: department.id }); onExpandPosition?.(String(expandedPositionId) === String(position.id) ? null : position.id); }}><span>{position.name}</span><small>{position.code}</small></button>{String(expandedPositionId) === String(position.id) ? <ul>{employees.filter((employee) => String(employee.position?.id) === String(position.id)).map((employee) => <li key={employee.id}><button type="button" onClick={() => choose('employee', employee, { branchId: branch.id, departmentId: department.id })}><span>{employee.name}</span><small>{employee.empCode}</small></button></li>)}</ul> : null}</li>)}</ul> : null}</li>)}</ul> : null}</li>)}</ul></div> : null}
      </div>
      {!compact ? <DetailsPanel node={selectedNode} summary={summary} onNavigate={onNavigate} /> : null}
    </div>}
  </section>;
}

export default OrganisationExplorer;
