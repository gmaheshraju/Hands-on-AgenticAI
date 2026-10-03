import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/global.css'
import App from './App.jsx'
import { loadPage, pageForPath } from './routes/pages'

let saved = null;
try { saved = localStorage.getItem('theme'); } catch { /* storage blocked: fall back to the OS setting */ }
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const theme = saved || (prefersDark ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', theme);
document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', theme === 'dark' ? '#161618' : '#F6F5F0'));

// Prefetch a page's chunk the moment a reader shows intent (hover, focus, touch),
// so the click itself navigates without waiting on the network.
const prefetch = (e) => {
  const a = e.target.closest?.('a[href^="/"]');
  if (!a) return;
  const { pathname } = new URL(a.href);
  try { loadPage(pageForPath(pathname)); } catch { /* unknown page: the router shows 404 */ }
};
document.addEventListener('pointerover', prefetch, { passive: true });
document.addEventListener('focusin', prefetch);
document.addEventListener('touchstart', prefetch, { passive: true });

const render = () =>
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );

// Load the landing page's chunk before the first render: React then renders the
// same content the prerendered HTML already shows, with no loading state between.
// If it cannot load, do not render at all: the prerendered page stays fully readable,
// which beats replacing it with an error. (loadPage already retried via one reload.)
loadPage(pageForPath(window.location.pathname)).then(render, () => {});
