import React, { useState } from 'react';

export function Table({ columns, data, keyField, onRowClick, emptyMessage, loading, rowClassName }) {
  const [sort, setSort] = useState({ field: null, dir: 'asc' });

  const handleSort = (field) => {
    setSort(s => ({
      field,
      dir: s.field === field && s.dir === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sorted = React.useMemo(() => {
    if (!sort.field) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sort.field];
      const bVal = b[sort.field];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = typeof aVal === 'number' ? aVal - bVal : String(aVal).localeCompare(String(bVal));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [data, sort]);

  if (loading) {
    return (
      <div className="table-loading">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="table-skeleton-row" />
        ))}
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="table-empty">
        <p>{emptyMessage || 'No records found.'}</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.field}
                className={`table-th ${col.sortable !== false ? 'table-th-sortable' : ''} ${col.align === 'right' ? 'table-th-right' : ''} ${col.className || ''}`}
                style={col.width ? { width: col.width } : undefined}
                onClick={col.sortable !== false ? () => handleSort(col.field) : undefined}
                aria-sort={sort.field === col.field ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
              >
                {col.label}
                {sort.field === col.field && (
                  <span className="table-sort-indicator">{sort.dir === 'asc' ? ' ↑' : ' ↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => (
            <tr
              key={row[keyField]}
              className={`table-row ${onRowClick ? 'table-row-clickable' : ''} ${rowClassName ? rowClassName(row) : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map(col => (
                <td
                  key={col.field}
                  className={`table-td ${col.align === 'right' ? 'table-td-right' : ''} ${col.mono ? 'mono' : ''} ${col.className || ''}`}
                >
                  {col.render ? col.render(row) : row[col.field]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
