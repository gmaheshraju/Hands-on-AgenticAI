import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

const links = [
  { to: '/home', label: 'Home' },
  { to: '/', label: 'AI Engineering' },
];

export default function Nav() {
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`nav${scrolled ? ' nav--scrolled' : ''}`}>
      <div className="nav__inner">
        <Link to="/" className="nav__brand">
          <span className="nav__monogram">M</span>
          <span className="nav__brand-text">System Design Playbook</span>
        </Link>

        <div className="nav__links">
          {links.map(l => (
            <Link
              key={l.to}
              to={l.to}
              className={`nav__link${
                l.to === '/'
                  ? (pathname === '/' || pathname.startsWith('/blog') ? ' nav__link--active' : '')
                  : (pathname === l.to || pathname.startsWith(l.to + '/')
                    ? ' nav__link--active' : '')
              }`}
            >
              {l.label}
            </Link>
          ))}
          <div className="nav__divider" />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
