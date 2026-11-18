'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const platformPagePath = path.resolve(__dirname, '../frontend/src/features/platform/DpdpDocumentsPage.jsx');
const orgPagePath = path.resolve(__dirname, '../frontend/src/features/org/DpdpCompliancePage.jsx');
const sidebarPath = path.resolve(__dirname, '../frontend/src/components/Sidebar.jsx');
const commandPalettePath = path.resolve(__dirname, '../frontend/src/components/CommandPalette.jsx');
const appPath = path.resolve(__dirname, '../frontend/src/App.jsx');
const accessPath = path.resolve(__dirname, '../frontend/src/api/organizationAccess.js');

test('DPDP Admin UI source contract verification', () => {
  assert.ok(fs.existsSync(platformPagePath), 'DpdpDocumentsPage.jsx exists');
  assert.ok(fs.existsSync(orgPagePath), 'DpdpCompliancePage.jsx exists');

  const platformContent = fs.readFileSync(platformPagePath, 'utf8');
  const orgContent = fs.readFileSync(orgPagePath, 'utf8');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');
  const commandPaletteContent = fs.readFileSync(commandPalettePath, 'utf8');
  const appContent = fs.readFileSync(appPath, 'utf8');
  const accessContent = fs.readFileSync(accessPath, 'utf8');

  // Verify routes are mounted in App.jsx
  assert.ok(appContent.includes('DpdpDocumentsPage'), 'App.jsx imports DpdpDocumentsPage');
  assert.ok(appContent.includes('DpdpCompliancePage'), 'App.jsx imports DpdpCompliancePage');
  assert.ok(appContent.includes('path="dpdp-documents"'), 'App.jsx mounts dpdp-documents route');
  assert.ok(appContent.includes('path="dpdp-compliance"'), 'App.jsx mounts dpdp-compliance route');

  // Verify navigation includes the pages
  assert.ok(sidebarContent.includes('/dpdp-documents'), 'Sidebar links to /dpdp-documents for platform');
  assert.ok(sidebarContent.includes('/dpdp-compliance'), 'Sidebar links to /dpdp-compliance for org');
  assert.ok(commandPaletteContent.includes('/dpdp-documents'), 'CommandPalette includes /dpdp-documents');
  assert.ok(commandPaletteContent.includes('/dpdp-compliance'), 'CommandPalette includes /dpdp-compliance');

  // Verify permission gating in organizationAccess.js
  assert.ok(accessContent.includes("'dpdp-compliance'"), 'organizationAccess ROUTES includes dpdp-compliance');
  assert.ok(accessContent.includes("'dpdp-documents'"), 'organizationAccess PLATFORM includes dpdp-documents');

  // Verify security: No dangerouslySetInnerHTML or raw html rendering of policy body
  assert.ok(!platformContent.includes('dangerouslySetInnerHTML'), 'Platform document page avoids raw HTML injection');
  assert.ok(!orgContent.includes('dangerouslySetInnerHTML'), 'Org compliance page avoids raw HTML injection');

  // Verify DPO assignment features in org page
  assert.ok(orgContent.includes('assignDpo'), 'Org page implements DPO assignment');
  assert.ok(orgContent.includes('dpdpReadiness'), 'Org page checks DPDP readiness');
  assert.ok(orgContent.includes('assignDpo({ userId: Number(selectedUserId) })'), 'DPO assignment sends a named userId field');
  assert.ok(orgContent.includes('readiness?.isReady'), 'Org page uses the readiness API isReady field');
  assert.ok(orgContent.includes('b.message'), 'Org page renders blocker messages rather than blocker objects');
  assert.ok(orgContent.includes('profile?.dpoName'), 'Org page uses the flat DPO profile fields');
});
