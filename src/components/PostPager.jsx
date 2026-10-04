import { Link, useLocation } from 'react-router-dom';
import { posts } from '../data/posts';
import { frameworks } from '../data/frameworks';
import { metaText } from './PostMeta';
import { useReadCount } from './ReadingMemory';

// Previous / next at the end of every post and framework page, in the same order
// as the index pages. Before this, finishing a post meant scrolling back up to the
// nav to find the next one.

const SERIES = [
  {
    name: 'Agentic AI Playbook',
    items: posts.filter((p) => p.ready).map((p) => ({ to: `/blog/${p.slug}`, number: p.number, title: p.title, slug: p.slug })),
  },
  {
    name: 'System Design Playbook',
    items: frameworks.filter((f) => f.ready).map((f) => ({ to: f.to, number: f.number, title: f.title, topics: f.tags.slice(0, 3).join(' · ') })),
  },
];

function find(pathname) {
  for (const s of SERIES) {
    const i = s.items.findIndex((it) => it.to === pathname);
    if (i !== -1) return { series: s, i };
  }
  return null;
}

function PagerCard({ item, dir, series }) {
  const meta = item.slug ? metaText(item.slug) : item.topics;
  return (
    <Link
      to={item.to}
      className={`pager__card pager__card--${dir}`}
      rel={dir}
      onClick={() => window.clarity?.('event', `pager_${dir}_click`)}
    >
      <span className="pager__dir">
        {dir === 'prev' ? <><span className="pager__arrow" aria-hidden="true">&larr;</span> Previous</> : <>Next <span className="pager__arrow" aria-hidden="true">&rarr;</span></>}
      </span>
      <span className="pager__title">
        <span className="pager__num">{item.number}</span> {item.title}
      </span>
      <span className="pager__meta">{meta || series.name}</span>
    </Link>
  );
}

function ReadCount({ paths }) {
  const n = useReadCount(paths);
  return n ? <span className="pager__read">{n} read &middot; </span> : null;
}

export default function PostPager() {
  const { pathname } = useLocation();
  const hit = find(pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);
  if (!hit) return null;
  const { series, i } = hit;
  const prev = series.items[i - 1];
  const next = series.items[i + 1];

  return (
    <nav className="pager" aria-label={`${series.name}: previous and next`}>
      <p className="pager__progress">
        <span>{series.name}</span>
        <span className="pager__count">
          <ReadCount paths={series.items.map((it) => it.to)} />
          {String(i + 1).padStart(2, '0')} / {String(series.items.length).padStart(2, '0')}
        </span>
      </p>
      <div className="pager__track" aria-hidden="true">
        <span className="pager__fill" style={{ width: `${((i + 1) / series.items.length) * 100}%` }} />
      </div>
      <div className="pager__grid">
        {prev ? <PagerCard item={prev} dir="prev" series={series} /> : <span />}
        {next ? <PagerCard item={next} dir="next" series={series} /> : (
          <Link to={series.items[0].to} className="pager__card pager__card--next">
            <span className="pager__dir">Back to the start <span className="pager__arrow" aria-hidden="true">&#8634;</span></span>
            <span className="pager__title"><span className="pager__num">{series.items[0].number}</span> {series.items[0].title}</span>
            <span className="pager__meta">That was the last one in the series</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
