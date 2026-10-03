// Writes src/data/postMeta.json: reading time and last content update for every post.
// Runs before `vite build` (see package.json), so the post index and post headers
// render the numbers into the prerendered HTML.
//
// Reading time: prose words estimated from each post's JSX source (code samples,
// SVG, styles and tag syntax stripped), at 220 words a minute. Checked against
// the prerendered prose of all 16 posts on 2026-10-03: estimate/actual 0.98-1.07.
//
// Updated: the date of the last commit that changed at least MIN_LINES lines of the
// post. Site-wide design commits touch every post by a line or two (a renamed back
// link, say) and must not make all 16 look freshly revised. Needs full git history:
// on a shallow clone (some CI builders) the dates already committed in the JSON are
// kept, and only reading times are recomputed.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const WPM = 220;
const MIN_LINES = 6;
const OUT = 'src/data/postMeta.json';

const routes = [...readFileSync('src/routes/pages.jsx', 'utf8')
  .matchAll(/\{ path: '\/blog\/([^']+)', page: 'blog\/([A-Za-z]+)' \}/g)]
  .map(([, slug, comp]) => ({ slug, file: `src/pages/blog/${comp}.jsx` }));
if (routes.length === 0) throw new Error('post-meta: no blog routes found in src/routes/pages.jsx');

const NOT_PROSE = new Set(('const return function export default useState setTab tab div className style styles key map ' +
  'true false null import from let var if else props children type green amber red blue Pill Decision Insight FadeIn ' +
  'CodeBlock delay hidden onClick SectionHead Link to href code output filename px em rem fontSize fontWeight color ' +
  'marginBottom padding border background').split(' '));

const decode = (s) => s
  .replace(/&(rarr|larr|rsquo|lsquo|ldquo|rdquo|mdash|ndash|amp|nbsp|middot|times|hellip);/g, ' ')
  .replace(/&#\d+;/g, ' ');

function proseWords(path) {
  let s = readFileSync(path, 'utf8');
  const cut = s.indexOf('\nconst styles');
  if (cut > 0) s = s.slice(0, cut);
  s = s
    .replace(/^import .*$/gm, '')
    .replace(/`[^`]*`/g, '') // template literals: code samples, inline SVG
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const props = [...s.matchAll(/(?:question|desc|title|tag|label)="([^"]*)"/g)].map((m) => m[1]).join(' ');
  s = s.replace(/<[^>]*>/g, ' ');
  const words = decode(`${s} ${props}`).match(/[A-Za-z][A-Za-z'’-]*/g) || [];
  return words.filter((w) => !NOT_PROSE.has(w)).length;
}

function git(args) {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}
const shallow = git(['rev-parse', '--is-shallow-repository']);
const haveHistory = shallow === 'false';

function lastContentUpdate(file) {
  // One block per commit: "@@<date>" then numstat lines "added<TAB>deleted<TAB>path".
  const log = git(['log', '--format=@@%cs', '--numstat', '--', file]);
  if (!log) return null;
  for (const block of log.split('@@').slice(1)) {
    const [date, ...lines] = block.trim().split('\n');
    const changed = lines.reduce((n, l) => {
      const [a, d] = l.split('\t');
      return n + (Number(a) || 0) + (Number(d) || 0);
    }, 0);
    if (changed >= MIN_LINES) return date;
  }
  return null;
}

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const meta = {};
for (const { slug, file } of routes) {
  const words = proseWords(file);
  meta[slug] = {
    minutes: Math.max(1, Math.round(words / WPM)),
    updated: (haveHistory && lastContentUpdate(file)) || previous[slug]?.updated || null,
  };
}

const json = `${JSON.stringify(meta, null, 2)}\n`;
if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== json) writeFileSync(OUT, json);
console.log(`post-meta: ${routes.length} posts${haveHistory ? '' : ' (shallow clone: kept committed dates)'}`);
