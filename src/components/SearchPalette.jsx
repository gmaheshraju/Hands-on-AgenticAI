import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useReading } from '../lib/reading';
import { onPage, clickTabQuietly } from './ReadingMemory';

// ⌘K / Ctrl+K (or "/") search over every page title, section heading and interview
// question on the site. The index is built from the prerendered HTML at build time
// (scripts/search-index.mjs) and fetched on first open, so it costs nothing until used.
// A section result opens the page on the right tab and scrolls to the heading
// (useJumpToSection, mounted in Layout).
//
// Accessibility: role="dialog" + combobox/listbox with aria-activedescendant, so focus
// stays in the input while arrow keys move through results.

let indexPromise = null;
function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch('/search-index.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .catch((e) => { indexPromise = null; throw e; });
  }
  return indexPromise;
}

const OPEN_EVENT = 'ce:search-open';
export const openSearch = () => window.dispatchEvent(new Event(OPEN_EVENT));

const KIND_LABEL = { post: 'Post', framework: 'Framework', page: 'Page' };
const norm = (s) => s.toLowerCase();
const terms = (q) => norm(q).split(/\s+/).filter(Boolean);

function score(hay, ts, head, need = ts.length) {
  // `need` terms must appear somewhere; terms in the heading/title and at word starts rank higher.
  let s = 0, hits = 0;
  for (const t of ts) {
    const i = hay.indexOf(t);
    if (i === -1) continue;
    hits++;
    const inHead = head.indexOf(t);
    s += inHead === -1 ? 1 : 4;
    if (inHead === 0) s += 3;
    else if (inHead > 0 && /\W/.test(head[inHead - 1])) s += 2;
  }
  return hits >= need ? s + hits * 3 : -1;
}

function search(index, q) {
  const ts = terms(q);
  if (!ts.length) return [];
  const run = (need) => {
    const pages = [];
    index.pages.forEach((p, i) => {
      const head = norm(p.t);
      const sc = score(`${head} ${norm(p.d)} ${norm(p.kw || '')}`, ts, head, need);
      if (sc >= 0) pages.push({ type: 'page', i, sc: sc + 6, p });
    });
    const secs = [];
    for (const [pi, isQ, tab, h] of index.entries) {
      const p = index.pages[pi];
      const head = norm(h);
      const sc = score(`${head} ${norm(p.t)}`, ts, head, need);
      // At least one term has to hit the heading itself, or a page-title match floods the list.
      if (sc >= 0 && ts.some((t) => head.includes(t))) secs.push({ type: 'section', sc: sc + (isQ ? 0 : 1), p, h, tab, isQ });
    }
    pages.sort((a, b) => b.sc - a.sc);
    secs.sort((a, b) => b.sc - a.sc);
    return [...pages.slice(0, 5), ...secs.slice(0, 40)];
  };
  const all = run(ts.length);
  if (all.length || ts.length === 1) return all;
  // No result has every word: show the best partial matches instead of a dead end.
  return run(Math.max(1, ts.length - 1)).map((r) => ({ ...r, partial: true }));
}

function Highlight({ text, q }) {
  const ts = terms(q).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!ts.length) return text;
  const parts = text.split(new RegExp(`(${ts.join('|')})`, 'gi'));
  return parts.map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}

export default function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [index, setIndex] = useState(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const lastFocus = useRef(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const reading = useReading();

  // Global shortcuts.
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(input|textarea|select)$/i.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === '/' && !typing && !open) { e.preventDefault(); setOpen(true); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_EVENT, onOpen); };
  }, [open]);

  // Open: remember focus, lock page scroll, load the index. Close: restore both.
  useEffect(() => {
    if (!open) return undefined;
    lastFocus.current = document.activeElement;
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    window.clarity?.('event', 'search_open');
    loadIndex().then(setIndex, () => setFailed(true));
    // Keep the last query visible but selected, so typing starts a fresh search.
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
    return () => {
      root.style.overflow = prevOverflow;
      lastFocus.current?.focus?.();
    };
  }, [open]);

  // Close on navigation.
  useEffect(() => { setOpen(false); }, [pathname]);

  const results = useMemo(() => (index && q.trim() ? search(index, q) : []), [index, q]);

  // Empty query: unfinished reading first, then where to start.
  const suggestions = useMemo(() => {
    if (!index) return [];
    const byPath = Object.fromEntries(index.pages.map((p) => [p.p, p]));
    const unfinished = Object.entries(reading)
      .filter(([path, e]) => byPath[path] && !e.done && e.pct >= 0.04)
      .sort((a, b) => b[1].t - a[1].t)
      .slice(0, 3)
      .map(([path, e]) => ({ type: 'page', p: byPath[path], note: `${Math.round(e.pct * 100)}% read`, resume: true }));
    const starts = ['/blog/ai-agent-system-design', '/database-selection', '/diagrams', '/work-with-me']
      .filter((p) => byPath[p] && !unfinished.some((u) => u.p.p === p))
      .map((p) => ({ type: 'page', p: byPath[p] }));
    return [...unfinished, ...starts];
  }, [index, reading]);

  const items = q.trim() ? results : suggestions;
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const go = (it) => {
    if (!it) return;
    window.clarity?.('event', it.type === 'section' ? 'search_section_open' : 'search_page_open');
    setOpen(false);
    if (it.type === 'section') navigate(it.p.p, { state: { jump: { tab: it.tab, h: it.h, t: it.p.t } } });
    else navigate(it.p.p, it.resume ? { state: { resume: true } } : undefined);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(items[active]); }
    else if (e.key === 'Tab') e.preventDefault(); // focus stays in the dialog
  };

  const status = failed ? 'Search could not load. Check your connection and try again.'
    : !index ? 'Loading…'
    : q.trim() && !results.length ? `Nothing matches “${q.trim()}”. Try a shorter or different word.`
    : null;

  let lastGroup = null;
  return (
    <div className="search" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="search__panel" role="dialog" aria-modal="true" aria-label="Search the site">
        <div className="search__bar">
          <svg className="search__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            ref={inputRef}
            className="search__input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search posts, frameworks, interview questions…"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={items.length ? `search-opt-${active}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck="false"
          />
          <kbd className="search__esc" onClick={() => setOpen(false)}>esc</kbd>
        </div>

        <ul className="search__list" id="search-results" role="listbox" ref={listRef} aria-label="Results">
          {items.map((it, i) => {
            const group = !q.trim() ? (it.resume ? 'Continue reading' : 'Start here') : it.partial ? 'Closest matches' : it.type === 'page' ? 'Pages' : 'Sections';
            const header = group !== lastGroup ? <li className="search__group" role="presentation">{group}</li> : null;
            lastGroup = group;
            const tabName = it.type === 'section' && it.tab >= 0 ? it.p.tabs?.[it.tab] : null;
            return [
              header,
              <li
                key={`${it.p.p}|${it.h || ''}|${i}`}
                id={`search-opt-${i}`}
                data-i={i}
                role="option"
                aria-selected={i === active}
                className={`search__item${i === active ? ' is-active' : ''}`}
                onMouseMove={() => setActive(i)}
                onClick={() => go(it)}
              >
                <span className={`search__badge search__badge--${it.type === 'section' ? (it.isQ ? 'q' : 'h') : it.p.k}`} aria-hidden="true">
                  {it.type === 'section' ? (it.isQ ? 'Q' : '§') : it.p.k === 'post' ? 'P' : it.p.k === 'framework' ? 'F' : '·'}
                </span>
                <span className="search__text">
                  <span className="search__title"><Highlight text={it.type === 'section' ? it.h : it.p.t} q={q} /></span>
                  <span className="search__sub">
                    {it.type === 'section'
                      ? <>{it.p.t}{tabName ? <> &rsaquo; {tabName.replace(/^\d+\s+/, '')}</> : null}</>
                      : it.note || `${KIND_LABEL[it.p.k]}${it.p.d ? ` · ${it.p.d}` : ''}`}
                  </span>
                </span>
                <span className="search__enter" aria-hidden="true">&crarr;</span>
              </li>,
            ];
          })}
          {status && <li className="search__status" role="presentation">{status}</li>}
        </ul>

        <div className="search__foot" aria-hidden="true">
          <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> move</span>
          <span><kbd>&crarr;</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
          <span className="search__count">{index ? `${index.entries.length} sections indexed` : ''}</span>
        </div>
      </div>
    </div>
  );
}

// Opening a section result: switch to its tab, then bring its heading under the
// sticky nav + tab row and flash it so the eye lands on it.
// The timer lives outside the effect on purpose: clearing the router state (replace)
// changes `state`, which re-runs the effect, and a cleanup-based clearTimeout would
// cancel the scroll it just scheduled.
let jumpTimer = 0;
export function useJumpToSection() {
  const { pathname, state } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const jump = state?.jump;
    if (!jump) return;
    navigate(pathname, { replace: true, state: null });
    window.clearTimeout(jumpTimer);
    // The page may still be loading its chunk (Suspense), so retry until its content
    // exists: first switch tabs, then find the heading in the now-visible panel.
    const started = Date.now();
    let tabDone = !(jump.tab >= 0);
    const want = jump.h.replace(/\s+/g, ' ').trim();
    const retry = (ms = 100) => { if (Date.now() - started < 4000) jumpTimer = window.setTimeout(attempt, ms); };
    function attempt() {
      if (jump.t && !onPage(jump.t)) return retry(); // new page not rendered yet
      if (!tabDone) {
        const tabs = [...document.querySelectorAll('.layout-main--post .post-tabs button')];
        if (!tabs[jump.tab]) return retry();
        clickTabQuietly(tabs[jump.tab]);
        tabDone = true;
        return retry(120);
      }
      const el = [...document.querySelectorAll('main h2, main .decision__q')].find(
        (n) => n.offsetParent !== null && n.textContent.replace(/\s+/g, ' ').trim().replace(/^›\s*/, '') === want,
      );
      if (!el) return retry();
      const nav = document.querySelector('.nav')?.offsetHeight ?? 0;
      const tabRow = document.querySelector('.layout-main--post .post-tabs')?.offsetHeight ?? 0;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - nav - tabRow - 20, behavior: reduce ? 'instant' : 'smooth' });
      el.classList.add('is-search-target');
      window.setTimeout(() => el.classList.remove('is-search-target'), 2200);
    }
    jumpTimer = window.setTimeout(attempt, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}
