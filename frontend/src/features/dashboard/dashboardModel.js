function count(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

export function clampedPercent(value, total) {
  const safeTotal = count(total);
  if (safeTotal === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((count(value) / safeTotal) * 100)));
}

export function platformHealth(summary = {}) {
  const active = count(summary.active);
  const expiring = count(summary.expiringSoon);
  return {
    active: Math.max(0, active - expiring),
    expiring,
    suspended: count(summary.suspended),
    expired: count(summary.expired),
  };
}

export function configuredBranches(branches = []) {
  return branches.filter((branch) => Number(branch.id) !== 0);
}

export function licenceAttention(license = {}) {
  const expired = license.state === 'ORG_LICENSE_EXPIRED';
  const daysLeft = Number(license.daysLeft);
  if (expired) return { warning: true, expired: true, title: 'Organisation licence has expired' };
  if (Number.isFinite(daysLeft) && daysLeft === 0) return { warning: true, expired: false, title: 'Licence expires today' };
  if (Number.isFinite(daysLeft) && daysLeft > 0 && daysLeft <= 30) {
    return { warning: true, expired: false, title: `Licence expires in ${daysLeft} days` };
  }
  return { warning: false, expired: false, title: '' };
}

export function prioritisePlatformAttention(rows = []) {
  return [...rows].sort((left, right) => {
    const severity = Number(right.severity === 'danger') - Number(left.severity === 'danger');
    if (severity) return severity;
    return count(left.license?.daysLeft) - count(right.license?.daysLeft);
  });
}

export function nextTabIndex(currentIndex, key, total) {
  if (total <= 0) return currentIndex;
  if (key === 'ArrowRight') return (currentIndex + 1) % total;
  if (key === 'ArrowLeft') return (currentIndex - 1 + total) % total;
  if (key === 'Home') return 0;
  if (key === 'End') return total - 1;
  return currentIndex;
}

export function preparePieItems(items = [], maxItems = 6) {
  const visible = items
    .map((item) => ({
      label: String(item.label || 'Unclassified'),
      value: count(item.value),
      ...(item.tone ? { tone: item.tone } : {}),
    }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value);
  const limit = Math.max(2, Number(maxItems) || 6);
  if (visible.length <= limit) return visible;
  const head = visible.slice(0, limit - 1);
  const other = visible.slice(limit - 1).reduce((total, item) => total + item.value, 0);
  return [...head, { label: 'Other', value: other }];
}

export function countByLabel(rows = [], field, fallback = 'Unclassified') {
  const counts = new Map();
  rows.forEach((row) => {
    const label = String(row?.[field] || fallback);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts].map(([label, value]) => ({ label, value }));
}
