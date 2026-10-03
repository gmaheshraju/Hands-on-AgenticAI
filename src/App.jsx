import { useEffect, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { ROUTES, AUTHOR, fullTitle, canonicalFor } from './seo/routes';
import Layout from './components/Layout';
import PageTransition from './components/PageTransition';
import { PAGE_ROUTES, NOT_FOUND_PAGE, Page } from './routes/pages';
import PageErrorBoundary from './components/PageErrorBoundary';

// The prerendered HTML carries the right tags on first load, but client-side
// navigation never re-reads the head — without this the tab title and canonical
// stay stuck on whichever page the visitor landed on.
function useDocumentMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const route = ROUTES.find((r) => r.path === pathname);
    // No ROUTES entry means the catch-all rendered NotFound. Say so, rather
    // than leaving the previous page's title on a 404.
    if (!route) {
      document.title = `Page not found | ${AUTHOR}`;
      return;
    }

    document.title = fullTitle(route);
    document
      .querySelector('link[rel="canonical"]')
      ?.setAttribute('href', canonicalFor(route));
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', route.description);
  }, [pathname]);
}

export default function App() {
  useDocumentMeta();
  const { pathname } = useLocation();

  return (
    <Layout>
      <PageTransition>
      {/* Pages are code-split (src/routes/pages.jsx). The fallback only shows on a
          client navigation to a page whose chunk has not arrived yet; it holds the
          page height so the footer does not jump up. */}
      <PageErrorBoundary resetKey={pathname}>
      <Suspense fallback={<div style={{ minHeight: '70vh' }} aria-busy="true" />}>
      <Routes>
        {PAGE_ROUTES.map((r) => (
          <Route key={r.path} path={r.path} element={<Page page={r.page} />} />
        ))}
        <Route path="*" element={<Page page={NOT_FOUND_PAGE} />} />
      </Routes>
      </Suspense>
      </PageErrorBoundary>
      </PageTransition>
    </Layout>
  );
}
