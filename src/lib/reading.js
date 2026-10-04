import { useSyncExternalStore } from 'react';

// Per-reader reading memory, kept in this browser only (localStorage): how far each
// post or framework page has been read, and exactly where the reader stopped (tab +
// scroll), so the index pages can mark progress and offer "continue where you left off".
//
// Nothing leaves the browser. Storage can be blocked (private mode, strict settings):
// every access is wrapped, and the site behaves as for a first-time visitor.
//
// Hydration: the server snapshot is always empty, so prerendered HTML never contains
// progress; React re-renders with the stored state right after hydrating.

const KEY = 'ce:reading:v1';
const EVENT = 'ce:reading';
const EMPTY = Object.freeze({});
const MAX_AGE_DAYS = 120;

let cacheRaw = null;
let cache = EMPTY;

function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return EMPTY; }
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  try { cache = raw ? JSON.parse(raw) : EMPTY; } catch { cache = EMPTY; }
  return cache;
}

function save(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch { /* storage full or blocked: progress just is not remembered */ }
}

const subscribe = (onChange) => {
  const onStorage = (e) => { if (e.key === KEY) onChange(); };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onStorage); // other tabs
  return () => { window.removeEventListener(EVENT, onChange); window.removeEventListener('storage', onStorage); };
};

export function useReading() {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}

// pct: 0..1 progress through the whole page (tabs count as sequential chapters).
// done: reached the end of the last tab. tab/y: where to resume.
export function record(path, { pct, done, tab, y }) {
  const all = load();
  const prev = all[path] || {};
  const next = {
    pct: Math.max(prev.pct || 0, Math.round(pct * 100) / 100),
    done: Boolean(prev.done || done),
    tab,
    y: Math.round(y),
    t: Date.now(),
  };
  if (prev.pct === next.pct && prev.done === next.done && prev.tab === next.tab && Math.abs((prev.y || 0) - next.y) < 40) return;
  const cutoff = Date.now() - MAX_AGE_DAYS * 864e5;
  const pruned = Object.fromEntries(Object.entries(all).filter(([, v]) => v.t > cutoff));
  save({ ...pruned, [path]: next });
}

export function readEntry(path) {
  return load()[path] || null;
}

// Hide one item from the "continue" prompt until it is read again.
export function dismiss(path) {
  const all = load();
  if (!all[path]) return;
  save({ ...all, [path]: { ...all[path], dismissed: all[path].t } });
}

// The most recent page that was started but not finished, if any.
export function lastUnfinished(all, paths) {
  let best = null;
  for (const p of paths) {
    const e = all[p];
    if (!e || e.done || e.pct < 0.04 || e.dismissed === e.t) continue;
    if (!best || e.t > best.e.t) best = { path: p, e };
  }
  return best;
}
