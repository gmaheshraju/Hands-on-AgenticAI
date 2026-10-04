import { Link } from 'react-router-dom';
import FadeIn from '../components/FadeIn';
import HeroDiagram from '../components/HeroDiagram';
import AgentOrbit from '../components/orbit/AgentOrbit';
import { metaText } from '../components/PostMeta';
import { ROUTES } from '../seo/routes';
import { TOTALS } from '../data/diagrams';
import { AUTHOR_NAME, PROJECTS_REPO } from '../data/contact';
import { posts } from '../data/posts';
import { ReadMark } from '../components/ReadingMemory';

const track = (name) => window.clarity?.('event', name);

// Card descriptions come from the same place as each post's meta description,
// so the index can never drift from what search results and link previews say.
const descriptionFor = (slug) => ROUTES.find((r) => r.path === `/blog/${slug}`)?.description;

export default function Blog() {
  return (
    <div>
      <section className="hero-split" style={styles.hero}>
        <div className="hero-split__text">
          <Link
            to="/work-with-me"
            className="hero-pill rise"
            style={{ '--i': 0 }}
            onClick={() => track('home_pill_workwithme_click')}
          >
            <span className="hero-pill__dot" aria-hidden="true" />
            Consulting on production agent systems
            <span className="btn__arrow" aria-hidden="true">&rarr;</span>
          </Link>
          <h1 className="rise" style={{ ...styles.h1, '--i': 1 }}>
            Agentic AI<br />
            <em className="swash" style={styles.h1em}>
              Playbook
              <svg className="swash__line" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
                <path d="M3 8.5 C 48 3, 118 2.5, 197 6.5" />
              </svg>
            </em>
          </h1>
          <p className="rise" style={{ ...styles.tagline, '--i': 2 }}>
            Production architecture patterns for AI agents, RAG pipelines, and LLM systems, with real-world architecture diagrams and decision frameworks.
          </p>
          <p className="hero-by rise" style={{ '--i': 3 }}>
            <span className="nav__monogram" aria-hidden="true">M</span>
            <span>By <strong>{AUTHOR_NAME}</strong>, who builds AI agent systems that run in production unattended.</span>
          </p>
          <div className="hero-actions rise" style={{ '--i': 4 }}>
            <Link
              to="/blog/ai-agent-system-design"
              className="btn btn--primary"
              onClick={() => track('home_start_reading_click')}
            >
              Start reading <span className="btn__arrow" aria-hidden="true">&rarr;</span>
            </Link>
            <Link
              to="/work-with-me"
              className="btn btn--ghost"
              onClick={() => track('home_hero_workwithme_click')}
            >
              Work with me
            </Link>
          </div>
          <div className="proof-strip rise" style={{ '--i': 5 }}>
            <a href="#posts" className="proof-strip__item">
              <span className="proof-strip__num">{posts.length}</span>
              <span className="proof-strip__label">in-depth guides, each one a full system</span>
            </a>
            <a href={PROJECTS_REPO} target="_blank" rel="noopener noreferrer" className="proof-strip__item">
              <span className="proof-strip__num">31</span>
              <span className="proof-strip__label">open-source agent projects on GitHub</span>
            </a>
            <Link to="/diagrams" className="proof-strip__item">
              <span className="proof-strip__num">{TOTALS.count}</span>
              <span className="proof-strip__label">diagrams where every box cites its source line</span>
            </Link>
          </div>
        </div>
        <div className="hero-split__art rise" style={{ '--i': 2 }}>
          <AgentOrbit />
        </div>
      </section>

      <HeroDiagram />

      <section style={styles.postsSection}>
        <h2 id="posts" style={{ ...styles.sectionTitle, scrollMarginTop: 88 }}>Posts</h2>
        <div className="post-grid">
          {posts.map((p, i) => (
            <FadeIn key={p.slug} delay={(i % 4) * 40} className="post-grid__cell">
              <PostCard {...p} />
            </FadeIn>
          ))}
        </div>
      </section>
    </div>
  );
}

function PostCard({ slug, number, title, tags, ready, start }) {
  const Wrapper = ready ? Link : 'div';
  const wrapperProps = ready ? { to: `/blog/${slug}` } : {};

  return (
    <Wrapper {...wrapperProps} className="post-card" style={{ ...styles.card, opacity: ready ? 1 : 0.5 }}>
      <div style={styles.accent} />
      <div style={styles.content}>
        <div style={styles.header}>
          <span style={styles.numberRow}>
            <span style={styles.number}>{number}</span>
            {start && <span className="post-card__start">Start here</span>}
            <ReadMark path={`/blog/${slug}`} />
          </span>
          <h3 style={styles.title}>{title}</h3>
          {!ready && <span style={styles.soon}>Coming</span>}
        </div>
        {metaText(slug) && <p className="post-card__meta">{metaText(slug)}</p>}
        <p style={styles.subtitle}>{descriptionFor(slug)}</p>
        <div style={styles.meta}>
          {tags && (
            <div style={styles.tags}>
              {tags.map(t => (
                <span key={t} className="post-card__tag">{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      {ready && <span className="post-card__arrow" style={styles.arrow}>&rarr;</span>}
    </Wrapper>
  );
}

const styles = {
  hero: {
    marginBottom: '3.5rem',
    paddingBottom: '2.5rem',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--border)',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--text-accent)',
    letterSpacing: '0.08em',
    marginBottom: 12,
    textTransform: 'uppercase',
    fontFamily: 'var(--font-mono)',
  },
  h1: {
    fontSize: 'clamp(40px, 4.6vw, 64px)',
    fontWeight: 400,
    color: 'var(--text-h)',
    lineHeight: 1.08,
    marginBottom: 20,
    fontFamily: 'var(--font-display)',
    letterSpacing: '-0.02em',
  },
  h1em: {
    fontStyle: 'italic',
    color: 'var(--text-accent)',
  },
  tagline: {
    fontSize: 'clamp(16px, 1.25vw, 19px)',
    color: 'var(--text-p)',
    lineHeight: 1.65,
    marginBottom: 18,
    maxWidth: '62ch',
  },
  postsSection: {
    marginBottom: '3.5rem',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-muted)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 16,
    fontFamily: 'var(--font-mono)',
  },
  card: {
    display: 'flex',
    alignItems: 'stretch',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    textDecoration: 'none',
    transition: 'all var(--dur) var(--ease)',
    position: 'relative',
    overflow: 'hidden',
  },
  accent: {
    width: 3,
    flexShrink: 0,
    background: 'var(--bg-accent-strong)',
    borderRadius: '10px 0 0 10px',
  },
  content: {
    flex: 1,
    padding: '22px 44px 20px 22px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 10,
  },
  numberRow: { display: 'flex', alignItems: 'center', gap: 10 },
  number: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--text-accent)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.02em',
    flexShrink: 0,
  },
  title: {
    fontSize: 23,
    fontWeight: 400,
    color: 'var(--text-h)',
    lineHeight: 1.3,
    fontFamily: 'var(--font-display)',
    letterSpacing: '-0.01em',
  },
  soon: {
    fontSize: 10,
    color: 'var(--text-muted)',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    flexShrink: 0,
  },
  subtitle: {
    fontSize: 14.5,
    color: 'var(--text-p)',
    lineHeight: 1.6,
    marginBottom: 16,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
  },
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 5,
  },
  arrow: {
    position: 'absolute',
    top: 20,
    right: 18,
    fontSize: 16,
    color: 'var(--text-muted)',
    transition: 'transform var(--dur) var(--ease)',
    flexShrink: 0,
  },
};
