import React, { forwardRef } from 'react';

export const Input = forwardRef(function Input(
  { label, hint, error, required, mono, className = '', ...props },
  ref
) {
  const cls = `input ${error ? 'input-error' : ''} ${mono ? 'mono' : ''} ${className}`;

  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={props.id}>
          {label}
          {required && <span className="field-required"> *</span>}
        </label>
      )}
      <input ref={ref} className={cls} aria-invalid={!!error} aria-describedby={
        error ? `${props.id}-error` : hint ? `${props.id}-hint` : undefined
      } {...props} />
      {hint && !error && <p className="field-hint" id={`${props.id}-hint`}>{hint}</p>}
      {error && <p className="field-error" id={`${props.id}-error`} role="alert">{error}</p>}
    </div>
  );
});
