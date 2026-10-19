import React from 'react';

/**
 * The KPI tile as a ruled ledger line — the passbook's figure row.
 */
export function StatLedger({ label, value, subValue, trend, redInk }) {
  return (
    <div className="stat-ledger">
      <div className="stat-ledger-label">{label}</div>
      <div className={`stat-ledger-value mono ${redInk ? 'red-ink' : ''}`}>
        {value}
      </div>
      {subValue && <div className="stat-ledger-sub">{subValue}</div>}
      {trend && (
        <div className={`stat-ledger-trend ${trend > 0 ? 'trend-up' : trend < 0 ? 'trend-down' : ''}`}>
          {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
}
