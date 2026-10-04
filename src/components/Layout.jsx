import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Nav from './Nav';
import PostFooterCTA from './PostFooterCTA';
import PostPager from './PostPager';
import PostToc from './PostToc';
import { AUTHOR_NAME, EMAIL, GITHUB, LINKEDIN, PROJECTS_REPO } from '../data/contact';
import { ROUTES } from '../seo/routes';

// Scroll progress for long posts. Written straight to the DOM once per frame
// (transform, not width) so scrolling never re-renders React or triggers layout.
function ReadingProgress() {
  const barRef = useRef(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      if (barRef.current) barRef.current.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={barRef} className="reading-progress" aria-hidden="true" />;
}

// Post tabs are sticky. When a reader switches tabs from further down the page,
// bring the start of the new tab into view instead of leaving them mid-content.
function useTabScrollReset(enabled) {
  useEffect(() => {
    if (!enabled) return;
    const onClick = (e) => {
      const tabs = e.target.closest?.('.post-tabs');
      const btn = e.target.closest?.('button');
      if (!tabs || !btn) return;
      // On phones the tab row scrolls sideways: keep the chosen tab fully in view.
      if (tabs.scrollWidth > tabs.clientWidth) {
        tabs.scrollTo({ left: btn.offsetLeft - tabs.clientWidth / 2 + btn.offsetWidth / 2, behavior: 'smooth' });
      }
      // Wait one frame so React has swapped the visible panel.
      requestAnimationFrame(() => {
        let panel = tabs.nextElementSibling;
        while (panel && panel.hidden) panel = panel.nextElementSibling;
        if (!panel) return;
        const offset = (document.querySelector('.nav')?.offsetHeight ?? 0) + tabs.offsetHeight + 12;
        const top = panel.getBoundingClientRect().top;
        if (top < offset) window.scrollTo({ top: window.scrollY + top - offset, behavior: 'smooth' });
      });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [enabled]);
}

// Card spotlight: one delegated listener writes the pointer position into the
// hovered card's --mx/--my (see CARD SPOTLIGHT in global.css). Mouse only.
function useCardSpotlight() {
  useEffect(() => {
    const onMove = (e) => {
      if (e.pointerType !== 'mouse') return;
      const card = e.target.closest?.('.post-card, .fc');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => document.removeEventListener('pointermove', onMove);
  }, []);
}

export default function Layout({ children }) {
  const { pathname } = useLocation();
  // Long-form pages (blog posts and System Design frameworks) share one reading layout.
  const isReading =
    pathname.startsWith('/blog/') || ROUTES.find((r) => r.path === pathname)?.kind === 'framework';
  const isIndex = pathname === '/' || pathname === '/blog';
  useTabScrollReset(isReading);
  useCardSpotlight();

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      {isReading && <ReadingProgress />}
      {isReading && <PostToc />}
      <Nav />
      <main id="main" className={`layout-main${isReading ? ' layout-main--post' : ''}${isIndex ? ' layout-main--wide' : ''}`}>
        {children}
        {isReading && <PostPager />}
        {isReading && <PostFooterCTA />}
      </main>
      <Footer />
    </>
  );
}

function Footer() {
  const ext = { target: '_blank', rel: 'noopener noreferrer' };
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__grid">
          <div className="footer__who">
            <span className="nav__monogram" aria-hidden="true">M</span>
            <div>
              <p className="footer__name">{AUTHOR_NAME}</p>
              <p className="footer__text">
                I build AI agent systems that run in production unattended, and write down
                the decisions behind them here.
              </p>
              <Link
                to="/work-with-me"
                className="link-draw"
                onClick={() => window.clarity?.('event', 'footer_workwithme_click')}
              >
                Work with me &rarr;
              </Link>
            </div>
          </div>

          <nav aria-label="Read">
            <p className="footer__heading">Read</p>
            <ul className="footer__links">
              <li><Link to="/">Agentic AI Playbook</Link></li>
              <li><Link to="/home">System Design Playbook</Link></li>
              <li><Link to="/diagrams">Architecture diagrams</Link></li>
              <li><a href={PROJECTS_REPO} {...ext}>31 projects on GitHub</a></li>
            </ul>
          </nav>

          <nav aria-label="Connect">
            <p className="footer__heading">Connect</p>
            <ul className="footer__links">
              <li><a href={`mailto:${EMAIL}`}>Email</a></li>
              <li><a href={LINKEDIN} {...ext}>LinkedIn</a></li>
              <li><a href={GITHUB} {...ext}>GitHub</a></li>
            </ul>
          </nav>
        </div>

        <div className="footer__bottom">
          {/* Build year in the prerender; a January visit to a December build would differ. */}
          <span suppressHydrationWarning>&copy; {new Date().getFullYear()} {AUTHOR_NAME}</span>
          <span>Decision frameworks from real production systems.</span>
        </div>
      </div>
    </footer>
  );
}
