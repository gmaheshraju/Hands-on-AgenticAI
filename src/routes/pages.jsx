import { use } from 'react';

// Route table + code-split page loading.
//
// Before this, every page (and every inlined diagram SVG) shipped in one 1.7 MB
// bundle, so reading one post meant downloading all 35 pages. Now each page is
// its own chunk:
//  - client: pages load on demand (lazy glob below); main.jsx loads the landing
//    page's chunk BEFORE the first render, so the prerendered HTML is replaced by
//    identical content with no loading flash; links prefetch on hover/focus.
//  - server (prerender): entry-server.jsx primes the cache with every page
//    eagerly, so renderToString never suspends and the static HTML stays complete.
//
// Pages are read through React 19's use(): a cached promise marked
// status 'fulfilled' is returned synchronously, without suspending.

const loaders = import.meta.glob(['../pages/*.jsx', '../pages/blog/*.jsx']);
const keyFor = (page) => `../pages/${page}.jsx`;

export const PAGE_ROUTES = [
  { path: '/', page: 'Blog' },
  { path: '/home', page: 'Home' },
  { path: '/database-selection', page: 'DatabaseSelection' },
  { path: '/rate-limiter', page: 'RateLimiter' },
  { path: '/caching', page: 'Caching' },
  { path: '/message-queues', page: 'MessageQueues' },
  { path: '/scaling', page: 'Scaling' },
  { path: '/event-driven', page: 'EventDriven' },
  { path: '/state-machines', page: 'StateMachines' },
  { path: '/api-design', page: 'ApiDesign' },
  { path: '/resilience', page: 'Resilience' },
  { path: '/observability', page: 'Observability' },
  { path: '/auth', page: 'AuthArchitecture' },
  { path: '/deployment', page: 'DeploymentStrategies' },
  { path: '/concurrency', page: 'Concurrency' },
  { path: '/distributed-systems', page: 'DistributedSystems' },
  { path: '/blog', page: 'Blog' },
  { path: '/diagrams', page: 'Diagrams' },
  { path: '/work-with-me', page: 'WorkWithMe' },
  { path: '/blog/ai-agent-system-design', page: 'blog/AgentSystemDesign' },
  { path: '/blog/agent-memory-architecture', page: 'blog/AgentMemory' },
  { path: '/blog/agent-harness-loop-engineering', page: 'blog/AgentHarness' },
  { path: '/blog/multi-agent-systems', page: 'blog/MultiAgentSystems' },
  { path: '/blog/rag-pipeline-deep-dive', page: 'blog/RagDeepDive' },
  { path: '/blog/llm-ops', page: 'blog/LlmOps' },
  { path: '/blog/ai-guardrails', page: 'blog/AiGuardrails' },
  { path: '/blog/evaluation-engineering', page: 'blog/EvalEngineering' },
  { path: '/blog/fine-tuning-vs-rag', page: 'blog/FineTuningVsRag' },
  { path: '/blog/tool-use-function-calling', page: 'blog/ToolUseFunctionCalling' },
  { path: '/blog/cost-latency-engineering', page: 'blog/CostLatencyEngineering' },
  { path: '/blog/ai-ux-patterns', page: 'blog/AiUxPatterns' },
  { path: '/blog/responsible-ai', page: 'blog/ResponsibleAi' },
  { path: '/blog/forward-deployed-engineering', page: 'blog/ForwardDeployedEngineering' },
  { path: '/blog/context-engineering', page: 'blog/ContextEngineering' },
  { path: '/blog/solo-developer-advantage', page: 'blog/SoloDeveloperAdvantage' },
];
export const NOT_FOUND_PAGE = 'NotFound';

export function pageForPath(pathname) {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PAGE_ROUTES.find((r) => r.path === clean)?.page ?? NOT_FOUND_PAGE;
}

const cache = new Map();

function settle(promise) {
  promise.then(
    (value) => { promise.status = 'fulfilled'; promise.value = value; },
    (reason) => { promise.status = 'rejected'; promise.reason = reason; },
  );
  return promise;
}

// Returns a promise of the page component; starts the download once, then reuses it.
export function loadPage(page) {
  let p = cache.get(page);
  if (!p) {
    const loader = loaders[keyFor(page)];
    if (!loader) throw new Error(`No page module for "${page}"`);
    p = settle(loader().then((m) => {
      try { sessionStorage.removeItem('chunk-reload'); } catch { /* storage blocked */ }
      return m.default;
    }, (err) => {
      // A tab opened before a deploy asks for chunk names the new deploy no longer
      // serves. Reload once onto the fresh HTML (the URL is already the target page);
      // the flag stops a reload loop if the chunk is genuinely unavailable.
      if (typeof window !== 'undefined') {
        let reloaded = true;
        try { reloaded = sessionStorage.getItem('chunk-reload') === '1'; sessionStorage.setItem('chunk-reload', '1'); } catch { /* storage blocked */ }
        if (!reloaded) { window.location.reload(); return new Promise(() => {}); }
      }
      cache.delete(page);
      throw err;
    }));
    cache.set(page, p);
  }
  return p;
}

// Server only: fill the cache from eagerly imported modules (see entry-server.jsx).
export function primePages(modules) {
  for (const [key, mod] of Object.entries(modules)) {
    const page = key.replace(/^\.\.\/pages\//, '').replace(/\.jsx$/, '');
    const p = Promise.resolve(mod.default);
    p.status = 'fulfilled';
    p.value = mod.default;
    cache.set(page, p);
  }
}

export function Page({ page }) {
  const Component = use(loadPage(page));
  return <Component />;
}
