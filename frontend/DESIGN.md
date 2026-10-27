# DESIGN.md

<!-- impeccable:design-schema 1 -->

## Visual System

### Color Palette

**Light theme (default):**
- `--bg-primary`: #e9eef6 (soft sky blue, warm neutral)
- `--bg-secondary`: #dde5f0 (lighter sky blue)
- `--surface`: rgba(255, 255, 255, 0.62) (frosted glass)
- `--surface-raised`: rgba(255, 255, 255, 0.88) (stronger glass)
- `--text-primary`: #111827 (nearly black, readable on all surfaces)
- `--text-secondary`: #475569 (muted steel)
- `--accent`: #3b82f6 (banker's blue, primary action)
- `--accent-soft`: rgba(59, 130, 246, 0.12) (blue overlay)
- `--accent-strong`: #2563eb (darker blue, hover/active)
- `--border`: rgba(255, 255, 255, 0.6) (subtle glass border)
- `--border-strong`: rgba(255, 255, 255, 0.85) (emphasis border)
- `--success`: #10b981 (green for positive)
- `--warning`: #f59e0b (amber for warnings)
- `--danger`: #ef4444 (red for errors)

**Dark theme:**
- `--bg-primary`: #0a1120 (deep navy)
- `--bg-secondary`: #16213a
- `--surface`: rgba(30, 41, 59, 0.55) (dark frosted glass)
- `--surface-raised`: rgba(30, 41, 59, 0.9)
- `--text-primary`: #f1f5f9 (almost white)
- `--text-secondary`: #cbd5e1
- `--accent`: #60a5fa (light blue)
- `--accent-strong`: #3b82f6 (classic blue)
- `--success`: #34d399
- `--warning`: #fbbf24
- `--danger`: #f87171

### Typography

- **Font family**: `--font-sans`: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif
- **Monospace**: `--font-mono`: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace (for tabular data)
- **Scale**: `--text-xs`: 0.75rem, `--text-sm`: 0.8125rem, `--text-base`: 0.875rem, `--text-md`: 1rem, `--text-lg`: 1.25rem, `--text-xl`: 1.75rem
- **Line height**: 1.5 globally
- **Heading hierarchy**: h1: var(--text-xl), h2: var(--text-lg), h3: var(--text-md)
- **Font weight**: 600 for headings, regular for body
- **Tabular numerals**: `--font-variant-numeric`: tabular-nums on `.mono` elements

### Layout & Spacing

- **Base rhythm**: 4px increment (`--space-1`: 4px, `--space-2`: 8px, `--space-3`: 12px, `--space-4`: 16px, `--space-5`: 24px, `--space-6`: 32px, `--space-7`: 48px)
- **Sidebar width**: 260px (expanded), 64px (collapsed)
- **Topbar height**: 60px
- **Card radius**: `--radius`: 8px, `--radius-lg`: 12px, `--radius-xl`: 16px
- **Image/element blur**: `--blur`: blur(16px) saturate(160%), `--blur-strong`: blur(24px) saturate(180%), `--blur-subtle`: blur(8px) saturate(140%)

### Surface Treatment

- **Glassmorphism**: Frosted glass effect with `rgba(255, 255, 255, 0.55)` backdrop, `blur(16px) saturate(160%)`
- **Glass layers**: 
  - `--bg-glass`: rgba(255, 255, 255, 0.55) (light) / rgba(30, 41, 59, 0.5) (dark)
  - `--bg-glass-strong`: rgba(255, 255, 255, 0.78) / rgba(24, 34, 54, 0.78)
  - `--bg-glass-subtle`: rgba(255, 255, 255, 0.42) / rgba(30, 41, 59, 0.38)
  - `--bg-glass-hover`: rgba(255, 255, 255, 0.72) / rgba(51, 65, 85, 0.6)
- **Shadows**: 
  - `--shadow-sm`: 0 1px 2px rgba(15, 23, 42, 0.05)...
  - `--shadow-md`: 0 6px 16px rgba(15, 23, 42, 0.08)...
  - `--shadow-lg`: 0 18px 44px rgba(15, 23, 42, 0.12)...
  - `--shadow-glass`: 0 10px 34px rgba(15, 23, 42, 0.1)...

### Motion & Interaction

- **Default duration**: `--duration`: 250ms, `--duration-fast`: 150ms
- **Easing**: `--ease`: cubic-bezier(0.4, 0, 0.2, 1)
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` sets durations to 0ms
- **Key animations**: fadeIn, slideUp, scaleIn
- **Focus ring**: 2px solid var(--accent) with 2px offset, var(--radius) border-radius

### States

- **Hover**: Subtle style changes, accent color emphasis
- **Focus-visible**: 2px solid var(--accent) with 2px outline-offset, var(--radius) border-radius
- **Selection**: `--accent` background with #fff text
- **Disabled**: Reduced opacity, non-interactive cursor
- **Loading**: Spinner or skeleton with var(--duration) fade

### Accessibility

- **CSP**: Strict content security policy enforced
- **Focus states**: Clear focus rings using accent color
- **Color contrast**: Body/text ≥4.5:1, large text ≥3:1
- **Scrollbars**: var(--border-strong) thumb on transparent track
- **Reduce motion**: Honors prefers-reduced-motion media query
- **Keyboard operability**: All interactive elements reachable via Tab, clear focus indicators

### Brand Voice (Copy)

- Controls name their action
- Errors name the problem and the recovery
- Professional, clear, concise language matching Kerala service rules context