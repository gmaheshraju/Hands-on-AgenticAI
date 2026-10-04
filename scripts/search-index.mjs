#!/usr/bin/env node
// Builds dist/search-index.json for the ⌘K search palette, from the prerendered pages.
//
// Reading the built HTML (not the JSX) means the index always matches what readers
// see: every page title, every section heading (h2) and every interview question
// (.decision__q), tagged with the tab it lives in so a result can open that tab.
// Runs after prerender in `npm run build`; the palette fetches the file on first open.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

// Card subtitles and tags carry words the headings do not ("CAP theorem" lives in the
// Distributed Systems card, not in any of its h2s). Plain-JS data modules, safe to import.
const { posts } = await import('../src/data/posts.js');
const { frameworks } = await import('../src/data/frameworks.js');
const KEYWORDS = Object.fromEntries([
  ...posts.map((p) => [`/blog/${p.slug}`, (p.tags || []).join(' ')]),
  ...frameworks.map((f) => [f.to, `${f.subtitle} ${(f.tags || []).join(' ')}`]),
]);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

const decode = (t) => t
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;|&rsquo;|&lsquo;/g, "'")
  .replace(/&ldquo;|&rdquo;/g, '"').replace(/&rsaquo;/g, '›').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ');
const text = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().replace(/^›\s*/, '');

function pagesIn(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'assets') pagesIn(p, out); }
    else if (name === 'index.html') out.push({ path: '/' + relative(DIST, dir), html: readFileSync(p, 'utf8') });
  }
  return out;
}

// Walk <main>'s tags with a depth counter. The .post-tabs row's following siblings
// are the tab panels, in order; anything found inside panel k belongs to tab k.
function sections(main) {
  const out = [];
  const tabs = [];
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  let depth = 0;
  let tabsDepth = -1, inTabs = false, panelDepth = -1, panel = -1, afterTabs = false;
  let capture = null; // { kind, start, depth }
  let m;
  while ((m = tagRe.exec(main))) {
    const [whole, close, rawName, attrs, selfClose] = m;
    const name = rawName.toLowerCase();
    if (!close) {
      const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
      if (afterTabs && depth === tabsDepth && panelDepth === -1) { panel++; panelDepth = depth; }
      if (/\bpost-tabs\b/.test(cls)) { tabsDepth = depth; inTabs = true; afterTabs = false; }
      if (inTabs && name === 'button') capture = { kind: 'tab', start: tagRe.lastIndex, depth };
      else if (!capture && name === 'h2') capture = { kind: 'h2', start: tagRe.lastIndex, depth };
      else if (!capture && /\bdecision__q\b/.test(cls)) capture = { kind: 'q', start: tagRe.lastIndex, depth };
      if (!VOID.has(name) && !selfClose) depth++;
    } else {
      depth--;
      if (capture && depth === capture.depth) {
        const t = text(main.slice(capture.start, m.index));
        if (t) {
          if (capture.kind === 'tab') tabs.push(t);
          else out.push({ type: capture.kind, h: t, tab: afterTabs && panel >= 0 && panel < tabs.length ? panel : null });
        }
        capture = null;
      }
      if (inTabs && depth === tabsDepth) { inTabs = false; afterTabs = true; }
      if (panelDepth !== -1 && depth === panelDepth) panelDepth = -1;
    }
    void whole;
  }
  return { tabs, items: out };
}

const pages = [];
const entries = [];
for (const { path, html } of pagesIn(DIST)) {
  if (path === '/blog') continue; // same page as '/'
  const main = (html.match(/<main[\s\S]*?<\/main>/) || [''])[0];
  const h1 = text((main.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
  if (!h1) continue;
  const desc = decode((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '');
  const kind = path.startsWith('/blog/') ? 'post' : /class="[^"]*layout-main--post/.test(html) ? 'framework' : 'page';
  const pi = pages.push({ p: path, t: h1, d: desc, k: kind, ...(KEYWORDS[path] ? { kw: KEYWORDS[path] } : {}) }) - 1;
  const { tabs, items } = sections(main);
  if (tabs.length) pages[pi].tabs = tabs;
  for (const it of items) entries.push([pi, it.type === 'q' ? 1 : 0, it.tab ?? -1, it.h]);
}

writeFileSync(join(DIST, 'search-index.json'), JSON.stringify({ v: 1, pages, entries }));
const kb = (Buffer.byteLength(JSON.stringify({ pages, entries })) / 1024).toFixed(0);
console.log(`search-index: ${pages.length} pages, ${entries.length} sections (${entries.filter((e) => e[1]).length} questions), ${kb} KB`);
