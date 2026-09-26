import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Nav from './Nav';
import PostFooterCTA from './PostFooterCTA';
import PostToc from './PostToc';

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
      if (!tabs || !e.target.closest('button')) return;
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

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const isBlogPost = pathname.startsWith('/blog/');
  const isIndex = pathname === '/' || pathname === '/blog';
  useTabScrollReset(isBlogPost);

  return (
    <>
      {isBlogPost && <ReadingProgress />}
      {isBlogPost && <PostToc />}
      <Nav />
      <main className={`layout-main${isBlogPost ? ' layout-main--post' : ''}${isIndex ? ' layout-main--wide' : ''}`}>
        {children}
        {isBlogPost && <PostFooterCTA />}
      </main>
      <footer className="footer">
        <div className="footer__inner">
          <span className="footer__mark">MG</span>
          <p className="footer__text">
            Built by Mahesh Guntumadugu. Decision frameworks from real production systems.
          </p>
        </div>
      </footer>
    </>
  );
}
