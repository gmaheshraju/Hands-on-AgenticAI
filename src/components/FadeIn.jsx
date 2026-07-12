import { useRef, useState, useEffect } from 'react';

export default function FadeIn({ children, delay = 0, className }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transition: `opacity 0.5s cubic-bezier(0.23, 1, 0.32, 1) ${delay}ms, transform 0.5s cubic-bezier(0.23, 1, 0.32, 1) ${delay}ms`,
        willChange: visible ? 'auto' : 'opacity, transform',
      }}
    >
      {children}
    </div>
  );
}
