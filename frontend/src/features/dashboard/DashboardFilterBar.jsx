import React from 'react';
import { Button } from '../../components/ui/Button';

function SelectField({ label, children, ...props }) {
  return (
    <label className="command-filter-field">
      <span>{label}</span>
      <select className="input" {...props}>
        {children}
      </select>
    </label>
  );
}

export function DashboardFilterBar({
  filters = {},
  appliedFilters = {},
  defaultDate = '',
  options = {},
  onFilter,
  onClear,
}) {
  const isCustomDate = Boolean(
    (appliedFilters.date && appliedFilters.date !== defaultDate) ||
    (filters.date && defaultDate && filters.date !== defaultDate)
  );

  const activeChips = [];

  if (isCustomDate) {
    activeChips.push({
      key: 'date',
      label: `Date: ${filters.date}`,
      clearValue: '',
    });
  }

  const branchId = appliedFilters.branchId || (filters.branchId ? filters.branchId : null);
  if (branchId) {
    const branch = (options.branches || []).find((b) => String(b.id) === String(branchId));
    activeChips.push({
      key: 'branchId',
      label: `Branch: ${branch?.name || branchId}`,
      clearValue: '',
    });
  }

  const deptId = appliedFilters.departmentId || (filters.departmentId ? filters.departmentId : null);
  if (deptId) {
    const dept = (options.departments || []).find((d) => String(d.id) === String(deptId));
    activeChips.push({
      key: 'departmentId',
      label: `Department: ${dept?.name || deptId}`,
      clearValue: '',
    });
  }

  const empType = appliedFilters.employmentType || (filters.employmentType ? filters.employmentType : null);
  if (empType) {
    activeChips.push({
      key: 'employmentType',
      label: `Type: ${String(empType).replace(/_/g, ' ')}`,
      clearValue: '',
    });
  }

  const period = appliedFilters.period || (filters.period && filters.period !== '7d' ? filters.period : null);
  if (period && period !== '7d') {
    activeChips.push({
      key: 'period',
      label: `Period: ${period}`,
      clearValue: '7d',
    });
  }

  const searchVal = appliedFilters.search || (filters.search ? filters.search : null);
  if (searchVal) {
    activeChips.push({
      key: 'search',
      label: `Employee: "${searchVal}"`,
      clearValue: '',
    });
  }

  return (
    <section className="command-filter-bar command-surface" aria-label="Dashboard filters">
      <div className="command-filter-grid">
        <SelectField label="Organisation" value="ALL" disabled>
          <option value="ALL">All Staff</option>
        </SelectField>

        <label className="command-filter-field">
          <span>Date</span>
          <input
            id="dashboard-date-filter"
            className="input command-date-input"
            type="date"
            value={filters.date || defaultDate || ''}
            onClick={(e) => {
              try {
                if (typeof e.target.showPicker === 'function') {
                  e.target.showPicker();
                }
              } catch {}
            }}
            onChange={(event) => {
              const val = event.target.value;
              if (!val || val === defaultDate) {
                onFilter('date', '');
              } else {
                onFilter('date', val);
              }
            }}
          />
        </label>

        <SelectField
          label="Branch"
          value={filters.branchId || ''}
          onChange={(event) => onFilter('branchId', event.target.value)}
        >
          <option value="">All branches</option>
          {(options.branches || []).map((row) => (
            <option key={row.id} value={row.id}>
              {row.code ? `${row.code} — ` : ''}{row.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Department"
          value={filters.departmentId || ''}
          onChange={(event) => onFilter('departmentId', event.target.value)}
        >
          <option value="">All departments</option>
          {(options.departments || []).map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Employment type"
          value={filters.employmentType || ''}
          onChange={(event) => onFilter('employmentType', event.target.value)}
        >
          <option value="">All types</option>
          {(options.employmentTypes || []).map((value) => (
            <option key={value} value={value}>
              {String(value).replace(/_/g, ' ')}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Trend period"
          value={filters.period || '7d'}
          onChange={(event) => onFilter('period', event.target.value)}
        >
          <option value="7d">7 working days</option>
          <option value="30d">30 days</option>
          <option value="6m">6 months</option>
          <option value="1y">1 year</option>
        </SelectField>

        <label className="command-filter-field command-filter-search">
          <span>Search employee</span>
          <input
            className="input"
            type="search"
            value={filters.search || ''}
            placeholder="Name or employee ID"
            onChange={(event) => onFilter('search', event.target.value)}
          />
        </label>
      </div>

      {activeChips.length > 0 && (
        <div className="command-filter-chips" aria-label="Active filters">
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onFilter(chip.key, chip.clearValue)}
              aria-label={`Remove ${chip.label} filter`}
            >
              <span>{chip.label}</span>
              <b aria-hidden="true">×</b>
            </button>
          ))}
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear all
          </Button>
        </div>
      )}
    </section>
  );
}

export default DashboardFilterBar;
