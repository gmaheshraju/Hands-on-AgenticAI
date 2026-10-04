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
    // Motion only, never a fade: text stays at full contrast in every phase. A dimmed
    // pre-reveal state (opacity 0.3) measured 1.5-1.9:1 in Lighthouse's accessibility
    // audit and left anchor or search jumps landing on faint text.
    : phase === 'hidden' ? { transform: 'translateY(14px)' }
    : {
        transform: 'none',
        transition: `transform 0.45s var(--ease) ${Math.min(delay, 120)}ms`,
      };

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
