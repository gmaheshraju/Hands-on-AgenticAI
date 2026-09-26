import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

// "On this page" rail for wide screens. It reads the DOM of the post rather than
// asking each of the 16 posts to declare its outline: the entries are the section
// headings (h2) and Decision questions of whichever tab panel is visible, so it
// stays correct as posts change and follows the reader across tab switches.

const WIDE = '(min-width: 1360px)';

function visibleRoot() {
  const page = document.querySelector('.layout-main--post .page-content');
  if (!page) return null;
  const tabs = page.querySelector(':scope > .post-tabs');
  if (!tabs) return page;
  let p = tabs.nextElementSibling;
  while (p && p.hidden) p = p.nextElementSibling;
  return p;
}

function readEntries(root) {
  return [...root.querySelectorAll('h2, .decision__q')]
    .filter((el) => el.offsetParent !== null)
    .map((el, i) => {
      if (!el.id) el.id = `sec-${i}-${el.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)}`;
      return { id: el.id, text: el.textContent.replace(/^›\s*/, '').trim(), level: el.tagName === 'H2' ? 1 : 2 };
    });
}

export default function PostToc() {
  const { pathname } = useLocation();
  const [entries, setEntries] = useState([]);
  const [active, setActive] = useState(null);
  const [pos, setPos] = useState(null); // { left, show }
  const rootRef = useRef(null);

  // Rebuild the outline on route change and whenever a tab panel is shown or hidden.
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    let mo;
    const rebuild = () => {
      const root = visibleRoot();
      rootRef.current = root;
      setEntries(root && mq.matches ? readEntries(root) : []);
    };
    const t = setTimeout(rebuild, 0);
    const page = document.querySelector('.layout-main--post .page-content');
    if (page) {
      mo = new MutationObserver(rebuild);
      mo.observe(page, { attributes: true, attributeFilter: ['hidden'], subtree: true });
    }
    mq.addEventListener('change', rebuild);
    return () => { clearTimeout(t); mo?.disconnect(); mq.removeEventListener('change', rebuild); };
  }, [pathname]);

  // Position beside the column, show once the reader reaches the content, track the active entry.
  useEffect(() => {
    if (!entries.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const page = document.querySelector('.layout-main--post .page-content');
      const root = rootRef.current;
      if (!page || !root) return;
      const r = page.getBoundingClientRect();
      const offset = (document.querySelector('.nav')?.offsetHeight ?? 0)
        + (page.querySelector(':scope > .post-tabs')?.offsetHeight ?? 0) + 24;
      const rootRect = root.getBoundingClientRect();
      setPos({ left: r.right + 56, show: rootRect.top < window.innerHeight * 0.6 && rootRect.bottom > offset + 80 });
      // Active = the last entry that has entered the top quarter of the reading area.
      const line = offset + (window.innerHeight - offset) * 0.25;
      let current = entries[0]?.id;
      for (const e of entries) {
        const el = document.getElementById(e.id);
        if (el && el.getBoundingClientRect().top < line) current = e.id;
      }
      setActive(current);
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
  }, [entries]);

  if (entries.length < 3 || !pos) return null;

  const go = (id) => (e) => {
    e.preventDefault();
    const el = document.getElementById(id);
    const page = document.querySelector('.layout-main--post .page-content');
    const offset = (document.querySelector('.nav')?.offsetHeight ?? 0)
      + (page?.querySelector(':scope > .post-tabs')?.offsetHeight ?? 0) + 16;
    if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - offset, behavior: 'smooth' });
  };

  return (
    <nav
      className={`post-toc${pos.show ? ' post-toc--show' : ''}`}
      style={{ left: pos.left }}
      aria-label="On this page"
    >
      <p className="post-toc__title">On this page</p>
      <ol className="post-toc__list">
        {entries.map((e) => (
          <li key={e.id} className={`post-toc__item post-toc__item--l${e.level}${active === e.id ? ' is-active' : ''}`}>
            <a href={`#${e.id}`} onClick={go(e.id)}>{e.text}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
