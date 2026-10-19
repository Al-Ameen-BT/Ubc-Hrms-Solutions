import React from 'react';

export function Card({ title, actions, children, className = '', noPadding }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-header">
          {title && <h3 className="card-title">{title}</h3>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={`card-body ${noPadding ? 'card-body-flush' : ''}`}>
        {children}
      </div>
    </section>
  );
}
