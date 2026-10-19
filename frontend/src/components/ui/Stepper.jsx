import React from 'react';

/**
 * Stepper — progress rail for multi-section forms.
 * The "tick rail" pattern: numbered stations with ruled connectors.
 */
export function Stepper({ steps, current, onStepClick }) {
  return (
    <ol className="stepper" aria-label="Form progress">
      {steps.map((step, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'todo';
        const clickable = onStepClick && i < current;
        return (
          <li key={step.key || i} className={`stepper-item stepper-${state}`}>
            <button
              type="button"
              className="stepper-station"
              onClick={clickable ? () => onStepClick(i) : undefined}
              disabled={!clickable}
              aria-current={state === 'active' ? 'step' : undefined}
            >
              <span className="stepper-tick mono">{state === 'done' ? '✓' : i + 1}</span>
              <span className="stepper-label">{step.label}</span>
            </button>
            {i < steps.length - 1 && <span className="stepper-connector" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
