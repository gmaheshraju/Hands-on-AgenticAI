#!/usr/bin/env node
// AI-slop guard for every page's prose.
//
// Scans the reader-facing text of every prerendered page (dist/**/index.html: posts,
// framework pages, indexes, work-with-me) for AI-tell clichés, structural tells and
// em-dash density, plus em-dashes in <title> and meta description. Run after build.
//
//   node scripts/check-slop.mjs            # report
//   node scripts/check-slop.mjs --strict   # exit 1 on a HIGH-signal cliché or em-dash overuse
//
// --strict fails on HIGH-signal clichés (the words a human tech writer does not reach
// for) and on any post whose em-dash density exceeds EMDASH_PER_1K_MAX. All 16 posts
// were rewritten to 0.3-6.6/1k on 2026-09-26 (from 11-23/1k); `npm run build` runs
// this in strict mode so the density cannot creep back unnoticed. Soft words are
// reported for judgment only.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

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

// Sentence shapes a careful human writer rarely repeats: the setup-and-knockdown
// contrast and its cousins. 36 were rewritten on 2026-10-04; any new one fails --strict.
const STRUCTURAL = {
  "isn't X. It's Y": /\b(isn'?t|is not|aren'?t|are not)\b[^.]{1,60}\. (It'?s|They'?re|This is|That'?s)\b/gi,
  "not X, it's Y": /\b(it'?s|this is|that'?s|is|isn'?t|was) not (just |only |merely )?[^.;:!?]{1,40}[,;—-]+ (it'?s|but|this is|that'?s)\b/gi,
  'not just X, but Y': /\bnot (just|only|merely)\b[^.]{1,50}\bbut\b/gi,
  'the real X is': /\bthe real (question|answer|problem|issue|lesson|reason|work|story|cost|test|win)\b/gi,
};

// Product names that collide with cliché words. Removed before matching, so the
// rule stays strict for prose: "Unleash" the feature-flag service is fine, "unleash" the verb is not.
const PROPER_NOUNS = [/\bUnleash\b(?=[ ,)])/g];

// Soft/overused. Reported, never a failure.
const SOFT = [
  'leverage', 'leveraging', 'robust', 'seamless', 'empower', 'utilize',
  'furthermore', 'moreover', 'holistic', 'synergy', 'paradigm', 'streamline',
];

// Em-dash density above this reads as machine-written. Fails --strict.
const EMDASH_PER_1K_MAX = 8;

const decode = (t) => t.replace(/&mdash;/g, '—').replace(/&#x27;|&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ');

function prose(html) {
  const m = html.match(/<main[\s\S]*?<\/main>/);
  // Code and diagrams are not prose: skip <pre>, <code> and inline <svg>.
  const t = (m ? m[0] : html).replace(/<(pre|code|svg)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ');
  return decode(t).replace(/\s+/g, ' ');
}

function meta(html) {
  const title = (html.match(/<title>([^<]*)/) || [])[1] || '';
  const desc = (html.match(/<meta name="description" content="([^"]*)/) || [])[1] || '';
  return decode(`${title} ${desc}`);
}

const pages = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'assets') walk(p); }
    else if (name === 'index.html') pages.push({ slug: '/' + relative(DIST, dir), html: readFileSync(p, 'utf8') });
  }
}
try { walk(DIST); } catch {
  console.error('check-slop: no dist/ — run `npm run build` first.');
  process.exit(2);
}
if (!pages.length) { console.error('check-slop: dist/ has no pages.'); process.exit(2); }
pages.sort((a, b) => a.slug.localeCompare(b.slug));

let totalHigh = 0;
const globalHigh = {};
const rows = [];

const structuralHits = [];
const metaDashes = [];
for (const { slug, html } of pages) {
  const text = prose(html);
  const lower = PROPER_NOUNS.reduce((t, re) => t.replace(re, ' '), text).toLowerCase();
  const words = (lower.match(/[a-z']+/g) || []).length || 1;
  const emdash = (text.match(/—/g) || []).length;

  let hi = 0; const hiHits = [];
  for (const p of HIGH) {
    const n = lower.split(p).length - 1;
    if (n) { hi += n; hiHits.push(`${p}×${n}`); globalHigh[p] = (globalHigh[p] || 0) + n; }
  }
  for (const [name, re] of Object.entries(STRUCTURAL)) {
    for (const m of text.matchAll(re)) {
      hi++; hiHits.push(`${name}: "${m[0]}"`); globalHigh[name] = (globalHigh[name] || 0) + 1;
      structuralHits.push(`${slug}: ${name}: "${m[0]}"`);
    }
  }
  if (meta(html).includes('—')) metaDashes.push(slug);
  let soft = 0;
  for (const p of SOFT) soft += lower.split(p).length - 1;

  totalHigh += hi;
  rows.push({ slug, words, hi, soft, emdash, per1k: emdash / words * 1000, hiHits });
}

console.log('\nAI-slop scan: dist/**/index.html  (HIGH clichés + structural tells · soft words · em-dash density)');
console.log('='.repeat(76));
console.log('page'.padEnd(36), 'HIGH'.padStart(5), 'soft'.padStart(5), 'em—/1k'.padStart(8));
for (const r of rows.sort((a, b) => b.hi - a.hi || b.per1k - a.per1k)) {
  const flag = r.per1k > EMDASH_PER_1K_MAX ? ' *' : '';
  console.log(r.slug.padEnd(36), String(r.hi).padStart(5), String(r.soft).padStart(5), r.per1k.toFixed(1).padStart(8) + flag);
  if (r.hiHits.length) console.log('     clichés:', r.hiHits.join(', '));
}

if (Object.keys(globalHigh).length) {
  console.log('\nHIGH-signal clichés found:');
  Object.entries(globalHigh).sort((a, b) => b[1] - a[1]).forEach(([p, n]) => console.log(`  ${String(n).padStart(3)}  ${p}`));
}
console.log(`\n  * em-dash density over ${EMDASH_PER_1K_MAX}/1k words (fails --strict).`);
console.log(`  HIGH-signal clichés total: ${totalHigh}`);
console.log(`  Titles/descriptions with an em-dash: ${metaDashes.length ? metaDashes.join(', ') : 'none'}`);

const dashy = rows.filter((r) => r.per1k > EMDASH_PER_1K_MAX);
if (process.argv.includes('--strict') && (totalHigh > 0 || dashy.length || metaDashes.length)) {
  for (const h of structuralHits) console.error(`check-slop: ${h}`);
  for (const m of metaDashes) console.error(`check-slop: ${m} has an em-dash in its <title> or meta description.`);
  if (totalHigh > 0) console.error(`\ncheck-slop: ${totalHigh} HIGH-signal cliché(s) found (--strict).`);
  for (const r of dashy) {
    console.error(`check-slop: ${r.slug} has ${r.per1k.toFixed(1)} em-dashes per 1k words (max ${EMDASH_PER_1K_MAX}). Rewrite them as periods, commas, colons or parentheses.`);
  }
  process.exit(1);
}
