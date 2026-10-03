import { useSyncExternalStore } from 'react';

// The theme lives on <html data-theme>, set before first paint by the inline script
// in index.html. Reading it through useSyncExternalStore keeps hydration exact: the
// server snapshot (light) matches the prerendered HTML, then React re-renders with
// the real value. A useState initializer that read the DOM would mismatch.
const subscribe = (onChange) => {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => mo.disconnect();
};
const getSnapshot = () => document.documentElement.getAttribute('data-theme') === 'dark';
const getServerSnapshot = () => false;

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  // Both media-scoped theme-color tags follow the chosen theme, not the OS setting.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#161618' : '#F6F5F0'));
  try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* private mode: theme just won't persist */ }
}

export default function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => {
    const next = !dark;
    // The attribute flips inside the transition callback, so the browser can
    // snapshot both themes and crossfade between them instead of snapping.
    const swap = () => applyTheme(next); // the attribute change re-renders this via the store
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !reduce) {
      // A transition is aborted (rejecting these promises) when the tab is hidden or
      // another one starts; the theme still swaps, so the rejection is just noise.
      const t = document.startViewTransition(swap);
      t.ready.catch(() => {});
      t.finished.catch(() => {});
    } else swap();
  };

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="theme-toggle"
      style={styles.btn}
    >
      <svg key={dark ? 'sun' : 'moon'} className="theme-toggle__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {dark ? (
          <>
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </>
        ) : (
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        )}
      </svg>
    </button>
  );
}

const styles = {
  btn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '7px',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-muted)',
    transition: 'color var(--dur) var(--ease), background-color var(--dur) var(--ease)',
    lineHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
