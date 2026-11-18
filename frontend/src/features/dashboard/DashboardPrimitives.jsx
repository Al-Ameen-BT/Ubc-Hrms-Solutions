import React from 'react';
import { Button } from '../../components/ui/Button';
import { clampedPercent } from './dashboardModel';
import './Dashboard.css';

export function DashboardSummary({ items }) {
  return (
    <dl className="dashboard-summary" aria-label="Dashboard summary">
      {items.map((item) => (
        <div key={item.id} className={`dashboard-summary-item dashboard-tone-${item.tone || 'neutral'}`}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          <span>{item.detail}</span>
        </div>
      ))}
    </dl>
  );
}

export function DistributionBars({ items, total, emptyMessage, ariaLabel }) {
  if (!items.some((item) => Number(item.value) > 0) || Number(total) <= 0) {
    return <p className="dashboard-empty">{emptyMessage}</p>;
  }

  return (
    <ul className="dashboard-bars" aria-label={ariaLabel}>
      {items.map((item) => {
        const percent = clampedPercent(item.value, total);
        return (
          <li key={item.id} className={`dashboard-bar dashboard-tone-${item.tone || 'neutral'}`}>
            <div className="dashboard-bar-label">
              <span>{item.label}</span>
              <strong>{item.value} <small>{percent}%</small></strong>
            </div>
            <progress max="100" value={percent} aria-label={`${item.label}: ${item.value}, ${percent}%`} />
            {item.detail ? <p>{item.detail}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function AttentionList({ items, emptyTitle, emptyDetail }) {
  if (!items.length) {
    return (
      <div className="dashboard-clear-state">
        <strong>{emptyTitle}</strong>
        <p>{emptyDetail}</p>
      </div>
    );
  }

  return (
    <ul className="dashboard-attention-list">
      {items.map((item) => (
        <li key={item.id} className={`dashboard-attention-item dashboard-tone-${item.tone || 'neutral'}`}>
          <span className="dashboard-status-mark" aria-hidden="true" />
          <div>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </div>
          {item.actionLabel && item.onAction ? (
            <Button variant="ghost" size="sm" onClick={item.onAction}>{item.actionLabel}</Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton" aria-label="Loading dashboard" aria-busy="true">
      <div className="dashboard-skeleton-line dashboard-skeleton-title" />
      <div className="dashboard-skeleton-summary" />
      <div className="dashboard-skeleton-grid">
        <div />
        <div />
      </div>
    </div>
  );
}

export function DashboardError({ message, onRetry }) {
  return (
    <div className="dashboard-error" role="alert">
      <div>
        <strong>Dashboard data is unavailable</strong>
        <p>{message || 'Try loading this section again.'}</p>
      </div>
      {onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}
