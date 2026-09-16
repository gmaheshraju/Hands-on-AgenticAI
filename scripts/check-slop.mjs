#!/usr/bin/env node
// AI-slop guard for blog prose.
//
// Scans the reader-facing text of each prerendered post (dist/blog/*/index.html)
// for AI-tell clichés and reports em-dash density. Run it after `npm run build`.
//
//   node scripts/check-slop.mjs            # report
//   node scripts/check-slop.mjs --strict   # exit 1 if any HIGH-signal cliché is found
//
// --strict fails ONLY on HIGH-signal clichés (the words a human tech writer does
// not reach for). Em-dash density and soft words are reported for judgment, never
// a hard failure — de-em-dashing is a deliberate style decision, not a bug.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist', 'blog');

const HIGH = [
  'delve', 'delving', 'tapestry', 'fast-paced', 'ever-evolving', 'ever-changing',
  'worth noting', 'important to note', 'important to remember', 'in the realm of',
  'in the world of', 'navigating the complex', 'navigate the complex', 'unlock the power',
  'unleash', 'harness the power', 'game-changer', 'game changer', 'revolutioniz',
  'cutting-edge', 'state-of-the-art', 'at the end of the day', 'the key takeaway',
  'in conclusion', 'in summary', "let's dive in", 'elevate your', 'supercharge',
  'plethora', 'a myriad of', 'testament to', 'look no further', 'rest assured',
  'the beauty of', 'needless to say', 'first and foremost', 'in essence',
  'it goes without saying',
];

// Soft/overused. Reported, never a failure.
const SOFT = [
  'leverage', 'leveraging', 'robust', 'seamless', 'empower', 'utilize',
  'furthermore', 'moreover', 'holistic', 'synergy', 'paradigm', 'streamline',
];

// Em-dash density above this reads as machine-written. Informational only.
const EMDASH_PER_1K_WARN = 8;

function prose(html) {
  const m = html.match(/<main[\s\S]*?<\/main>/);
  let t = (m ? m[0] : html).replace(/<[^>]+>/g, ' ');
  t = t.replace(/&mdash;/g, '—').replace(/&[a-z#0-9]+;/gi, ' ');
  return t.replace(/\s+/g, ' ');
}

let dirs;
try {
  dirs = readdirSync(DIST).filter((d) => {
    try { readFileSync(join(DIST, d, 'index.html')); return true; } catch { return false; }
  }).sort();
} catch {
  console.error('check-slop: no dist/blog — run `npm run build` first.');
  process.exit(2);
}

let totalHigh = 0;
const globalHigh = {};
const rows = [];

for (const slug of dirs) {
  const text = prose(readFileSync(join(DIST, slug, 'index.html'), 'utf8'));
  const lower = text.toLowerCase();
  const words = (lower.match(/[a-z']+/g) || []).length || 1;
  const emdash = (text.match(/—/g) || []).length;

  let hi = 0; const hiHits = [];
  for (const p of HIGH) {
    const n = lower.split(p).length - 1;
    if (n) { hi += n; hiHits.push(`${p}×${n}`); globalHigh[p] = (globalHigh[p] || 0) + n; }
  }
  let soft = 0;
  for (const p of SOFT) soft += lower.split(p).length - 1;

  totalHigh += hi;
  rows.push({ slug, words, hi, soft, emdash, per1k: emdash / words * 1000, hiHits });
}

console.log('\nAI-slop scan — dist/blog/*  (HIGH clichés · soft words · em-dash density)');
console.log('='.repeat(76));
console.log('post'.padEnd(32), 'HIGH'.padStart(5), 'soft'.padStart(5), 'em—/1k'.padStart(8));
for (const r of rows.sort((a, b) => b.hi - a.hi || b.per1k - a.per1k)) {
  const flag = r.per1k > EMDASH_PER_1K_WARN ? ' *' : '';
  console.log(r.slug.padEnd(32), String(r.hi).padStart(5), String(r.soft).padStart(5), r.per1k.toFixed(1).padStart(8) + flag);
  if (r.hiHits.length) console.log('     clichés:', r.hiHits.join(', '));
}

if (Object.keys(globalHigh).length) {
  console.log('\nHIGH-signal clichés found:');
  Object.entries(globalHigh).sort((a, b) => b[1] - a[1]).forEach(([p, n]) => console.log(`  ${String(n).padStart(3)}  ${p}`));
}
console.log(`\n  * em-dash density over ${EMDASH_PER_1K_WARN}/1k words (informational).`);
console.log(`  HIGH-signal clichés total: ${totalHigh}`);

if (process.argv.includes('--strict') && totalHigh > 0) {
  console.error(`\ncheck-slop: ${totalHigh} HIGH-signal cliché(s) found (--strict).`);
  process.exit(1);
}
