import { useRef, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export default function PageTransition({ children }) {
  const location = useLocation();
  const [displayChildren, setDisplayChildren] = useState(children);
  const [stage, setStage] = useState('enter');
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname === prevPath.current) return;
    prevPath.current = location.pathname;
    setStage('exit');

    const timer = setTimeout(() => {
      setDisplayChildren(children);
      window.scrollTo(0, 0);
      setStage('enter');
    }, 180);

    return () => clearTimeout(timer);
  }, [location.pathname, children]);

  useEffect(() => {
    setDisplayChildren(children);
  }, [children]);

  return (
    <div className={`page-transition page-transition--${stage}`}>
      {displayChildren}
    </div>
  );
}
