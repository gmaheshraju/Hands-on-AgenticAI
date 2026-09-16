#!/usr/bin/env node
// Freshness guard for blog content.
//
// Volatile facts — model prices, context-window sizes, "as of <date>" claims,
// and prior-generation model names — go stale silently. A reviewer catches them
// months later, or an interviewer does. This script makes them greppable now.
//
// It is REPORT-ONLY by default (exit 0). Pass --strict to exit 1 when anything
// is found, so it can gate a build or CI step once the content is clean.
//
// It flags candidates, not confirmed errors: an "illustrative" price in a code
// sample is a legitimate match. A human decides. The point is that nothing
// drift-prone stays invisible.
//
//   node scripts/check-freshness.mjs
//   node scripts/check-freshness.mjs --strict

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = join(__dirname, '..', 'src', 'pages', 'blog');

// Prior-generation model names + hardware. These are unambiguously not the
// current frontier as of this file's last edit. Keep this list short and
// certain — add a name only once it is clearly superseded.
const STALE_MODELS = [
  'gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-4',
  'claude-3.5', 'claude-3-5', 'claude 3.5', 'claude-3-opus', 'claude-2',
  'gemini-1.5', 'gemini 1.5', 'gemini-pro',
  'llama-3', 'llama 3', 'llama-2',
  'text-embedding-3', 'embed-v3', 'bge-large', 'bge-reranker-v2',
  '8xA100', '8x A100', 'A100',
];

const CATEGORIES = [
  {
    id: 'price',
    label: 'Hardcoded price (drifts every model release)',
    // $1/1M, $5 / 1M, $0.25 per million, $3/M, $0.50 per 1K
    re: /\$\d[\d.,]*\s*(?:\/|per)\s*(?:1[\s,]?0{3,}|1M|M\b|million|1K|K\b)/gi,
  },
  {
    id: 'context',
    label: 'Hardcoded context window (drifts as windows grow)',
    re: /\b(?:\d{2,4}K|1M|2M)\s*(?:-?\s*token|tokens?|context|window|ctx)\b/gi,
  },
  {
    id: 'date',
    label: 'Date-anchored claim (reads stale on sight)',
    re: /\bas of\b[^.<>]*\b20\d{2}\b|\bin\s+20(?:24|25|27)\b|\bmid-?20(?:24|25)\b/gi,
  },
  {
    id: 'model',
    label: 'Prior-generation model / hardware name',
    re: new RegExp(
      '\\b(' + STALE_MODELS.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b',
      'gi',
    ),
  },
];

const files = readdirSync(BLOG_DIR).filter((f) => f.endsWith('.jsx')).sort();

let total = 0;
const perFile = new Map();

for (const file of files) {
  const lines = readFileSync(join(BLOG_DIR, file), 'utf8').split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    for (const cat of CATEGORIES) {
      cat.re.lastIndex = 0;
      let m;
      while ((m = cat.re.exec(line)) !== null) {
        hits.push({ line: i + 1, cat: cat.id, match: m[0].trim() });
        if (m.index === cat.re.lastIndex) cat.re.lastIndex++; // guard zero-width
      }
    }
  });
  if (hits.length) {
    perFile.set(file, hits);
    total += hits.length;
  }
}

const byCat = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));

console.log('\nContent freshness scan — src/pages/blog/*.jsx');
console.log('='.repeat(60));

for (const [file, hits] of perFile) {
  console.log(`\n${file}  (${hits.length})`);
  for (const h of hits.sort((a, b) => a.line - b.line)) {
    byCat[h.cat]++;
    console.log(`  L${String(h.line).padEnd(5)} [${h.cat.padEnd(7)}] ${h.match}`);
  }
}

console.log('\n' + '='.repeat(60));
console.log('By category:');
for (const cat of CATEGORIES) {
  console.log(`  ${cat.id.padEnd(8)} ${String(byCat[cat.id]).padStart(3)}  — ${cat.label}`);
}
console.log(`\n  TOTAL candidates: ${total} across ${perFile.size} files`);
console.log('\n  These are candidates, not confirmed errors. Review each; move the');
console.log('  durable ones behind a shared facts module so one edit updates all.\n');

const strict = process.argv.includes('--strict');
if (strict && total > 0) {
  console.error(`check-freshness: ${total} candidate(s) found (--strict).`);
  process.exit(1);
}
