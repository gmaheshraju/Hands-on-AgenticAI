// Server/prerender only: import every page up front and prime the page cache, so
// renderToString renders full content synchronously instead of a Suspense fallback.
// The client never imports this file; it loads pages on demand.
import { primePages } from './pages.jsx';

primePages(import.meta.glob(['../pages/*.jsx', '../pages/blog/*.jsx'], { eager: true }));
