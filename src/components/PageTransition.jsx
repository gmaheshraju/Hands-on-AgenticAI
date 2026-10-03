import { useLayoutEffect, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// useLayoutEffect warns during the prerender pass; there is no scroll position there anyway.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// New page renders immediately and eases in. There is deliberately no exit
// animation: holding the old page on screen for a fade-out made every click
// wait ~180ms before anything changed, which reads as slow, not smooth.
export default function PageTransition({ children }) {
  const { pathname, hash } = useLocation();

  // Start each new page at the top, before paint. 'instant' overrides the
  // global smooth scrolling, which would otherwise visibly scroll up the old height.
  useIsoLayoutEffect(() => {
    if (!hash) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, hash]);

  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  );
}
