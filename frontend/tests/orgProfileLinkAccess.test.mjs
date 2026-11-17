import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const accessModule = await import('../src/api/organizationAccess.js');

test('chart-only users see no organisation profile link, while profile access and management remain permission-gated', () => {
  assert.equal(typeof accessModule.orgProfileLinkAccess, 'function', 'profile link permission policy is available');
  const chartOnly = accessModule.orgProfileLinkAccess(code => code === 'chart.view');
  assert.deepEqual(chartOnly, { canView: false, canManage: false });

  const viewer = accessModule.orgProfileLinkAccess(code => code === 'settings.view');
  assert.deepEqual(viewer, { canView: true, canManage: false });

  const manager = accessModule.orgProfileLinkAccess(code => code === 'settings.view' || code === 'settings.configure');
  assert.deepEqual(manager, { canView: true, canManage: true });

  const page = readFileSync(new URL('../src/features/org/OrganisationStructurePage.jsx', import.meta.url), 'utf8');
  assert.match(page, /profileLinks\.canView && <Link[^>]+to="\/org-profile"/);
  assert.match(page, /profileLinks\.canManage && <Link[^>]+to="\/org-profile"/);
});
