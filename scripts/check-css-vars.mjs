#!/usr/bin/env node
// Fails when source uses a CSS custom property that no stylesheet defines.
//
//   node scripts/check-css-vars.mjs
//
// An undefined var() in an SVG fill silently falls back to black: invisible in dark
// mode, a stray black box in light mode. That shipped twice (--text-error,
// --bg-accent-subtle) before this check existed. var(--x, fallback) is allowed.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(src);
const defined = new Set();
for (const f of files.filter((f) => f.endsWith('.css'))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
}

const missing = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/var\((--[\w-]+)\s*(,)?/g)) {
    if (m[2] || defined.has(m[1])) continue;
    const line = text.slice(0, m.index).split('\n').length;
    missing.push(`${relative(root, f)}:${line}  ${m[1]}`);
  }
}

if (missing.length) {
  console.error(`check-css-vars: ${missing.length} use(s) of undefined CSS variables:`);
  for (const m of missing) console.error(`  ${m}`);
  process.exit(1);
}
console.log(`check-css-vars: ok (${defined.size} variables defined, none undefined in use)`);
