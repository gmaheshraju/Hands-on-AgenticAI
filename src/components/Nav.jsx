import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import { openSearch } from './SearchPalette';
import { AUTHOR_NAME } from '../data/contact';
import { ROUTES } from '../seo/routes';

// Routes stay where they are (search engines and old links know them); only
// the labels changed. "/" is the AI playbook, "/home" is the system design one.
const links = [
  { to: '/', label: 'Playbook', short: 'Playbook' },
  { to: '/home', label: 'System Design', short: 'Systems' },
];

function isActive(to, pathname) {
  if (to === '/') return pathname === '/' || pathname.startsWith('/blog');
  // Framework pages live at top-level paths (/caching, ...) but belong to System Design.
  if (to === '/home') return pathname === '/home' || ROUTES.find((r) => r.path === pathname)?.kind === 'framework';
  return pathname === to || pathname.startsWith(to + '/');
}

export default function Nav() {
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const onWorkWithMe = pathname === '/work-with-me';

  return (
    <nav className={`nav${scrolled ? ' nav--scrolled' : ''}`}>
      <div className="nav__inner">
        <Link to="/" className="nav__brand">
          <span className="nav__monogram">M</span>
          <span className="nav__brand-text">{AUTHOR_NAME}</span>
        </Link>

        <div className="nav__links">
          {links.map(l => (
            <Link
              key={l.to}
              to={l.to}
              className={`nav__link${isActive(l.to, pathname) ? ' nav__link--active' : ''}`}
              aria-current={isActive(l.to, pathname) ? 'page' : undefined}
            >
              <span className="nav__label-long">{l.label}</span>
              <span className="nav__label-short">{l.short}</span>
            </Link>
          ))}
          <Link
            to="/work-with-me"
            className={`btn btn--sm nav__cta ${onWorkWithMe ? 'btn--ghost' : 'btn--primary'}`}
            aria-current={onWorkWithMe ? 'page' : undefined}
            onClick={() => window.clarity?.('event', 'nav_workwithme_click')}
          >
            Work with me
          </Link>
          <div className="nav__divider" />
          <button type="button" className="nav__search" onClick={openSearch} aria-label="Search (Command K)" aria-keyshortcuts="Meta+K Control+K /">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <kbd className="nav__kbd" aria-hidden="true">&#8984;K</kbd>
          </button>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
