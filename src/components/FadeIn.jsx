import { useRef, useState, useEffect, useLayoutEffect } from 'react';

// useLayoutEffect warns during the prerender pass; there is no layout to read there anyway.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// Reveal-on-scroll that never hides content the reader can already see.
//
// Phases: 'static' (visible, no transition) → 'hidden' → 'in'.
// Every element starts 'static', so the prerendered HTML and the first paint
// show real content. After hydration, only elements that are still below the
// fold are hidden (before paint, so nothing visible flickers) and revealed as
// they approach the viewport. Reduced-motion users stay 'static'.
export default function FadeIn({ children, delay = 0, className }) {
  const ref = useRef(null);
  const [phase, setPhase] = useState('static');

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setPhase('hidden');
  }, []);

  useEffect(() => {
    if (phase !== 'hidden') return;
    const el = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPhase('in');
          observer.disconnect();
        }
      },
      // Start well before the element enters (60% of a screen).
      { rootMargin: '0px 0px 60% 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [phase]);

  const style =
    phase === 'static' ? undefined
    // Never fully invisible: a scroll jump that outruns the observer lands on faint text, not a blank page.
    : phase === 'hidden' ? { opacity: 0.3, transform: 'translateY(10px)' }
    : {
        opacity: 1,
        transform: 'none',
        transition: `opacity 0.35s var(--ease) ${Math.min(delay, 120)}ms, transform 0.35s var(--ease) ${Math.min(delay, 120)}ms`,
      };

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
