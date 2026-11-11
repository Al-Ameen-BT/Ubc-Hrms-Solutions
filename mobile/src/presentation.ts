export const primarySections = ['Home', 'Payslips', 'Leave', 'Time', 'More'] as const;
export type PrimarySection = typeof primarySections[number];

export const navigationItems: ReadonlyArray<{ section: PrimarySection; label: string; glyph: string; accessibilityLabel: string }> = [
  { section: 'Home', label: 'Home', glyph: '⌂', accessibilityLabel: 'Employee home' },
  { section: 'Payslips', label: 'Pay', glyph: '₹', accessibilityLabel: 'My payslips' },
  { section: 'Leave', label: 'Leave', glyph: '◷', accessibilityLabel: 'My leave' },
  { section: 'Time', label: 'Time', glyph: '◴', accessibilityLabel: 'Check in and time entries' },
  { section: 'More', label: 'More', glyph: '•••', accessibilityLabel: 'More employee services' },
];

const nestedSections = new Set(['Policies', 'Calendar', 'Workplace', 'Claims', 'Profile']);

export function isPrimarySectionSelected(current: string, item: PrimarySection) {
  return current === item || (item === 'More' && nestedSections.has(current));
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
const toneByStatus: Record<string, StatusTone> = {
  APPROVED: 'success', PAID: 'success', ACKNOWLEDGED: 'success', COMPLETED: 'success',
  PENDING: 'warning', SUBMITTED: 'warning', PREPARED: 'warning', OPEN: 'warning',
  REJECTED: 'danger', DECLINED: 'danger', CANCELLED: 'danger', WITHDRAWN: 'danger',
  IN_PROGRESS: 'info', REQUIRED: 'info',
};

function titleCase(value: string) {
  const normalized = value.trim().replace(/[_-]+/g, ' ').toLowerCase();
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : 'Not set';
}

export function statusMeta(status?: string | null): { label: string; tone: StatusTone } {
  const key = String(status || '').trim().toUpperCase();
  return { label: titleCase(key), tone: toneByStatus[key] || 'neutral' };
}

export function firstName(value?: string | null) {
  return value?.trim().split(/\s+/)[0] || 'Employee';
}

export function initials(value?: string | null) {
  const words = value?.trim().split(/\s+/).filter(Boolean) || [];
  return (words.slice(0, 2).map(word => word[0]).join('') || 'E').toUpperCase();
}
