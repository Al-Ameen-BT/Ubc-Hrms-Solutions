import React from 'react';
import { Button } from '../../components/ui/Button';

const LABELS = { branchId: 'Branch', departmentId: 'Department', employmentType: 'Employment type', date: 'Date', period: 'Period', search: 'Employee' };

function SelectField({ label, children, ...props }) {
  return <label className="command-filter-field"><span>{label}</span><select className="input" {...props}>{children}</select></label>;
}

export function DashboardFilterBar({ filters, options = {}, onFilter, onClear }) {
  const active = Object.entries(filters).filter(([key, value]) => value && !(key === 'period' && value === '7d'));
  return <section className="command-filter-bar command-surface" aria-label="Dashboard filters">
    <div className="command-filter-grid">
      <SelectField label="Organisation" value="ALL" disabled><option value="ALL">All Staff</option></SelectField>
      <label className="command-filter-field"><span>Date</span><input className="input" type="date" value={filters.date || ''} onChange={(event) => onFilter('date', event.target.value)} /></label>
      <SelectField label="Branch" value={filters.branchId || ''} onChange={(event) => onFilter('branchId', event.target.value)}><option value="">All branches</option>{(options.branches || []).map((row) => <option key={row.id} value={row.id}>{row.code ? `${row.code} — ` : ''}{row.name}</option>)}</SelectField>
      <SelectField label="Department" value={filters.departmentId || ''} onChange={(event) => onFilter('departmentId', event.target.value)}><option value="">All departments</option>{(options.departments || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</SelectField>
      <SelectField label="Employment type" value={filters.employmentType || ''} onChange={(event) => onFilter('employmentType', event.target.value)}><option value="">All types</option>{(options.employmentTypes || []).map((value) => <option key={value} value={value}>{String(value).replace(/_/g, ' ')}</option>)}</SelectField>
      <SelectField label="Trend period" value={filters.period || '7d'} onChange={(event) => onFilter('period', event.target.value)}><option value="7d">7 working days</option><option value="30d">30 days</option><option value="6m">6 months</option><option value="1y">1 year</option></SelectField>
      <label className="command-filter-field command-filter-search"><span>Search employee</span><input className="input" type="search" value={filters.search || ''} placeholder="Name or employee ID" onChange={(event) => onFilter('search', event.target.value)} /></label>
    </div>
    {active.length ? <div className="command-filter-chips" aria-label="Active filters">{active.map(([key, value]) => <button key={key} type="button" onClick={() => onFilter(key, '')} aria-label={`Remove ${LABELS[key] || key} filter`}><span>{LABELS[key] || key}: {String(value)}</span><b aria-hidden="true">×</b></button>)}<Button variant="ghost" size="sm" onClick={onClear}>Clear all</Button></div> : null}
  </section>;
}

export default DashboardFilterBar;
