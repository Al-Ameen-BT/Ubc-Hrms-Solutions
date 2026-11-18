import React, { useState } from 'react';

/**
 * High-performance, zero-dependency SVG Donut / Pie Chart.
 * Features vibrant custom color segments, slice hover effects,
 * interactive center telemetry, and an itemized percentage legend.
 */
export function ColorfulPieChart({
  data = [],
  size = 220,
  donut = true,
  donutWidth = 36,
  centerTitle = '',
  centerValue = '',
  showLegend = true,
  className = '',
}) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const cleanData = data.filter((d) => Number(d.value) > 0);
  const total = cleanData.reduce((acc, d) => acc + Number(d.value), 0);

  const center = size / 2;
  const radius = (size - 16) / 2;
  const innerRadius = donut ? radius - donutWidth : 0;

  // Generate SVG arcs
  let accumulatedAngle = -Math.PI / 2; // Start at 12 o'clock
  const slices = cleanData.map((item, index) => {
    const value = Number(item.value);
    const fraction = total > 0 ? value / total : 0;
    const sliceAngle = fraction * 2 * Math.PI;

    const startAngle = accumulatedAngle;
    const endAngle = accumulatedAngle + sliceAngle;
    accumulatedAngle = endAngle;

    const isFullCircle = fraction >= 0.9999;
    const largeArc = sliceAngle > Math.PI ? 1 : 0;

    // Outer arc points
    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);

    let pathData = '';
    if (isFullCircle) {
      if (donut) {
        pathData = `
          M ${center} ${center - radius}
          A ${radius} ${radius} 0 1 0 ${center} ${center + radius}
          A ${radius} ${radius} 0 1 0 ${center} ${center - radius}
          M ${center} ${center - innerRadius}
          A ${innerRadius} ${innerRadius} 0 1 1 ${center} ${center + innerRadius}
          A ${innerRadius} ${innerRadius} 0 1 1 ${center} ${center - innerRadius}
          Z
        `;
      } else {
        pathData = `
          M ${center} ${center - radius}
          A ${radius} ${radius} 0 1 0 ${center} ${center + radius}
          A ${radius} ${radius} 0 1 0 ${center} ${center - radius}
          Z
        `;
      }
    } else {
      if (donut) {
        // Inner arc points
        const x3 = center + innerRadius * Math.cos(endAngle);
        const y3 = center + innerRadius * Math.sin(endAngle);
        const x4 = center + innerRadius * Math.cos(startAngle);
        const y4 = center + innerRadius * Math.sin(startAngle);

        pathData = `
          M ${x1} ${y1}
          A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}
          L ${x3} ${y3}
          A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}
          Z
        `;
      } else {
        pathData = `
          M ${center} ${center}
          L ${x1} ${y1}
          A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}
          Z
        `;
      }
    }

    const pct = total > 0 ? Math.round(fraction * 100) : 0;
    return {
      ...item,
      pathData,
      pct,
      index,
    };
  });

  const activeItem = hoveredIndex !== null ? cleanData[hoveredIndex] : null;
  const activePct = activeItem && total > 0 ? Math.round((Number(activeItem.value) / total) * 100) : null;

  return (
    <div
      className={`colorful-pie-chart-container ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ overflow: 'visible', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))' }}
        >
          {/* Empty ring background if total is 0 */}
          {total === 0 && (
            <circle
              cx={center}
              cy={center}
              r={donut ? (radius + innerRadius) / 2 : radius}
              fill="none"
              stroke="var(--border)"
              strokeWidth={donut ? donutWidth : 4}
              strokeDasharray="4 4"
              opacity="0.6"
            />
          )}

          {/* Slices */}
          {slices.map((slice) => {
            const isHovered = hoveredIndex === slice.index;
            return (
              <path
                key={slice.label}
                d={slice.pathData}
                fill={slice.color}
                style={{
                  cursor: 'pointer',
                  transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease',
                  transformOrigin: `${center}px ${center}px`,
                  transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                  opacity: hoveredIndex !== null && !isHovered ? 0.6 : 1,
                  filter: isHovered ? `drop-shadow(0 0 8px ${slice.color}88)` : 'none',
                }}
                onMouseEnter={() => setHoveredIndex(slice.index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            );
          })}
        </svg>

        {/* Center telemetry text for donut charts */}
        {donut && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: size,
              height: size,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              pointerEvents: 'none',
              textAlign: 'center',
              padding: '0 12px',
            }}
          >
            {activeItem ? (
              <>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: activeItem.color,
                    maxWidth: `${innerRadius * 1.6}px`,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {activeItem.label}
                </span>
                <span
                  style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    lineHeight: 1.1,
                  }}
                >
                  {activeItem.value}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                  {activePct}%
                </span>
              </>
            ) : (
              <>
                <span
                  style={{
                    fontSize: '24px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    lineHeight: 1.1,
                  }}
                >
                  {centerValue || total}
                </span>
                {centerTitle && (
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      marginTop: '2px',
                      maxWidth: `${innerRadius * 1.5}px`,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {centerTitle}
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Itemized Legend */}
      {showLegend && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            width: '100%',
            maxWidth: '280px',
            marginTop: '4px',
          }}
        >
          {data.map((item, idx) => {
            const isHovered = hoveredIndex === idx;
            const val = Number(item.value) || 0;
            const pct = total > 0 ? Math.round((val / total) * 100) : 0;

            return (
              <div
                key={item.label}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius)',
                  fontSize: 'var(--text-xs)',
                  background: isHovered ? 'var(--bg-glass-hover)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: item.color,
                      flexShrink: 0,
                      boxShadow: `0 0 6px ${item.color}66`,
                    }}
                  />
                  <span
                    style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: isHovered ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: isHovered ? 600 : 400,
                    }}
                  >
                    {item.label}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{val}</span>
                  <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', minWidth: '32px', textAlign: 'right' }}>
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
