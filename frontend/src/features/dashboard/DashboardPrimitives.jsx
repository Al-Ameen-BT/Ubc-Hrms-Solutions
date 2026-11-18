import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { Button } from '../../components/ui/Button';
import { clampedPercent, preparePieItems } from './dashboardModel';
import './Dashboard.css';

const PIE_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0891b2'];
const PIE_TONE_COLORS = { success: '#10b981', warning: '#f59e0b', danger: '#ef4444', info: '#2563eb' };

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

export function WorkplacePieChart({ title, detail, items, emptyMessage, unit = 'people' }) {
  const data = preparePieItems(items);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <figure className="dashboard-pie">
      <figcaption>
        <h3>{title}</h3>
        <p>{detail}</p>
      </figcaption>
      {!total ? <p className="dashboard-empty">{emptyMessage}</p> : <>
        <div className="dashboard-pie-visual" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius="82%" stroke="var(--dashboard-panel)" strokeWidth={2} isAnimationActive={false}>
                {data.map((item, index) => <Cell key={item.label} fill={PIE_TONE_COLORS[item.tone] || PIE_COLORS[index % PIE_COLORS.length]} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <p className="dashboard-pie-total"><strong>{total}</strong> {unit}</p>
        <ul className="dashboard-pie-legend" aria-label={`${title} distribution`}>
          {data.map((item, index) => (
            <li key={item.label}>
              <span className={`dashboard-pie-swatch dashboard-pie-swatch-${item.tone || index + 1}`} aria-hidden="true" />
              <span title={item.label}>{item.label}</span>
              <strong>{item.value} <small>{clampedPercent(item.value, total)}%</small></strong>
            </li>
          ))}
        </ul>
      </>}
    </figure>
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
