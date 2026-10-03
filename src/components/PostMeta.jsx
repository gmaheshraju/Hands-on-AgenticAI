import { useLocation } from 'react-router-dom';
import META from '../data/postMeta.json';

// Reading time + last content update, generated at build time by scripts/post-meta.mjs.
// Formatted by hand, not toLocaleDateString: the prerender and the reader's browser
// must produce identical text or hydration fails.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (iso) => {
  const [y, m] = iso.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
};

export function metaFor(slug) {
  return META[slug] || null;
}

export function metaText(slug) {
  const m = META[slug];
  if (!m) return '';
  return m.updated ? `${m.minutes} min read · Updated ${monthYear(m.updated)}` : `${m.minutes} min read`;
}

// Inline, inside a post's eyebrow: "POST 15 · 14 MIN READ · UPDATED SEP 2026".
export default function PostMeta() {
  const { pathname } = useLocation();
  const text = metaText(pathname.replace(/^\/blog\//, ''));
  if (!text) return null;
  return <span className="post-meta"> · {text}</span>;
}
