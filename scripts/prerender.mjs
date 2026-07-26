// Build-time prerender.
//
// Vite emits a single index.html whose <body> is an empty <div id="root">, so
// every route served the same title, the same description and a canonical
// pointing at the homepage — telling Google that 31 pages were one page.
//
// This script renders each route with react-dom/server, rewrites the SEO tags
// in the document head, and writes dist/<route>/index.html. It also emits
// sitemap.xml. Run after `vite build` and `vite build --ssr`.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  ROUTES,
  SITE_URL,
  AUTHOR,
  OG_IMAGE,
  fullTitle,
  canonicalFor,
} from '../src/seo/routes.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');

const escapeAttr = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// `[^>]*` spans newlines, so these match the multi-line tags in index.html.
const replaceTag = (html, pattern, replacement) => {
  if (!pattern.test(html)) {
    throw new Error(`prerender: no match for ${pattern} — index.html changed shape`);
  }
  return html.replace(pattern, replacement);
};

function buildHead(html, route) {
  const title = escapeAttr(fullTitle(route));
  const description = escapeAttr(route.description);
  const canonical = canonicalFor(route);
  const isPost = route.path.startsWith('/blog/');

  let out = html;
  out = replaceTag(out, /<title>[^<]*<\/title>/, `<title>${title}</title>`);
  out = replaceTag(
    out,
    /<meta\s+name="description"[^>]*>/,
    `<meta name="description" content="${description}" />`,
  );
  out = replaceTag(
    out,
    /<link\s+rel="canonical"[^>]*>/,
    `<link rel="canonical" href="${canonical}" />`,
  );
  out = replaceTag(
    out,
    /<meta\s+property="og:url"[^>]*>/,
    `<meta property="og:url" content="${canonical}" />`,
  );
  out = replaceTag(
    out,
    /<meta\s+property="og:type"[^>]*>/,
    `<meta property="og:type" content="${isPost ? 'article' : 'website'}" />`,
  );
  out = replaceTag(
    out,
    /<meta\s+property="og:title"[^>]*>/,
    `<meta property="og:title" content="${title}" />`,
  );
  out = replaceTag(
    out,
    /<meta\s+property="og:description"[^>]*>/,
    `<meta property="og:description" content="${description}" />`,
  );
  out = replaceTag(
    out,
    /<meta\s+name="twitter:title"[^>]*>/,
    `<meta name="twitter:title" content="${title}" />`,
  );
  out = replaceTag(
    out,
    /<meta\s+name="twitter:description"[^>]*>/,
    `<meta name="twitter:description" content="${description}" />`,
  );

  // Article schema on posts, so each one can stand alone in search results
  // rather than inheriting only the site-level Person schema.
  if (isPost) {
    const articleLd = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: route.title,
      description: route.description,
      url: canonical,
      image: OG_IMAGE,
      author: { '@type': 'Person', name: AUTHOR, url: SITE_URL },
      publisher: { '@type': 'Person', name: AUTHOR, url: SITE_URL },
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    };
    out = out.replace(
      '</head>',
      `  <script type="application/ld+json">\n${JSON.stringify(articleLd, null, 2)}\n    </script>\n  </head>`,
    );
  }

  return out;
}

async function main() {
  const template = await readFile(join(distDir, 'index.html'), 'utf8');
  const { render } = await import(
    pathToFileURL(join(root, 'dist-ssr', 'entry-server.js')).href
  );

  let written = 0;
  const failures = [];

  for (const route of ROUTES) {
    let body;
    try {
      body = render(route.path);
    } catch (err) {
      failures.push(`${route.path}: ${err.message}`);
      continue;
    }

    if (!body || body.length < 200) {
      failures.push(`${route.path}: rendered only ${body?.length ?? 0} chars`);
      continue;
    }

    const html = buildHead(template, route).replace(
      '<div id="root"></div>',
      `<div id="root">${body}</div>`,
    );

    if (route.path === '/') {
      await writeFile(join(distDir, 'index.html'), html, 'utf8');
    } else {
      // Written twice on purpose. Static hosts disagree about how they resolve
      // an extension-less path: some look for <route>/index.html, others for
      // <route>.html, and vite preview's SPA fallback swallows the request
      // entirely unless one of them exists. Both files carry the same
      // canonical, so the duplication is invisible to search engines.
      const dirForm = join(distDir, route.path, 'index.html');
      await mkdir(dirname(dirForm), { recursive: true });
      await writeFile(dirForm, html, 'utf8');

      const flatForm = join(distDir, `${route.path}.html`);
      await mkdir(dirname(flatForm), { recursive: true });
      await writeFile(flatForm, html, 'utf8');
    }
    written += 1;
  }

  // Sitemap. Blog posts default to 0.9 so the agentic-AI pages outrank the
  // older system-design material when Google picks a representative page.
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = ROUTES.map((r) => {
    const priority = r.priority ?? (r.path.startsWith('/blog/') ? '0.9' : '0.7');
    const changefreq = r.changefreq ?? 'monthly';
    return `  <url>
    <loc>${canonicalFor(r)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
  }).join('\n');

  await writeFile(
    join(distDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
    'utf8',
  );

  if (failures.length) {
    console.error(`\nprerender: ${failures.length} route(s) failed:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(`prerender: ${written} routes -> dist/, sitemap.xml with ${ROUTES.length} urls`);
}

main().catch((err) => {
  console.error('prerender failed:', err);
  process.exit(1);
});
