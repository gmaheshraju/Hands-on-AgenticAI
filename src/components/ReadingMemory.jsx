import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useReading, record, dismiss, lastUnfinished, readEntry } from '../lib/reading';
import { posts } from '../data/posts';
import { frameworks } from '../data/frameworks';

// Reading memory UI: progress marks on index cards, a "continue where you left off"
// card on the index pages, and the tracker + resume logic for reading pages.
// State lives in src/lib/reading.js (this browser only).

const TITLES = Object.fromEntries([
  ...posts.map((p) => [`/blog/${p.slug}`, p.title]),
  ...frameworks.map((f) => [f.to, f.title]),
]);
const PATHS = Object.keys(TITLES);

const tabButtons = () => [...document.querySelectorAll('.layout-main--post .post-tabs button')];
const activeTab = (tabs) => Math.max(0, tabs.findIndex((b) => b.getAttribute('aria-selected') === 'true' || b.classList.contains('tab-nav__btn--active')));

// Records progress while a post or framework page is read, and restores tab + scroll
// when the page was opened from "continue reading" (location.state.resume).
export function useReadingTracker(enabled) {
  const { pathname, state } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled || !TITLES[pathname]) return undefined;
    let timer = 0;
    const measure = () => {
      timer = 0;
      const tabs = tabButtons();
      const n = tabs.length || 1;
      const k = tabs.length ? activeTab(tabs) : 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const frac = max > 0 ? Math.min(1, window.scrollY / max) : 1;
      const pager = document.querySelector('.pager');
      const atEnd = pager ? pager.getBoundingClientRect().top < window.innerHeight : frac > 0.9;
      record(pathname, { pct: Math.min(1, (k + frac) / n), done: k === n - 1 && atEnd, tab: k, y: window.scrollY });
    };
    const schedule = () => { if (!timer) timer = window.setTimeout(measure, 700); };
    window.addEventListener('scroll', schedule, { passive: true });
    document.addEventListener('click', schedule); // tab switches
    return () => {
      window.removeEventListener('scroll', schedule);
      document.removeEventListener('click', schedule);
      // No final measure here: cleanup runs after the next page has rendered, so it
      // would record the new page's scroll under this page's path.
      window.clearTimeout(timer);
    };
  }, [enabled, pathname]);

  useEffect(() => {
    if (!enabled || !state?.resume) return undefined;
    const entry = readEntry(pathname);
    // Drop the flag so back/forward or a reload does not jump again.
    navigate(pathname, { replace: true, state: null });
    if (!entry) return undefined;
    const tabs = tabButtons();
    if (entry.tab > 0 && tabs[entry.tab]) tabs[entry.tab].click();
    // Let the tab panel render and the tab-click scroll settle, then jump to the saved spot.
    const t = window.setTimeout(() => window.scrollTo({ top: entry.y || 0, behavior: 'instant' }), 120);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pathname]);
}

// Small mark on an index card: "42% read" or "Read".
export function ReadMark({ path }) {
  const all = useReading();
  const e = all[path];
  if (!e || (!e.done && e.pct < 0.04)) return null;
  return e.done ? (
    <span className="readmark readmark--done" title="You have read this">
      <span aria-hidden="true">&#10003;</span> Read
    </span>
  ) : (
    <span className="readmark" title="Your progress">
      <span className="readmark__bar" aria-hidden="true"><span style={{ width: `${Math.round(e.pct * 100)}%` }} /></span>
      {Math.round(e.pct * 100)}% read
    </span>
  );
}

// Count of read items in a list of paths (for the pager's series line).
export function useReadCount(paths) {
  const all = useReading();
  return paths.filter((p) => all[p]?.done).length;
}

// "Continue where you left off" card for returning readers, on the index pages.
export function ContinueCard() {
  const all = useReading();
  const [shown, setShown] = useState(false);
  const hit = lastUnfinished(all, PATHS);

  useEffect(() => {
    if (!hit) return undefined;
    const t = window.setTimeout(() => setShown(true), 900);
    return () => window.clearTimeout(t);
  }, [hit?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hit || !shown) return null;
  const pct = Math.round(hit.e.pct * 100);
  return (
    <aside className="resume" aria-label="Continue reading">
      <Link
        to={hit.path}
        state={{ resume: true }}
        className="resume__link"
        onClick={() => window.clarity?.('event', 'continue_reading_click')}
      >
        <span className="resume__kicker">Continue where you left off</span>
        <span className="resume__title">{TITLES[hit.path]}</span>
        <span className="resume__meta">
          <span className="readmark__bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
          {pct}% read
        </span>
      </Link>
      <button type="button" className="resume__close" aria-label="Dismiss" onClick={() => dismiss(hit.path)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </aside>
  );
}
