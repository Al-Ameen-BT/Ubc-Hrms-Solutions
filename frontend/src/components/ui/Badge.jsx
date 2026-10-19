import React from 'react';

export function Badge({ children, variant = 'default', stamp }) {
  if (stamp) {
    return (
      <span className={`badge badge-stamp badge-${variant}`}>
        {children}
      </span>
    );
  }
  return (
    <span className={`badge badge-${variant}`}>
      {children}
    </span>
  );
}
