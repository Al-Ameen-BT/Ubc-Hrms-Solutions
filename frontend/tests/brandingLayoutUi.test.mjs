import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('branding upload uses the shared styled picker and fitted preview slots', () => {
  const component = source('components/BrandAssetUpload.jsx');
  const styles = source('components/BrandAssetUpload.css');

  assert.match(component, /file-upload-btn-wrap/);
  assert.match(component, /brand-asset-preview-frame/);
  assert.match(styles, /\.brand-asset-preview-frame/);
  assert.match(styles, /object-fit:\s*contain/);
});

test('organisation header does not repeat the name beside an uploaded banner', () => {
  const topBar = source('components/TopBar.jsx');
  assert.match(topBar, /!branding\?\.logoUrl\s*&&\s*\(\s*<span className="topbar-org-name"/);
});

test('empty roles state spans the workspace instead of collapsing into the navigation column', () => {
  const page = source('features/org/RolesPermissionsPage.jsx');
  const styles = source('features/org/RolesPermissionsPage.css');

  assert.match(page, /roles-workspace-empty/);
  assert.match(styles, /\.roles-workspace-empty/);
  assert.match(styles, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});
