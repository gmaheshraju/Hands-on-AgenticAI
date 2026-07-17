import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Nav from './Nav';

function ReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docHeight > 0 ? (scrollTop / docHeight) * 100 : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (progress < 1) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: `${progress}%`,
      height: 2,
      background: 'var(--bg-accent-strong)',
      zIndex: 200,
      transition: 'width 0.1s linear',
    }} />
  );
}

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const isBlogPost = pathname.startsWith('/blog/');

  return (
    <>
      {isBlogPost && <ReadingProgress />}
      <Nav />
      <main className="layout-main">
        {children}
      </main>
      <footer className="footer">
        <div className="footer__inner">
          <span className="footer__mark">MG</span>
          <p className="footer__text">
            Built by Mahesh Guntumadugu — decision frameworks from real-world production systems.
          </p>
        </div>
      </footer>
    </>
  );
}
