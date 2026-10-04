import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/fonts.css'
import './styles/global.css'
import App from './App.jsx'
import { loadPage, pageForPath, NOT_FOUND_PAGE } from './routes/pages'

// Canonical URLs have no trailing slash (see <link rel="canonical"> and the sitemap),
// and every page was prerendered under that form. The host also serves /path/ for
// /path, so a shared or typed "/blog/x/" used to hydrate with pathname "/blog/x/":
// every lookup keyed by path (post meta, framework detection, reading memory) missed,
// the client tree diverged from the prerendered HTML, and React threw #418 and
// re-rendered the page from scratch. Normalise once, here, before anything reads it.
{
  const { pathname, search, hash } = window.location;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    window.history.replaceState(window.history.state, '', pathname.replace(/\/+$/, '') + search + hash);
  }
}

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

const app = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// Hydrate the prerendered HTML instead of replacing it. Replacing it (createRoot)
// rebuilt every element once the bundle arrived, so entrance animations played a
// second time and images were re-decoded; hydration adopts the existing DOM.
//
// Unknown URLs are the exception: the host answers them with the front page's HTML
// (SPA fallback), which cannot match the 404 page React renders, so those get a
// fresh render instead of a hydration mismatch.
const page = pageForPath(window.location.pathname);
const render = () => {
  const root = document.getElementById('root');
  if (root.firstElementChild && page !== NOT_FOUND_PAGE) hydrateRoot(root, app);
  else createRoot(root).render(app);
};

// Load the landing page's chunk before the first render: React then renders the
// same content the prerendered HTML already shows, with no loading state between.
// If it cannot load, do not render at all: the prerendered page stays fully readable,
// which beats replacing it with an error. (loadPage already retried via one reload.)
loadPage(page).then(render, () => {});
