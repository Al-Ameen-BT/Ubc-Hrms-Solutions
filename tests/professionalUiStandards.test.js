'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const UI_ROOTS = [
  'frontend/src',
  'mobile/src',
  'mobile/App.tsx',
  'public',
];
const SOURCE_EXTENSIONS = new Set(['.css', '.html', '.js', '.jsx', '.ts', '.tsx']);

function sourceFiles(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return [absolutePath];
  return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return [];
    return sourceFiles(path.join(relativePath, entry.name));
  });
}

function locationsFor(pattern) {
  const matches = [];
  for (const file of UI_ROOTS.flatMap(sourceFiles).filter((item) => SOURCE_EXTENSIONS.has(path.extname(item)))) {
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
      if (pattern.test(line)) matches.push(`${path.relative(ROOT, file)}:${index + 1}`);
      pattern.lastIndex = 0;
    });
  }
  return matches;
}

test('application UI uses professional vector icons instead of emoji or improvised glyphs', () => {
  const emoji = locationsFor(/[\p{Extended_Pictographic}\u2600-\u27BF]/gu);
  const improvisedGlyphs = locationsFor(/[✓✕◀▶◇⌂◷◴▦⌘§○]/gu);

  assert.deepEqual(
    [...new Set([...emoji, ...improvisedGlyphs])],
    [],
    'Replace emoji and UI glyphs with components from the approved icon systems.',
  );
});

test('application UI uses the shared typography tokens instead of raw generic font declarations', () => {
  const rawGenericFonts = locationsFor(/font-family\s*:\s*(?:monospace|serif|sans-serif)\s*;/gi);
  assert.deepEqual(rawGenericFonts, [], 'Use var(--font-sans) or var(--font-mono) from the design system.');
});

test('application pages use the compact operational spacing system', () => {
  const tokens = fs.readFileSync(path.join(ROOT, 'frontend/src/styles/tokens.css'), 'utf8');
  const layout = fs.readFileSync(path.join(ROOT, 'frontend/src/styles/app.css'), 'utf8');

  assert.match(tokens, /--space-5:\s*20px/);
  assert.match(tokens, /--space-6:\s*24px/);
  assert.match(tokens, /--space-7:\s*32px/);
  assert.match(layout, /\.page\s*\{[\s\S]*?max-width:\s*1600px/);
  assert.match(layout, /\.app-main\s*\{[\s\S]*?padding:\s*var\(--space-4\)/);
  assert.match(layout, /\.card-body\s*\{[\s\S]*?padding:\s*var\(--space-4\)/);
});

