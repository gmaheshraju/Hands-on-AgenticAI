import { useState, useEffect, useRef } from 'react';

export default function TabTransition({ activeKey, children }) {
  const [displayed, setDisplayed] = useState(children);
  const [phase, setPhase] = useState('visible');
  const prevKey = useRef(activeKey);

  useEffect(() => {
    if (activeKey === prevKey.current) {
      setDisplayed(children);
      return;
    }
    prevKey.current = activeKey;
    setPhase('fade-out');

    const timer = setTimeout(() => {
      setDisplayed(children);
      setPhase('fade-in');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase('visible'));
      });
    }, 150);

    return () => clearTimeout(timer);
  }, [activeKey, children]);

  return (
    <div className={`tab-transition tab-transition--${phase}`}>
      {displayed}
    </div>
  );
}
